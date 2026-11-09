#requires -Version 5.1
# ВАЖНО: файл должен быть сохранён как UTF-8 with BOM.
# Windows PowerShell 5.1 без BOM читает кириллицу, символы брайля и блочную
# псевдографику как ANSI — баннер, рамки и спиннер превращаются в мусор.
<#
.SYNOPSIS
    NEXUS release pipeline для Windows PowerShell 5.1+.

.DESCRIPTION
    Премиальная консольная обёртка над npm-скриптами проекта NEXUS:
    stop -> typecheck -> lint -> format:check -> test -> build -> deploy.

    Шаги выполняются через System.Diagnostics.Process с асинхронным
    чтением stdout/stderr (OutputDataReceived / ErrorDataReceived).
    Вывод npm стримится построчно, без буферизации job-движком.
    Спиннер, прогресс-бар и HUD анимируются отдельным таймером.

.PARAMETER InWindow
    Внутренний флаг: скрипт уже запущен в отдельном окне.

.PARAMETER Dev
    После пайплайна запустить npm run dev (tsx watch) вместо npm run start.

.PARAMETER SkipDeploy
    Не выполнять шаг deploy.

.PARAMETER ChecksOnly
    Прогнать проверки и сборку, но не запускать бота.

.PARAMETER NoNewWindow
    Не открывать новое окно, работать в текущем.

.PARAMETER NoBanner
    Не очищать экран и не рисовать ASCII-баннер.

.EXAMPLE
    npm run launch

.EXAMPLE
    npm run launch:dev

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/launch.ps1 -ChecksOnly -SkipDeploy -NoNewWindow -NoBanner
#>
param(
    [switch]$InWindow,
    [switch]$Dev,
    [switch]$SkipDeploy,
    [switch]$ChecksOnly,
    [switch]$NoNewWindow,
    [switch]$NoBanner
)

# ===========================================================================
# 0. Инициализация, пути, логирование
# ===========================================================================
$ErrorActionPreference = 'Stop'

$script:root = if ($PSScriptRoot) {
    Split-Path -Parent $PSScriptRoot
} else {
    Split-Path -Parent $MyInvocation.MyCommand.Path
}
if (-not $script:root) { $script:root = (Get-Location).Path }
Set-Location -LiteralPath $script:root

$script:launchLog = Join-Path $script:root 'data\launch.log'
$script:step = 0
$script:totalSteps = if ($SkipDeploy) { 6 } else { 7 }
$script:failures = New-Object System.Collections.ArrayList
$script:esc = [char]27
$script:spinFrames = @('⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏')
$script:canceled = $false
$script:interruptSupported = $false

$script:useTrueColor = [bool](
    $env:WT_SESSION -or
    ($env:COLORTERM -match 'truecolor|24bit') -or
    ($env:TERM_PROGRAM -eq 'vscode')
)

$script:interactive = $true
try { $script:interactive = -not [Console]::IsOutputRedirected } catch { }

# В CI/редиректе не засоряем логи ANSI-последовательностями.
$script:colorEnabled = $script:interactive -or [bool]$env:FORCE_COLOR -or [bool]$env:CLICOLOR_FORCE

# --- Состояние нижнего UI (фиксированная строка прогресса) ------------------
$script:uiReady = $false
$script:uiTop = 0
$script:uiWidth = 79
$script:uiHeight = 25
$script:stepRow = 0
$script:barRow = 0
$script:logRow = 0
$script:stepLine = ''
$script:barLine = ''
$script:lastStepDraw = ''
$script:lastBarDraw = ''
$script:liveMode = 'PRODUCTION'

function Write-LaunchLog {
    param([string]$Message)

    try {
        $dir = Split-Path -Parent $script:launchLog
        if (-not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }
    } catch {
        return
    }

    # Ротация: не даём launch.log расти бесконечно. Ошибка ротации не критична.
    try {
        if (Test-Path -LiteralPath $script:launchLog) {
            $logItem = Get-Item -LiteralPath $script:launchLog -ErrorAction Stop
            if ($logItem.Length -gt 5MB) {
                Move-Item -LiteralPath $script:launchLog -Destination ($script:launchLog + '.1') -Force -ErrorAction Stop
            }
        }
    } catch {
        # Файл занят или переименование не удалось — продолжаем писать в текущий.
    }

    try {
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -LiteralPath $script:launchLog -Value ("[{0}] {1}" -f $stamp, $Message) -Encoding UTF8
    } catch {
        # Логирование не должно ломать сам запуск.
    }
}

Write-LaunchLog ("=== launch start: InWindow={0} Dev={1} SkipDeploy={2} ChecksOnly={3} NoNewWindow={4} NoBanner={5} cwd={6} ===" -f $InWindow, $Dev, $SkipDeploy, $ChecksOnly, $NoNewWindow, $NoBanner, (Get-Location))

# ---------------------------------------------------------------------------
# Глобальный trap: любая терминирующая ошибка -> сообщение, стек, лог, exit 1
# ---------------------------------------------------------------------------
trap {
    $message = "LAUNCH ERROR: $($_.Exception.Message)"
    $stack = $_.ScriptStackTrace

    if (Get-Command Hide-Ui -ErrorAction SilentlyContinue) { Hide-Ui }

    Write-Host ''
    Write-Host '  ✖ LAUNCH ERROR' -ForegroundColor Red
    Write-Host ('  ' + $_.Exception.Message) -ForegroundColor Red
    if ($stack) { Write-Host $stack -ForegroundColor DarkGray }

    Write-LaunchLog $message
    if ($stack) { Write-LaunchLog $stack }

    if ($InWindow) {
        Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null
    }
    exit 1
}

# ===========================================================================
# 1. npm, палитра, VT, перехват Ctrl+C
# ===========================================================================
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npmCmd) {
    throw 'npm не найден в PATH. Установи Node.js 22+ и перезапусти терминал.'
}
$npm = if ($npmCmd.Path) { $npmCmd.Path } else { $npmCmd.Source }

# 16-цветная палитра для fallback-режима (RGB -> ближайший ANSI-код)
$script:ansiPalette = @(
    @(30,   0,   0,   0),
    @(31, 205,  49,  49),
    @(32,  13, 188, 121),
    @(33, 229, 229,  16),
    @(34,  36, 114, 200),
    @(35, 188,  63, 188),
    @(36,  17, 168, 205),
    @(37, 229, 229, 229),
    @(90, 102, 102, 102),
    @(91, 241,  76,  76),
    @(92,  35, 209, 139),
    @(93, 245, 245,  67),
    @(94,  59, 142, 234),
    @(95, 214, 112, 214),
    @(96,  41, 184, 219),
    @(97, 255, 255, 255)
)

if (-not $script:useTrueColor) {
    try {
        if (-not ('Nexus.ConsoleMode' -as [type])) {
            Add-Type -Namespace Nexus -Name ConsoleMode -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)]
public static extern IntPtr GetStdHandle(int nStdHandle);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

[DllImport("kernel32.dll", SetLastError = true)]
public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
'@
        }
        $handle = [Nexus.ConsoleMode]::GetStdHandle(-11)
        [uint32]$mode = 0
        if ([Nexus.ConsoleMode]::GetConsoleMode($handle, [ref]$mode)) {
            [Nexus.ConsoleMode]::SetConsoleMode($handle, [uint32]($mode -bor 0x0004)) | Out-Null
        }
    } catch {
        # Если включить VT не удалось — остаётся обычный вывод без цвета.
    }
}

# Ctrl+C перехватывается на уровне консоли. Обработчик — скомпилированный
# делегат, поэтому ему не нужен runspace (scriptblock на этом потоке падает).
try {
    if (-not ('Nexus.Interrupt' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
namespace Nexus {
    public static class Interrupt {
        public static volatile bool Canceled = false;
        private static bool _hooked = false;

        public static void Hook() {
            if (_hooked) { return; }
            Console.CancelKeyPress += OnCancel;
            _hooked = true;
        }

        public static void Unhook() {
            if (!_hooked) { return; }
            Console.CancelKeyPress -= OnCancel;
            _hooked = false;
        }

        private static void OnCancel(object sender, ConsoleCancelEventArgs e) {
            e.Cancel = true;
            Canceled = true;
        }
    }
}
'@
    }
    [Nexus.Interrupt]::Hook()
    $script:interruptSupported = $true
} catch {
    $script:interruptSupported = $false
}

function Test-Canceled {
    if (-not $script:interruptSupported) { return $false }
    try { return [bool][Nexus.Interrupt]::Canceled } catch { return $false }
}

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $Host.UI.RawUI.WindowTitle = 'NEXUS // RELEASE PIPELINE' } catch { }
Write-LaunchLog ("console: interactive={0} truecolor={1} color={2} interrupt={3}" -f $script:interactive, $script:useTrueColor, $script:colorEnabled, $script:interruptSupported)

# ===========================================================================
# 2. Презентационный слой: цвет, сетка, анимации
# ===========================================================================
function Get-Ansi16 {
    param([int]$R, [int]$G, [int]$B)

    $best = 37
    $bestDistance = [int]::MaxValue

    foreach ($entry in $script:ansiPalette) {
        $dr = $R - $entry[1]
        $dg = $G - $entry[2]
        $db = $B - $entry[3]
        $distance = ($dr * $dr) + ($dg * $dg) + ($db * $db)
        if ($distance -lt $bestDistance) {
            $bestDistance = $distance
            $best = $entry[0]
        }
    }

    return $best
}

function C {
    param(
        [string]$Text,
        [int]$R = 255,
        [int]$G = 255,
        [int]$B = 255
    )

    if (-not $script:colorEnabled) { return $Text }

    if ($script:useTrueColor) {
        return "$($script:esc)[38;2;$R;$G;${B}m$Text$($script:esc)[0m"
    }

    $code = Get-Ansi16 -R $R -G $G -B $B
    return "$($script:esc)[${code}m$Text$($script:esc)[0m"
}

function Line {
    param([string]$Text = '')
    Write-Host $Text
}

function Get-Lerp {
    param([int]$From, [int]$To, [double]$T)
    if ($T -lt 0) { $T = 0 }
    if ($T -gt 1) { $T = 1 }
    return [int]($From + (($To - $From) * $T))
}

function Format-Cell {
    param([string]$Text, [int]$Width)

    if ($Width -lt 1) { return '' }
    if ($Text.Length -gt $Width) {
        if ($Width -le 3) { return $Text.Substring(0, $Width) }
        return $Text.Substring(0, $Width - 3) + '...'
    }
    return $Text.PadRight($Width)
}

# ANSI-последовательности в строках npm вырезаются: цвет задаёт сам раннер.
$script:ansiRegex = [regex]"\x1B\[[0-9;?]*[ -/]*[@-~]"

function Strip-Ansi {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return '' }
    return $script:ansiRegex.Replace($Text, '')
}

function Compress-LinePath {
    param([string]$Text, [int]$MaxPath = 48)

    if ([string]::IsNullOrEmpty($Text)) { return '' }

    # Делим с сохранением пробелов, чтобы не склеивать слова.
    $parts = $Text -split '(\s+)'
    for ($i = 0; $i -lt $parts.Count; $i++) {
        $token = $parts[$i]
        if ($token.Length -gt $MaxPath -and $token -match '[\\/]') {
            $head = [int](($MaxPath - 3) / 2)
            $tail = $MaxPath - 3 - $head
            $parts[$i] = $token.Substring(0, $head) + '...' + $token.Substring($token.Length - $tail)
        }
    }
    return ($parts -join '')
}

# --- Геометрия нижней панели ------------------------------------------------
function Get-UiMetrics {
    try {
        $top = [Console]::WindowTop
        $height = [Console]::WindowHeight
        $width = [Console]::WindowWidth
    } catch {
        return $null
    }

    if ($height -lt 10 -or $width -lt 70) { return $null }

    $bottom = $top + $height - 1
    return [pscustomobject]@{
        Top    = $top
        Bottom = $bottom
        Step   = $bottom - 1
        Bar    = $bottom
        Width  = $width - 1
        Height = $height
    }
}

function Sync-UiMetrics {
    $metrics = Get-UiMetrics
    if (-not $metrics) {
        $script:uiReady = $false
        return $false
    }

    $script:uiTop = $metrics.Top
    $script:uiWidth = $metrics.Width
    $script:uiHeight = $metrics.Height
    $script:stepRow = $metrics.Step
    $script:barRow = $metrics.Bar
    return $true
}

function Write-UiRow {
    param([int]$Row, [string]$Text)

    try {
        [Console]::SetCursorPosition(0, $Row)
        [Console]::Write((' ' * ($script:uiWidth - 1)) + "`r")
        [Console]::SetCursorPosition(0, $Row)
        [Console]::Write($Text)
        [Console]::Out.Flush()
    } catch { }
}

function Clear-UiRows {
    if (-not $script:uiReady) { return }
    Write-UiRow -Row $script:stepRow -Text ''
    Write-UiRow -Row $script:barRow -Text ''
    $script:lastStepDraw = ''
    $script:lastBarDraw = ''
}

function Refresh-Ui {
    if (-not $script:uiReady) { return }
    if (-not (Sync-UiMetrics)) { return }

    try {
        $saveRow = [Console]::CursorTop
        $saveCol = [Console]::CursorLeft
    } catch {
        $saveRow = $script:logRow
        $saveCol = 0
    }

    if ($script:stepLine -ne $script:lastStepDraw) {
        Write-UiRow -Row $script:stepRow -Text $script:stepLine
        $script:lastStepDraw = $script:stepLine
    }
    if ($script:barLine -ne $script:lastBarDraw) {
        Write-UiRow -Row $script:barRow -Text $script:barLine
        $script:lastBarDraw = $script:barLine
    }

    try {
        $row = [Math]::Min([Math]::Max($saveRow, $script:uiTop), $script:stepRow - 1)
        [Console]::SetCursorPosition(0, $row)
    } catch { }
}

function Initialize-Ui {
    $script:uiReady = $false
    if (-not $script:interactive) { return }
    if (-not (Sync-UiMetrics)) { return }

    try { $script:logRow = [Console]::CursorTop } catch { $script:logRow = $script:uiTop }
    if ($script:logRow -lt $script:uiTop) { $script:logRow = $script:uiTop }
    if ($script:logRow -gt ($script:stepRow - 1)) { $script:logRow = $script:stepRow - 1 }

    $script:uiReady = $true
    Clear-UiRows
    try { [Console]::SetCursorPosition(0, $script:logRow) } catch { }
}

function Hide-Ui {
    if (-not $script:uiReady) { return }
    try {
        if (Sync-UiMetrics) {
            Write-UiRow -Row $script:stepRow -Text ''
            Write-UiRow -Row $script:barRow -Text ''
            [Console]::SetCursorPosition(0, [Math]::Max($script:uiTop, $script:stepRow - 1))
        }
    } catch { }
    $script:uiReady = $false
    $script:stepLine = ''
    $script:barLine = ''
}

function Scroll-LogArea {
    if (-not $script:uiReady) { return }
    if (-not (Sync-UiMetrics)) { return }

    try {
        # Newline в нижней строке прокручивает видимую область на одну строку.
        [Console]::SetCursorPosition(0, $script:barRow)
        Write-Host ''
    } catch { }

    [void](Sync-UiMetrics)
    $script:logRow = $script:stepRow - 1
    Clear-UiRows
    try { [Console]::SetCursorPosition(0, $script:logRow) } catch { }
}

function Push-LogLine {
    param([string]$Colored)

    if (-not $script:uiReady) {
        Write-Host $Colored
        return
    }
    if (-not (Sync-UiMetrics)) {
        Write-Host $Colored
        return
    }

    if ($script:logRow -ge $script:stepRow) { Scroll-LogArea }

    try {
        [Console]::SetCursorPosition(0, $script:logRow)
        [Console]::Write((' ' * ($script:uiWidth - 1)) + "`r")
        [Console]::SetCursorPosition(0, $script:logRow)
        [Console]::Write($Colored)
        [Console]::Out.Flush()
        $script:logRow += 1
        Refresh-Ui
    } catch {
        Write-Host $Colored
    }
}

# Write-Animated: проигрывает готовые кадры в одной строке (fade-in/fade-out).
# В неинтерактивном режиме печатает только финальный кадр.
function Write-Animated {
    param(
        [Parameter(Mandatory = $true)][string[]]$Frames,
        [int]$DelayMs = 30,
        [int]$Row = -1
    )

    if ($Frames.Count -eq 0) { return }

    if (-not $script:interactive) {
        Write-Host $Frames[$Frames.Count - 1]
        return
    }

    foreach ($frame in $Frames) {
        if ($Row -ge 0) {
            try { [Console]::SetCursorPosition(0, $Row) } catch { }
        }
        Write-Host $frame
        if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }
    }
}

function Write-Typewriter {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [string]$Prefix = '',
        [string]$Suffix = '',
        [int]$DelayMs = 30,
        [int]$R = 179,
        [int]$G = 136,
        [int]$B = 255
    )

    if ([string]::IsNullOrEmpty($Text)) { return }

    if (-not $script:interactive) {
        Push-LogLine ($Prefix + $Text + $Suffix)
        return
    }

    if (-not $script:uiReady) {
        [Console]::Write($Prefix)
        foreach ($ch in $Text.ToCharArray()) {
            [Console]::Write((C ([string]$ch) $R $G $B))
            Start-Sleep -Milliseconds $DelayMs
        }
        Write-Host $Suffix
        return
    }

    if (-not (Sync-UiMetrics)) {
        Push-LogLine ($Prefix + $Text + $Suffix)
        return
    }
    if ($script:logRow -ge $script:stepRow) { Scroll-LogArea }

    $row = $script:logRow
    $max = $script:uiWidth - $Prefix.Length - $Suffix.Length
    if ($max -lt 1) { $max = 1 }
    $length = [Math]::Min($Text.Length, $max)

    for ($i = 1; $i -le $length; $i++) {
        $partial = $Text.Substring(0, $i)
        try {
            [Console]::SetCursorPosition(0, $row)
            [Console]::Write((' ' * ($script:uiWidth - 1)) + "`r")
            [Console]::SetCursorPosition(0, $row)
            [Console]::Write($Prefix + (C $partial $R $G $B) + $Suffix)
            [Console]::Out.Flush()
        } catch { }
        Start-Sleep -Milliseconds $DelayMs
    }

    $script:logRow += 1
    Refresh-Ui
}

function Show-Banner {
    if ($NoBanner) { return }

    if ($script:interactive) {
        try { Clear-Host } catch { }
    }

    $lines = @(
        '  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗',
        '  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝',
        '  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗',
        '  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║',
        '  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║',
        '  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝'
    )
    $colors = @(
        @(179, 136, 255),
        @(148, 145, 255),
        @(102, 115, 255),
        @( 84, 184, 255),
        @( 61, 214, 140),
        @( 61, 214, 140)
    )

    $startRow = 0
    if ($script:interactive) {
        try { $startRow = [Console]::CursorTop } catch { }
    }

    Line ''
    if ($script:interactive) {
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $lineText = $lines[$i]
            $target = $colors[$i]
            $frames = @()
            for ($f = 1; $f -le 5; $f++) {
                $t = $f / 5.0
                $r = Get-Lerp -From 30 -To $target[0] -T $t
                $g = Get-Lerp -From 34 -To $target[1] -T $t
                $b = Get-Lerp -From 48 -To $target[2] -T $t
                $frames += (C $lineText $r $g $b)
            }
            Write-Animated -Frames $frames -DelayMs 25 -Row ($startRow + 1 + $i)
            Start-Sleep -Milliseconds 50
        }
        try { [Console]::SetCursorPosition(0, $startRow + 1 + $lines.Count) } catch { }
    } else {
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $color = $colors[$i]
            Line (C $lines[$i] $color[0] $color[1] $color[2])
        }
    }

    Line ''
    Line ('  ' + (C 'DISCORD MODERATION SUITE' 141 150 180) + (C '  ·  ' 70 78 102) + (C 'RELEASE PIPELINE' 84 184 255))
    Line ('  ' + (C ('─' * 62) 54 62 86))
    Line ''
}

function Show-Progress {
    $filled = [Math]::Min($script:step, $script:totalSteps)
    $empty = [Math]::Max(0, $script:totalSteps - $filled)

    if ($script:uiReady) {
        $bar = ('█' * $filled) + ('░' * $empty)
        $script:barLine = '  ' + (C 'PIPELINE' 141 150 180) + '  ' + (C $bar 102 115 255) + '  ' + (C "$filled/$($script:totalSteps)" 84 184 255)
        Refresh-Ui
        return
    }

    $plainBar = ('#' * $filled) + ('.' * $empty)
    Line ('  ' + (C 'PIPELINE' 141 150 180) + '  [' + (C $plainBar 102 115 255) + ']  ' + (C "$filled/$($script:totalSteps)" 84 184 255))
}

function Set-StepUi {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Glyph,
        [int]$ElapsedSeconds = 0,
        [int]$R = 102,
        [int]$G = 115,
        [int]$B = 255
    )

    if (-not $script:uiReady) { return }

    $timeText = [string]$ElapsedSeconds + 's'
    $maxLabel = $script:uiWidth - 6 - $timeText.Length
    if ($maxLabel -lt 10) { $maxLabel = 10 }
    if ($Label.Length -gt $maxLabel) {
        $Label = $Label.Substring(0, $maxLabel - 3) + '...'
    }

    $script:stepLine = '  ' + (C $Glyph $R $G $B) + ' ' + (C $Label 210 214 230) + '  ' + (C $timeText 141 150 180)
    Refresh-Ui
}

# --- Категоризация строк пайплайна -----------------------------------------
function Parse-LogPrefix {
    param([string]$Text, [switch]$IsError)

    $lower = $Text.ToLowerInvariant()

    # Явный маркер успеха в начале строки важнее слов «warn/failed» в названии теста.
    if ($Text -match '^\s*[✔✓]') {
        return [pscustomobject]@{ Glyph = '✔'; R = 61; G = 214; B = 140 }
    }

    if ($IsError -or $lower -match '(^|[\s:\[(])(error|failed|failure|fatal|exception|unhandled)([\s:\])]|$)') {
        return [pscustomobject]@{ Glyph = '✖'; R = 255; G = 95; B = 109 }
    }
    if ($lower -match '(^|[\s:\[(])(warn|warning|deprecated)([\s:\])]|$)') {
        return [pscustomobject]@{ Glyph = '⚠'; R = 255; G = 176; B = 32 }
    }
    if ($Text -match '[✔✓]' -or $lower -match '(^|[\s:\[(])(pass|passed|passing|ok|success|done)([\s:\])]|$)') {
        return [pscustomobject]@{ Glyph = '✔'; R = 61; G = 214; B = 140 }
    }
    if ($Text -match '^\s*(>|#|==|──|─)' -or $lower -match '\b(transform|transforming|build|building|bundle|bundling|compile|compiling|vite|webpack|rollup|tsc)\b') {
        return [pscustomobject]@{ Glyph = '✦'; R = 179; G = 136; B = 255 }
    }
    return [pscustomobject]@{ Glyph = 'ℹ'; R = 120; G = 130; B = 150 }
}

function Write-StreamLine {
    param(
        [AllowEmptyString()][string]$Text,
        [switch]$IsError
    )

    $clean = (Strip-Ansi $Text).Replace("`r", '').TrimEnd()
    if ([string]::IsNullOrWhiteSpace($clean)) { return }

    $clean = Compress-LinePath -Text $clean
    $style = Parse-LogPrefix -Text $clean -IsError:$IsError
    $prefix = '  ' + $style.Glyph + '  '

    if ($script:uiReady) {
        $max = $script:uiWidth - $prefix.Length - 1
        if ($max -lt 20) { $max = 20 }
        if ($clean.Length -gt $max) {
            $clean = $clean.Substring(0, $max - 3) + '...'
        }
    }

    $colored = (C $prefix $style.R $style.G $style.B) + (C $clean 180 188 210)
    Push-LogLine $colored
}

# ===========================================================================
# 3. Файловые хелперы: .env и package.json
# ===========================================================================
function Read-EnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [string]$Fallback = ''
    )

    $file = Join-Path $script:root '.env'
    if (-not (Test-Path -LiteralPath $file)) { return $Fallback }

    $pattern = '^\s*(?:export\s+)?' + [regex]::Escape($Key) + '\s*=\s*(.*)$'
    $match = Select-String -LiteralPath $file -Pattern $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $match) { return $Fallback }

    $value = $match.Matches[0].Groups[1].Value.Trim()
    if ($value.Length -ge 2) {
        $doubleQuoted = $value.StartsWith('"') -and $value.EndsWith('"')
        $singleQuoted = $value.StartsWith("'") -and $value.EndsWith("'")
        if ($doubleQuoted -or $singleQuoted) {
            $value = $value.Substring(1, $value.Length - 2)
        }
    }

    if ([string]::IsNullOrWhiteSpace($value)) { return $Fallback }
    return $value
}

function Get-PackageVersion {
    $file = Join-Path $script:root 'package.json'
    if (-not (Test-Path -LiteralPath $file)) { return '0.0.0' }

    try {
        $obj = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        if ($obj.version) { return [string]$obj.version }
    } catch { }

    $match = Select-String -LiteralPath $file -Pattern '"version"\s*:\s*"([^"]+)"' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { return $match.Matches[0].Groups[1].Value }
    return '0.0.0'
}

# ===========================================================================
# 4. HUD и итоговые боксы
# ===========================================================================
function Show-Hud {
    param(
        [TimeSpan]$Uptime,
        [int]$MemoryMB,
        [int]$Events
    )

    if (-not $script:uiReady) { return }

    $timeText = $Uptime.ToString('hh\:mm\:ss')
    $memText = [string]$MemoryMB + ' MB'
    $evtText = [string]$Events + ' events'

    $script:stepLine = '  ' + (C '●' 61 214 140) + ' ' + (C $timeText 210 214 230) +
        '   ' + (C '▸' 84 184 255) + ' ' + (C $memText 141 150 180) +
        '   ' + (C '◈' 179 136 255) + ' ' + (C $evtText 141 150 180)

    $script:barLine = '  ' + (C 'NEXUS · LIVE' 61 214 140) + '  ' + (C '·' 70 78 102) + '  ' +
        (C $script:liveMode 84 184 255) + '  ' + (C '·' 70 78 102) + '  ' +
        (C 'Ctrl+C — остановить' 141 150 180)

    Refresh-Ui
}

function Show-SuccessBox {
    param([string]$Subtitle = 'Проверки, сборка и деплой завершены.')

    $inner = 62
    if ($script:uiReady) {
        $inner = [Math]::Min(62, $script:uiWidth - 4)
    }
    if ($inner -lt 20) { $inner = 20 }

    $green = @(61, 214, 140)
    $blank = ''.PadRight($inner)

    Push-LogLine ('  ' + (C ('┌' + ('─' * $inner) + '┐') $green[0] $green[1] $green[2]))
    Push-LogLine ('  ' + (C '│' $green[0] $green[1] $green[2]) + (C (Format-Cell '  ✔  RELEASE READY' $inner) $green[0] $green[1] $green[2]) + (C '│' $green[0] $green[1] $green[2]))
    Push-LogLine ('  ' + (C '│' $green[0] $green[1] $green[2]) + (C $blank $green[0] $green[1] $green[2]) + (C '│' $green[0] $green[1] $green[2]))
    Push-LogLine ('  ' + (C '│' $green[0] $green[1] $green[2]) + (C (Format-Cell ('  ' + $Subtitle) $inner) 180 188 210) + (C '│' $green[0] $green[1] $green[2]))
    Push-LogLine ('  ' + (C ('└' + ('─' * $inner) + '┘') $green[0] $green[1] $green[2]))
    Push-LogLine ''
}

function Show-FailureBox {
    $inner = 62
    if ($script:uiReady) {
        $inner = [Math]::Min(62, $script:uiWidth - 4)
    }
    if ($inner -lt 20) { $inner = 20 }

    $red = @(255, 95, 109)
    $blank = ''.PadRight($inner)
    $hint = '  Исправь ошибки и запусти npm run launch снова.'

    Push-LogLine ('  ' + (C ('┌' + ('─' * $inner) + '┐') $red[0] $red[1] $red[2]))
    Push-LogLine ('  ' + (C '│' $red[0] $red[1] $red[2]) + (C (Format-Cell '  ✖  PIPELINE FAILED' $inner) $red[0] $red[1] $red[2]) + (C '│' $red[0] $red[1] $red[2]))
    Push-LogLine ('  ' + (C '│' $red[0] $red[1] $red[2]) + (C $blank $red[0] $red[1] $red[2]) + (C '│' $red[0] $red[1] $red[2]))

    if ($script:failures.Count -eq 0) {
        Push-LogLine ('  ' + (C '│' $red[0] $red[1] $red[2]) + (C (Format-Cell '  ✖ Неизвестная ошибка' $inner) 255 176 32) + (C '│' $red[0] $red[1] $red[2]))
    } else {
        foreach ($failure in $script:failures) {
            $text = Format-Cell ('  ✖ ' + [string]$failure) $inner
            Push-LogLine ('  ' + (C '│' $red[0] $red[1] $red[2]) + (C $text 255 176 32) + (C '│' $red[0] $red[1] $red[2]))
        }
    }

    Push-LogLine ('  ' + (C '│' $red[0] $red[1] $red[2]) + (C $blank $red[0] $red[1] $red[2]) + (C '│' $red[0] $red[1] $red[2]))
    Push-LogLine ('  ' + (C '│' $red[0] $red[1] $red[2]) + (C (Format-Cell $hint $inner) 180 188 210) + (C '│' $red[0] $red[1] $red[2]))
    Push-LogLine ('  ' + (C ('└' + ('─' * $inner) + '┘') $red[0] $red[1] $red[2]))
    Push-LogLine ''
}

# ===========================================================================
# 5. Процессный движок: System.Diagnostics.Process + async events
# ===========================================================================
function Start-NpmProcess {
    param(
        [Parameter(Mandatory = $true)][string[]]$NpmArgs,
        [int]$TimeoutSeconds = 300
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = if ($env:ComSpec) { $env:ComSpec } else { 'cmd.exe' }
    # cmd /d /s /c ""path\to\npm.cmd" run test" — корректно для путей с пробелами.
    $psi.Arguments = '/d /s /c ""' + $npm + '" ' + ($NpmArgs -join ' ') + '"'
    $psi.WorkingDirectory = $script:root
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $proc.EnableRaisingEvents = $true

    $state = [pscustomobject]@{
        Process      = $proc
        StdOut       = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
        StdErr       = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
        Ticks        = New-Object 'System.Collections.Concurrent.ConcurrentQueue[int]'
        Subscriptions = New-Object System.Collections.ArrayList
        Timer        = $null
        ExitCode     = $null
        TimedOut     = $false
        Canceled     = $false
        Events       = 0
        Tail         = New-Object System.Collections.Generic.List[string]
        ErrorLines   = New-Object System.Collections.Generic.List[string]
        Duration     = [TimeSpan]::Zero
        CommandText  = ('npm ' + ($NpmArgs -join ' '))
    }

    $subOut = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action {
        $data = $Event.SourceEventArgs.Data
        if ($null -ne $data) { $Event.MessageData.Enqueue($data) }
    } -MessageData $state.StdOut
    [void]$state.Subscriptions.Add($subOut)

    $subErr = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -Action {
        $data = $Event.SourceEventArgs.Data
        if ($null -ne $data) { $Event.MessageData.Enqueue($data) }
    } -MessageData $state.StdErr
    [void]$state.Subscriptions.Add($subErr)

    $timer = New-Object System.Timers.Timer
    $timer.Interval = 60
    $timer.AutoReset = $true
    $subTick = Register-ObjectEvent -InputObject $timer -EventName Elapsed -Action {
        $Event.MessageData.Enqueue(1)
    } -MessageData $state.Ticks
    [void]$state.Subscriptions.Add($subTick)
    $state.Timer = $timer

    try {
        $proc.Start() | Out-Null
        $proc.BeginOutputReadLine()
        $proc.BeginErrorReadLine()
        $timer.Start()
    } catch {
        try { $timer.Stop(); $timer.Dispose() } catch { }
        foreach ($sub in $state.Subscriptions) {
            try { Unregister-Event -SourceIdentifier $sub.Name -ErrorAction SilentlyContinue } catch { }
            try { Remove-Job -Id $sub.Id -Force -ErrorAction SilentlyContinue } catch { }
        }
        throw
    }

    return $state
}

function Add-TailLine {
    param(
        [Parameter(Mandatory = $true)]$List,
        [AllowEmptyString()][string]$Text,
        [int]$Capacity = 40
    )

    if ($null -eq $List) { return }
    if ($List.Count -ge $Capacity) { $List.RemoveAt(0) }
    $List.Add($Text)
}

function Stop-NpmProcessTree {
    param([System.Diagnostics.Process]$Process)

    if (-not $Process) { return }
    try { if ($Process.HasExited) { return } } catch { return }

    try {
        $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
        if (Test-Path -LiteralPath $taskkill) {
            & $taskkill /PID $Process.Id /T /F 2>$null | Out-Null
        } else {
            $Process.Kill()
        }
    } catch {
        try { $Process.Kill() } catch { }
    }
}

function Close-NpmProcess {
    param([Parameter(Mandatory = $true)]$State)

    try {
        if ($State.Timer) {
            $State.Timer.Stop()
            $State.Timer.Dispose()
        }
    } catch { }

    foreach ($sub in @($State.Subscriptions)) {
        try { Unregister-Event -SourceIdentifier $sub.Name -ErrorAction SilentlyContinue } catch { }
        try { Remove-Job -Id $sub.Id -Force -ErrorAction SilentlyContinue } catch { }
    }

    try { $State.Process.Dispose() } catch { }
}

function Wait-NpmProcess {
    param(
        [Parameter(Mandatory = $true)]$State,
        [ValidateSet('Step', 'Bot')][string]$Mode = 'Step',
        [string]$Label = '',
        [switch]$ShowOutput,
        [int]$TimeoutSeconds = 0
    )

    $proc = $State.Process
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $lastSpin = Get-Date
    $lastHud = Get-Date
    $frame = 0
    $line = ''

    while (-not $proc.HasExited) {
        while ($State.StdOut.TryDequeue([ref]$line)) {
            if ($Mode -eq 'Step') {
                if ($ShowOutput) {
                    Write-StreamLine -Text $line
                } else {
                    Add-TailLine -List $State.Tail -Text $line
                }
            } else {
                Write-BotLine -Text $line -IsError:$false
                $State.Events += 1
            }
            $line = ''
        }

        while ($State.StdErr.TryDequeue([ref]$line)) {
            Add-TailLine -List $State.ErrorLines -Text $line -Capacity 12

            if ($Mode -eq 'Step') {
                if ($ShowOutput) {
                    Write-StreamLine -Text $line -IsError
                } else {
                    Add-TailLine -List $State.Tail -Text $line
                }
            } else {
                Write-BotLine -Text $line -IsError
                $State.Events += 1
            }
            $line = ''
        }

        $tickSeen = $false
        $tick = 0
        while ($State.Ticks.TryDequeue([ref]$tick)) { $tickSeen = $true }

        if (-not $State.Canceled -and (Test-Canceled)) {
            $State.Canceled = $true
            Write-LaunchLog ("process canceled: {0}" -f $State.CommandText)
            Stop-NpmProcessTree -Process $proc
        }

        if (-not $State.TimedOut -and $TimeoutSeconds -gt 0 -and $sw.Elapsed.TotalSeconds -gt $TimeoutSeconds) {
            $State.TimedOut = $true
            Write-LaunchLog ("process timeout ({0}s): {1}" -f $TimeoutSeconds, $State.CommandText)
            Stop-NpmProcessTree -Process $proc
        }

        if ($Mode -eq 'Step' -and $script:interactive) {
            $elapsedSinceSpin = ((Get-Date) - $lastSpin).TotalMilliseconds
            if ($elapsedSinceSpin -ge 80 -and ($tickSeen -or $elapsedSinceSpin -ge 120)) {
                $frame += 1
                $glyph = $script:spinFrames[$frame % $script:spinFrames.Count]
                Set-StepUi -Label $Label -Glyph $glyph -ElapsedSeconds ([int]$sw.Elapsed.TotalSeconds)
                $lastSpin = Get-Date
            }
        }

        if ($Mode -eq 'Bot' -and ((Get-Date) - $lastHud).TotalMilliseconds -ge 500) {
            $mem = 0
            try {
                if (-not $proc.HasExited) { $mem = [int]($proc.WorkingSet64 / 1MB) }
            } catch { }
            Show-Hud -Uptime $sw.Elapsed -MemoryMB $mem -Events $State.Events
            $lastHud = Get-Date
        }

        Start-Sleep -Milliseconds 15
    }

    # WaitForExit() без таймаута гарантирует завершение async-обработчиков.
    $proc.WaitForExit()
    Start-Sleep -Milliseconds 25

    while ($State.StdOut.TryDequeue([ref]$line)) {
        if ($Mode -eq 'Step') {
            if ($ShowOutput) { Write-StreamLine -Text $line } else { Add-TailLine -List $State.Tail -Text $line }
        } else {
            Write-BotLine -Text $line -IsError:$false
            $State.Events += 1
        }
        $line = ''
    }
    while ($State.StdErr.TryDequeue([ref]$line)) {
        Add-TailLine -List $State.ErrorLines -Text $line -Capacity 12
        if ($Mode -eq 'Step') {
            if ($ShowOutput) { Write-StreamLine -Text $line -IsError } else { Add-TailLine -List $State.Tail -Text $line }
        } else {
            Write-BotLine -Text $line -IsError
            $State.Events += 1
        }
        $line = ''
    }

    if (-not $State.Canceled -and (Test-Canceled)) {
        $State.Canceled = $true
        Write-LaunchLog ("process canceled after exit: {0}" -f $State.CommandText)
    }

    $State.ExitCode = $proc.ExitCode
    $State.Duration = $sw.Elapsed
    Close-NpmProcess -State $State
}

# ===========================================================================
# 6. Шаг пайплайна
# ===========================================================================
function Invoke-NpmStep {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string[]]$NpmArgs,
        [switch]$ShowOutput
    )

    $script:step += 1
    $index = $script:step
    $labelText = "[$index/$($script:totalSteps)] $Label"

    Write-LaunchLog ("step {0}/{1} start: {2} | npm {3}" -f $index, $script:totalSteps, $Label, ($NpmArgs -join ' '))
    Show-Progress

    # Fade-in следующего спиннера: прозрачный -> синий.
    if ($script:interactive -and $script:uiReady) {
        $fill = @('░', '▒', '▓', $script:spinFrames[0])
        for ($i = 0; $i -lt $fill.Count; $i++) {
            $t = ($i + 1) / [double]$fill.Count
            $r = Get-Lerp -From 54 -To 102 -T $t
            $g = Get-Lerp -From 62 -To 115 -T $t
            $b = Get-Lerp -From 86 -To 255 -T $t
            Set-StepUi -Label $labelText -Glyph $fill[$i] -ElapsedSeconds 0 -R $r -G $g -B $b
            Start-Sleep -Milliseconds 38
        }
    }

    $state = Start-NpmProcess -NpmArgs $NpmArgs -TimeoutSeconds 300
    Wait-NpmProcess -State $state -Mode Step -Label $labelText -ShowOutput:$ShowOutput -TimeoutSeconds 300

    $duration = [int]$state.Duration.TotalSeconds
    $success = ($state.ExitCode -eq 0 -and -not $state.TimedOut -and -not $state.Canceled)

    if ($state.Canceled) {
        $script:canceled = $true
        $reason = 'прервано (Ctrl+C)'
    } elseif ($state.TimedOut) {
        $reason = 'таймаут: шаг выполнялся дольше 5 минут'
    } elseif ($success) {
        $reason = ''
    } elseif ($state.ErrorLines.Count -gt 0) {
        $reason = [string]$state.ErrorLines[$state.ErrorLines.Count - 1]
    } else {
        $reason = "npm завершился с кодом $($state.ExitCode)"
    }

    $reason = (Strip-Ansi $reason).Replace("`r", ' ').Replace("`n", ' ').Trim()
    if ($script:uiReady -and $reason.Length -gt ($script:uiWidth - 10)) {
        $reason = $reason.Substring(0, $script:uiWidth - 13) + '...'
    }

    if ($script:interactive -and $script:uiReady) {
        $mark = if ($success) { '✔' } else { '✖' }
        $targetR = if ($success) { 61 } else { 255 }
        $targetG = if ($success) { 214 } else { 95 }
        $targetB = if ($success) { 140 } else { 109 }
        $fill = @('░', '▒', '▓', $mark)

        # Fade-out спиннера в ✔/✖ (300 мс).
        for ($i = 0; $i -lt $fill.Count; $i++) {
            $t = ($i + 1) / [double]$fill.Count
            $r = Get-Lerp -From 102 -To $targetR -T $t
            $g = Get-Lerp -From 115 -To $targetG -T $t
            $b = Get-Lerp -From 255 -To $targetB -T $t
            Set-StepUi -Label $labelText -Glyph $fill[$i] -ElapsedSeconds $duration -R $r -G $g -B $b
            Start-Sleep -Milliseconds 75
        }
        Start-Sleep -Milliseconds 150

        $script:stepLine = ''
        Refresh-Ui
    }

    if ($success) {
        $final = '  ' + (C '✔' 61 214 140) + ' ' + (C $labelText 210 214 230) + '  ' + (C ([string]$duration + 's') 141 150 180)
        Push-LogLine $final
        Write-LaunchLog ("step ok: {0} ({1}s)" -f $Label, $duration)
        return $true
    }

    $final = '  ' + (C '✖' 255 95 109) + ' ' + (C $labelText 210 214 230) + '  ' + (C ([string]$duration + 's') 141 150 180)
    Push-LogLine $final
    Write-LaunchLog ("step failed: {0} | exit={1} timedOut={2} canceled={3} | {4}" -f $Label, $state.ExitCode, $state.TimedOut, $state.Canceled, $reason)

    if (-not $ShowOutput -and $state.Tail.Count -gt 0) {
        $tail = @($state.Tail)
        $start = [Math]::Max(0, $tail.Count - 30)
        for ($i = $start; $i -lt $tail.Count; $i++) {
            Write-StreamLine -Text $tail[$i]
        }
    }
    if ($reason) {
        Push-LogLine ('  ' + (C ('↳ ' + $reason) 255 95 109))
    }

    [void]$script:failures.Add($Label)
    return $false
}

# ===========================================================================
# 7. Бот: категории вывода, typewriter-баннер, HUD
# ===========================================================================
function Get-BotCategory {
    param([string]$Text, [switch]$IsError)

    $clean = $Text
    $tag = ''

    $tagMatch = [regex]::Match($clean, '^\s*\[(bot|web|db|err)\]\s*', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($tagMatch.Success) {
        $tag = $tagMatch.Groups[1].Value.ToLowerInvariant()
        $clean = $clean.Substring($tagMatch.Length)
    }

    if (-not $tag) {
        if ($IsError) {
            $tag = 'err'
        } else {
            $lower = $clean.ToLowerInvariant()
            if ($lower -match '\b(error|fatal|exception|unhandled|failed)\b') {
                $tag = 'err'
            } elseif ($lower -match '\b(web|http|panel|dashboard|vite|server|listen|api)\b') {
                $tag = 'web'
            } elseif ($lower -match '\b(db|database|sqlite|prisma|mongo|redis|postgres|query|orm)\b') {
                $tag = 'db'
            } else {
                $tag = 'bot'
            }
        }
    }

    switch ($tag) {
        'web' { $r = 84;  $g = 184; $b = 255 }
        'db'  { $r = 229; $g = 192; $b = 123 }
        'err' { $r = 255; $g = 95;  $b = 109 }
        default { $r = 61; $g = 214; $b = 140 }
    }

    return [pscustomobject]@{ Tag = $tag; Text = $clean; R = $r; G = $g; B = $b }
}

function Write-BotLine {
    param(
        [AllowEmptyString()][string]$Text,
        [switch]$IsError
    )

    $clean = (Strip-Ansi $Text).Replace("`r", '').TrimEnd()
    if ([string]::IsNullOrWhiteSpace($clean)) { return }

    $clean = Compress-LinePath -Text $clean
    $cat = Get-BotCategory -Text $clean -IsError:$IsError
    $plainPrefixLength = 7 + $cat.Tag.Length

    if ($script:uiReady) {
        $max = $script:uiWidth - $plainPrefixLength - 1
        if ($max -lt 20) { $max = 20 }
        if ($cat.Text.Length -gt $max) {
            $cat.Text = $cat.Text.Substring(0, $max - 3) + '...'
        }
    }

    $prefix = '  ' + (C '│' 54 62 86) + ' ' + (C ('[' + $cat.Tag + ']') $cat.R $cat.G $cat.B) + ' '
    $colored = $prefix + (C $cat.Text 190 196 214)
    Push-LogLine $colored
}

function Show-LiveBanner {
    param(
        [string]$Mode,
        [string]$Url,
        [string]$Version
    )

    $inner = 62
    if ($script:uiReady) {
        $inner = [Math]::Min(62, $script:uiWidth - 4)
    }
    if ($inner -lt 20) { $inner = 20 }

    $border = @(84, 184, 255)
    Push-LogLine ('  ' + (C ('╭' + ('─' * $inner) + '╮') $border[0] $border[1] $border[2]))

    $title = 'N E X U S   ·   L I V E'
    $side = [Math]::Max(0, $inner - 4 - $title.Length)
    $suffix = (' ' * $side) + '  │'
    Write-Typewriter -Text $title -Prefix '  │  ' -Suffix $suffix -DelayMs 30 -R 179 -G 136 -B 255

    $meta1 = Format-Cell ('  ' + $Mode + '  ·  v' + $Version) $inner
    $meta2 = Format-Cell ('  ' + $Url) $inner
    Push-LogLine ('  ' + (C '│' $border[0] $border[1] $border[2]) + (C $meta1 141 150 180) + (C '│' $border[0] $border[1] $border[2]))
    Push-LogLine ('  ' + (C '│' $border[0] $border[1] $border[2]) + (C $meta2 $border[0] $border[1] $border[2]) + (C '│' $border[0] $border[1] $border[2]))
    Push-LogLine ('  ' + (C ('╰' + ('─' * $inner) + '╯') $border[0] $border[1] $border[2]))
    Push-LogLine ('  ' + (C '●' 61 214 140) + ' ' + (C 'NEXUS LIVE' 61 214 140) + (C '  ·  ' 70 78 102) + (C ('панель: ' + $Url) 84 184 255))
}

function Hide-LiveUi {
    if ($script:interactive -and $script:uiReady) {
        # Плавное затухание HUD перед выходом.
        for ($i = 4; $i -ge 0; $i--) {
            $t = $i / 4.0
            $r = Get-Lerp -From 34 -To 61 -T $t
            $g = Get-Lerp -From 40 -To 214 -T $t
            $b = Get-Lerp -From 52 -To 140 -T $t
            $script:stepLine = '  ' + (C '●' $r $g $b) + ' ' + (C 'NEXUS LIVE' $r $g $b)
            $script:barLine = '  ' + (C 'NEXUS · LIVE' $r $g $b)
            Refresh-Ui
            Start-Sleep -Milliseconds 60
        }
    }
    Hide-Ui
}

function Start-Nexus {
    $version = Get-PackageVersion
    $publicUrl = Read-EnvValue -Key 'WEB_PUBLIC_URL' -Fallback ''
    $port = Read-EnvValue -Key 'WEB_PORT' -Fallback '8080'
    if ([string]::IsNullOrWhiteSpace($port)) { $port = '8080' }

    $localUrl = "http://127.0.0.1:$port"
    if ([string]::IsNullOrWhiteSpace($publicUrl)) { $publicUrl = $localUrl }

    $mode = if ($ChecksOnly) {
        'CHECKS ONLY'
    } elseif ($Dev) {
        'DEV · WATCH'
    } else {
        'PRODUCTION'
    }
    $script:liveMode = $mode

    $subtitle = if ($SkipDeploy) {
        'Проверки и сборка завершены · deploy пропущен.'
    } elseif ($ChecksOnly) {
        'Проверки и сборка завершены · бот не запускается.'
    } else {
        'Проверки, сборка и деплой завершены.'
    }

    Show-SuccessBox -Subtitle $subtitle

    $infoLines = @(
        @{ Label = 'VERSION'; Value = 'v' + $version },
        @{ Label = 'MODE'; Value = $mode },
        @{ Label = 'PANEL'; Value = $publicUrl },
        @{ Label = 'LOCAL'; Value = $localUrl },
        @{ Label = 'STOP'; Value = 'Ctrl+C' }
    )
    foreach ($info in $infoLines) {
        $labelText = '  ' + $info.Label.PadRight(9) + ' '
        $valueText = [string]$info.Value
        if ($script:uiReady) {
            $maxValue = $script:uiWidth - $labelText.Length - 1
            if ($maxValue -lt 8) { $maxValue = 8 }
            if ($valueText.Length -gt $maxValue) {
                $valueText = $valueText.Substring(0, $maxValue - 3) + '...'
            }
        }
        Push-LogLine ((C $labelText 141 150 180) + (C $valueText 210 214 230))
    }

    $ruleWidth = 62
    if ($script:uiReady) { $ruleWidth = [Math]::Min(62, $script:uiWidth - 2) }
    Push-LogLine ('  ' + (C ('─' * $ruleWidth) 54 62 86))
    Push-LogLine ''

    if ($ChecksOnly) {
        Push-LogLine ('  ' + (C 'ℹ Checks-only: бот не запускается.' 120 130 150))
        Push-LogLine ''
        Write-LaunchLog 'checks-only mode: bot start skipped'
        return 0
    }

    $startArgs = if ($Dev) { @('run', 'dev') } else { @('run', 'start') }
    Write-LaunchLog ("starting bot: npm {0}" -f ($startArgs -join ' '))

    Show-LiveBanner -Mode $mode -Url $publicUrl -Version $version

    if ($script:uiReady) {
        Show-Hud -Uptime ([TimeSpan]::Zero) -MemoryMB 0 -Events 0
    } else {
        Push-LogLine ('  ' + (C '●' 61 214 140) + ' ' + (C 'NEXUS LIVE' 61 214 140) + (C '  ·  ' 70 78 102) + (C ('панель: ' + $publicUrl) 84 184 255))
        Push-LogLine ('  ' + (C '│' 54 62 86) + ' ' + (C ('поток процесса · ' + $mode) 70 78 102))
    }

    if (Test-Canceled) {
        $script:canceled = $true
        Hide-LiveUi
        Push-LogLine ('  ' + (C '■  Запуск отменён пользователем.' 255 176 32))
        return 130
    }

    $state = Start-NpmProcess -NpmArgs $startArgs -TimeoutSeconds 0
    Write-LaunchLog ("bot process started: pid={0}" -f $state.Process.Id)

    Wait-NpmProcess -State $state -Mode Bot -TimeoutSeconds 0

    $code = $state.ExitCode
    if ($null -eq $code) { $code = 1 }

    Write-LaunchLog ("bot exited with code {0} canceled={1}" -f $code, $state.Canceled)
    Hide-LiveUi
    Push-LogLine ''

    if ($state.Canceled) {
        Push-LogLine ('  ' + (C '◦ NEXUS остановлен.' 141 150 180))
        Push-LogLine ('  ' + (C 'Завершение по Ctrl+C — процесс остановлен корректно.' 120 130 150))
        return 130
    }

    if ($code -ne 0) {
        Push-LogLine ('  ' + (C "Процесс завершился с кодом $code." 255 95 109))
        if ($InWindow) {
            Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null
        }
        return [int]$code
    }

    Push-LogLine ('  ' + (C 'NEXUS остановлен.' 141 150 180))
    return 0
}

# ===========================================================================
# 8. Перезапуск в новом окне
# ===========================================================================
if (-not $InWindow -and -not $NoNewWindow) {
    Write-Host ''
    Write-Host ('  ' + (C 'NEXUS' 102 115 255) + '  ' + (C 'открываю release pipeline в новом окне…' 141 150 180))
    Write-Host ''

    $relaunchArgs = @(
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + $PSCommandPath + '"'),
        '-InWindow'
    )
    if ($Dev) { $relaunchArgs += '-Dev' }
    if ($SkipDeploy) { $relaunchArgs += '-SkipDeploy' }
    if ($ChecksOnly) { $relaunchArgs += '-ChecksOnly' }
    if ($NoBanner) { $relaunchArgs += '-NoBanner' }

    Write-LaunchLog ("relaunch requested: Dev={0} SkipDeploy={1} ChecksOnly={2} NoBanner={3} args={4}" -f $Dev, $SkipDeploy, $ChecksOnly, $NoBanner, ($relaunchArgs -join ' '))

    $spawned = $false
    $wt = Get-Command wt.exe -ErrorAction SilentlyContinue

    if ($wt) {
        try {
            $wtArgs = @('-w', '-1', 'new-tab', '--title', 'NEXUS-RELEASE', 'powershell.exe') + $relaunchArgs
            Start-Process -FilePath $wt.Source -ArgumentList $wtArgs -ErrorAction Stop | Out-Null
            Write-LaunchLog 'spawned Windows Terminal tab'
            $spawned = $true
        } catch {
            Write-LaunchLog ("wt.exe failed: " + $_.Exception.Message)
        }
    }

    if (-not $spawned) {
        try {
            Start-Process -FilePath 'powershell.exe' -ArgumentList $relaunchArgs -ErrorAction Stop | Out-Null
            Write-LaunchLog 'spawned powershell.exe fallback window'
            $spawned = $true
        } catch {
            Write-LaunchLog ("powershell.exe failed: " + $_.Exception.Message)
        }
    }

    if ($spawned) {
        Start-Sleep -Milliseconds 500
        exit 0
    }

    Write-Host ('  ' + (C 'Не удалось открыть новое окно — продолжаю в текущем.' 255 176 32))
    Start-Sleep -Milliseconds 500
}

# ===========================================================================
# 9. Пайплайн
# ===========================================================================
Show-Banner
Initialize-Ui
Show-Progress

$steps = New-Object System.Collections.ArrayList
[void]$steps.Add([pscustomobject]@{ Label = 'Останавливаю прошлый экземпляр'; Args = @('run', 'stop'); Show = $false; Deploy = $false })
[void]$steps.Add([pscustomobject]@{ Label = 'TypeScript · строгая проверка типов'; Args = @('run', 'typecheck'); Show = $false; Deploy = $false })
[void]$steps.Add([pscustomobject]@{ Label = 'ESLint · правила кода'; Args = @('run', 'lint'); Show = $false; Deploy = $false })
[void]$steps.Add([pscustomobject]@{ Label = 'Prettier · проверка форматирования'; Args = @('run', 'format:check'); Show = $false; Deploy = $false })
[void]$steps.Add([pscustomobject]@{ Label = 'Тесты · сценарии проекта'; Args = @('run', 'test'); Show = $true; Deploy = $false })
[void]$steps.Add([pscustomobject]@{ Label = 'Сборка · TypeScript + React-панель'; Args = @('run', 'build'); Show = $true; Deploy = $false })
if (-not $SkipDeploy) {
    [void]$steps.Add([pscustomobject]@{ Label = 'Deploy · регистрация слэш-команд'; Args = @('run', 'deploy'); Show = $true; Deploy = $true })
}

$ok = $true

foreach ($definition in $steps) {
    if ($script:canceled -or (Test-Canceled)) {
        $script:canceled = $true
        break
    }

    if ($definition.Deploy -and -not $ok) {
        Write-LaunchLog 'deploy skipped: previous steps failed'
        Push-LogLine ('  ' + (C '⚠ Deploy пропущен: сначала исправь ошибки выше.' 255 176 32))
        Push-LogLine ''
        continue
    }

    $result = Invoke-NpmStep -Label $definition.Label -NpmArgs $definition.Args -ShowOutput:$definition.Show
    if (-not $result) { $ok = $false }

    if ($script:canceled) { break }
}

# ===========================================================================
# 10. Итог
# ===========================================================================
if ($script:canceled) {
    Hide-Ui
    Push-LogLine ''
    Push-LogLine ('  ' + (C '■  Остановлено пользователем (Ctrl+C).' 255 176 32))
    Push-LogLine ('  ' + (C 'Пайплайн прерван, дочерние процессы остановлены.' 120 130 150))
    Push-LogLine ''
    Write-LaunchLog 'pipeline canceled by user (Ctrl+C)'
    exit 130
}

if (-not $ok) {
    Hide-Ui
    Show-FailureBox
    Write-LaunchLog ('pipeline failed: ' + ($script:failures -join ', '))

    if ($InWindow) {
        Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null
    }
    exit 1
}

Write-LaunchLog 'pipeline succeeded'
$exitCode = Start-Nexus
exit $exitCode
