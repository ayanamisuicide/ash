#requires -Version 5.1
# ВАЖНО: файл должен быть сохранён как UTF-8 with BOM.
# Windows PowerShell 5.1 без BOM читает кириллицу, символы брайля и блочную
# псевдографику как ANSI — баннер, рамки и спиннер превращаются в мусор.
<#
.SYNOPSIS
    NEXUS release pipeline для Windows PowerShell 5.1+.

.DESCRIPTION
    Консольная панель управления релизами NEXUS:
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

.PARAMETER StartFirst
    Сразу поднять бота и панель в отдельном окне, затем прогнать проверки
    в текущем окне и показать уведомление при ошибке. Бот продолжает работать.

.PARAMETER StartOnly
    Внутренний режим: только запустить бота (используется launch:live).

.PARAMETER NoNewWindow
    Не открывать новое окно, работать в текущем.

.PARAMETER NoBanner
    Не очищать экран и не рисовать ASCII-баннер.

.EXAMPLE
    npm run launch

.EXAMPLE
    npm run launch:dev

.EXAMPLE
    npm run launch:live

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/launch.ps1 -ChecksOnly -SkipDeploy -NoNewWindow -NoBanner
#>
param(
    [switch]$InWindow,
    [switch]$Dev,
    [switch]$SkipDeploy,
    [switch]$ChecksOnly,
    [switch]$StartFirst,
    [switch]$StartOnly,
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

$script:scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
$script:toastIcon = $null

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
$script:checkStatus = ''
$script:liveUrl = ''
$script:runStart = Get-Date
$script:botPid = $null
$script:botMemoryMB = 0
$script:bootReported = $false
$script:packageVersion = $null

# --- Фазовая линейка preflight ---------------------------------------------
$script:phaseNames = @('STOP', 'TYPES', 'LINT', 'FORMAT', 'TESTS', 'BUILD', 'DEPLOY')
if ($SkipDeploy) { $script:phaseNames = @('STOP', 'TYPES', 'LINT', 'FORMAT', 'TESTS', 'BUILD') }
if ($StartFirst) { $script:phaseNames = @('VERIFY') }
$script:totalSteps = $script:phaseNames.Count

# --- Единая палитра оформления ---------------------------------------------
$script:theme = @{
    ink    = @(232, 236, 246)
    muted  = @(139, 151, 180)
    dim    = @(70, 82, 110)
    line   = @(42, 54, 84)
    accent = @(94, 234, 212)
    cyan   = @(103, 232, 249)
    green  = @(74, 222, 128)
    amber  = @(251, 191, 36)
    red    = @(251, 113, 133)
    violet = @(192, 132, 252)
}

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
try { $Host.UI.RawUI.WindowTitle = 'NEXUS · Release Control' } catch { }
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

# --- Общие примитивы нового визуального слоя --------------------------------
function Paint {
    param(
        [AllowEmptyString()][string]$Text,
        [int[]]$Rgb = @(255, 255, 255)
    )

    if ([string]::IsNullOrEmpty($Text)) { return '' }
    return (C $Text $Rgb[0] $Rgb[1] $Rgb[2])
}

function Format-Duration {
    param([int]$Seconds)

    if ($Seconds -lt 0) { $Seconds = 0 }
    if ($Seconds -ge 3600) {
        return ('{0}h {1:D2}m' -f [int]($Seconds / 3600), [int](($Seconds % 3600) / 60))
    }
    if ($Seconds -ge 60) {
        return ('{0}m {1:D2}s' -f [int]($Seconds / 60), ($Seconds % 60))
    }
    return ([string]$Seconds + 's')
}

function Limit-Text {
    param([string]$Text, [int]$Width)

    if ($Width -lt 1) { return '' }
    if ([string]::IsNullOrEmpty($Text)) { return '' }
    if ($Text.Length -le $Width) { return $Text }
    if ($Width -le 3) { return $Text.Substring(0, $Width) }
    return $Text.Substring(0, $Width - 3) + '...'
}

function Get-InnerWidth {
    param([int]$Preferred = 62)

    $width = $Preferred
    try {
        $consoleWidth = [Console]::WindowWidth
        if ($consoleWidth -gt 0) {
            $width = [Math]::Min($Preferred, $consoleWidth - 4)
        }
    } catch { }

    if ($script:uiReady -and $script:uiWidth -gt 0) {
        $width = [Math]::Min($width, $script:uiWidth - 4)
    }
    if ($width -lt 30) { $width = 30 }
    return $width
}

function Split-CardText {
    param([string]$Text, [int]$Width)

    if ($Width -lt 4) { $Width = 4 }
    $lines = New-Object System.Collections.ArrayList

    foreach ($paragraph in ([string]$Text -split "`r?`n")) {
        $line = ''
        foreach ($word in ($paragraph -split '\s+')) {
            if ([string]::IsNullOrWhiteSpace($word)) { continue }

            $candidate = if ($line.Length -eq 0) { $word } else { $line + ' ' + $word }
            if ($candidate.Length -le $Width) {
                $line = $candidate
                continue
            }

            if ($line.Length -gt 0) {
                [void]$lines.Add($line)
                $line = ''
            }
            while ($word.Length -gt $Width) {
                [void]$lines.Add($word.Substring(0, $Width))
                $word = $word.Substring($Width)
            }
            $line = $word
        }
        if ($line.Length -gt 0) { [void]$lines.Add($line) }
    }

    if ($lines.Count -eq 0) { [void]$lines.Add('') }
    return $lines.ToArray()
}

function Get-LaunchMode {
    if ($StartFirst) { return 'LIVE' }
    if ($ChecksOnly) { return 'CHECKS ONLY' }
    if ($Dev) { return 'DEV · WATCH' }
    return 'PRODUCTION'
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

function Write-SectionRule {
    param(
        [string]$Label = '',
        [int[]]$Rgb = @(42, 54, 84),
        [int]$Inner = 70,
        [string]$Right = '',
        [int[]]$RightRgb = @(139, 151, 180)
    )

    if ($Inner -lt 10) { $Inner = 10 }

    if ([string]::IsNullOrEmpty($Label)) {
        Push-LogLine ('  ' + (Paint ('─' * $Inner) $Rgb))
        return
    }

    $head = '── ' + $Label + ' '
    $tail = if ($Right) { ' ' + $Right } else { '' }
    $fill = $Inner - $head.Length - $tail.Length
    if ($fill -lt 2) { $fill = 2 }

    Push-LogLine (
        '  ' + (Paint $head $Rgb) + (Paint ('─' * $fill) $Rgb) +
        (Paint $tail $RightRgb)
    )
}

function Show-Banner {
    if ($NoBanner) { return }

    if ($script:interactive) {
        try { Clear-Host } catch { }
    }

    $inner = Get-InnerWidth -Preferred 70
    $version = Get-PackageVersion
    $mode = Get-LaunchMode
    $accent = $script:theme.accent
    $muted = $script:theme.muted
    $ink = $script:theme.ink
    $line = $script:theme.line

    $brand = '◈ NEXUS'
    $section = 'release control'
    $right = 'v' + $version

    if (($brand.Length + 5 + $section.Length + 3 + $right.Length) -gt $inner) {
        $section = 'release'
    }
    if (($brand.Length + 5 + $section.Length + 3 + $right.Length) -gt $inner) {
        $section = ''
    }

    $leftPlain = $brand + '  /  ' + $section
    $gap = $inner - $leftPlain.Length - $right.Length
    if ($gap -lt 1) { $gap = 1 }

    $title = '  ' + (Paint $brand $accent)
    if ($section) {
        $title += (Paint ('  /  ' + $section) $muted)
    }
    $title += (' ' * $gap) + (Paint $right $ink)
    Push-LogLine $title
    Push-LogLine ('  ' + (Paint ('─' * $inner) $line))

    $subtitle = if ($StartOnly) {
        'runtime only  ·  release checks skipped'
    } elseif ($StartFirst) {
        'runtime first  ·  checks in parallel'
    } elseif ($ChecksOnly) {
        'no bot start  ·  no deploy'
    } elseif ($Dev) {
        'tsx watch  ·  build locked'
    } else {
        'stop → typecheck → lint → format → tests → build → deploy → launch'
    }

    Push-LogLine (
        '  ' + (Paint $mode $accent) +
        (Paint ('  ·  ' + $subtitle) $muted)
    )
    Push-LogLine ''
}

function Get-PhaseForIndex {
    param([int]$Index)

    $names = @($script:phaseNames)
    if ($Index -ge 1 -and $Index -le $names.Count) {
        return [string]$names[$Index - 1]
    }
    return ''
}

function Get-PhaseStrip {
    $names = @($script:phaseNames)
    if ($names.Count -eq 0) { return '' }

    $fullParts = New-Object System.Collections.ArrayList
    $shortParts = New-Object System.Collections.ArrayList
    $fullPlain = 0
    $shortPlain = 0

    for ($i = 0; $i -lt $names.Count; $i++) {
        $glyph = '·'
        $rgb = $script:theme.dim
        if ($i -lt ($script:step - 1)) {
            $glyph = '✓'
            $rgb = $script:theme.green
        } elseif ($i -eq ($script:step - 1)) {
            $glyph = '●'
            $rgb = $script:theme.accent
        }

        $label = [string]$names[$i]
        [void]$fullParts.Add((Paint ($glyph + ' ' + $label) $rgb))
        [void]$shortParts.Add((Paint $glyph $rgb))
        $fullPlain += $glyph.Length + 1 + $label.Length
        $shortPlain += $glyph.Length
    }

    $fullPlain += 3 * ($names.Count - 1)
    $shortPlain += ($names.Count - 1)
    $available = if ($script:uiReady) { $script:uiWidth - 1 } else { 78 }

    if (($fullPlain + 8) -le $available) {
        return ($fullParts -join (Paint '   ' $script:theme.dim))
    }
    if (($shortPlain + 8) -le $available) {
        return ($shortParts -join (Paint ' ' $script:theme.dim))
    }
    return ($shortParts -join '')
}

function Show-Progress {
    $filled = [Math]::Min($script:step, $script:totalSteps)
    $countText = ('{0}/{1}' -f $filled, $script:totalSteps)
    $strip = Get-PhaseStrip

    if ($script:uiReady) {
        $plainStrip = $script:ansiRegex.Replace($strip, '')
        $gap = [Math]::Max(1, ($script:uiWidth - 3) - $plainStrip.Length - $countText.Length)
        $script:barLine = '  ' + $strip + (' ' * $gap) + (Paint $countText $script:theme.muted)
        Refresh-Ui
        return
    }

    if (-not $script:interactive) { return }
    Line ('  ' + (Paint 'PREFLIGHT' $script:theme.muted) + '  ' + $strip + '  ' + (Paint $countText $script:theme.ink))
}

function Set-StepUi {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Glyph,
        [int]$ElapsedSeconds = 0,
        [int]$R = 94,
        [int]$G = 234,
        [int]$B = 212
    )

    if (-not $script:uiReady) { return }

    $rgb = @($R, $G, $B)
    $indexText = ('{0:D2}/{1:D2}' -f $script:step, $script:totalSteps)
    $phase = Get-PhaseForIndex -Index $script:step
    $timeText = Format-Duration -Seconds $ElapsedSeconds
    $prefixPlain = '  ' + $Glyph + ' ' + $indexText + '  ' + $phase + '  '
    $maxWidth = $script:uiWidth - 1

    $labelBudget = $maxWidth - $prefixPlain.Length - $timeText.Length - 4
    if ($labelBudget -lt 8) { $labelBudget = 8 }
    $labelText = Limit-Text -Text $Label -Width $labelBudget

    $gap = $maxWidth - $prefixPlain.Length - $labelText.Length - $timeText.Length - 2
    if ($gap -lt 1) { $gap = 1 }

    $script:stepLine = (Paint ('  ' + $Glyph) $rgb) + ' ' +
        (Paint $indexText $script:theme.dim) + '  ' +
        (Paint $phase $script:theme.accent) + '  ' +
        (Paint $labelText $script:theme.ink) + (' ' * $gap) +
        (Paint $timeText $script:theme.muted)
    Refresh-Ui
}

function Write-StepResult {
    param(
        [int]$Index,
        [string]$Label,
        [int]$DurationSeconds,
        [bool]$Ok
    )

    $glyph = if ($Ok) { '✓' } else { '✕' }
    $rgb = if ($Ok) { $script:theme.green } else { $script:theme.red }
    $indexText = ('{0:D2}' -f $Index)
    $phase = Get-PhaseForIndex -Index $Index
    if ($phase.Length -lt 7) { $phase = $phase.PadRight(7) }
    $duration = Format-Duration -Seconds $DurationSeconds

    $maxWidth = if ($script:uiReady) { $script:uiWidth - 1 } else { 78 }
    $prefixPlain = '  ' + $glyph + '  ' + $indexText + '  ' + $phase + '  '
    $labelBudget = [Math]::Max(8, $maxWidth - $prefixPlain.Length - $duration.Length - 2)
    $labelText = Limit-Text -Text $Label -Width $labelBudget
    $gap = [Math]::Max(1, $maxWidth - $prefixPlain.Length - $labelText.Length - $duration.Length)

    Push-LogLine (
        '  ' + (Paint $glyph $rgb) + '  ' + (Paint $indexText $script:theme.dim) + '  ' +
        (Paint $phase $script:theme.accent) + '  ' + (Paint $labelText $script:theme.ink) +
        (' ' * $gap) + (Paint $duration $script:theme.muted)
    )
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

    $style = Parse-LogPrefix -Text $clean -IsError:$IsError
    # npm-тесты сами печатают ✔/✖ в начале строки — не дублируем глиф.
    $clean = $clean -replace '^\s*[✔✓✖✕]\s+', ''
    if ([string]::IsNullOrWhiteSpace($clean)) { return }

    $clean = Compress-LinePath -Text $clean
    $styleRgb = @($style.R, $style.G, $style.B)
    $plainPrefixLength = 5

    if ($script:uiReady) {
        $max = $script:uiWidth - $plainPrefixLength - 1
        if ($max -lt 20) { $max = 20 }
        if ($clean.Length -gt $max) {
            $clean = $clean.Substring(0, $max - 3) + '...'
        }
    }

    $colored = '  ' + (Paint $style.Glyph $styleRgb) + '  ' +
        (Paint $clean $script:theme.ink)
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
    if ($script:packageVersion) { return $script:packageVersion }

    $file = Join-Path $script:root 'package.json'
    if (-not (Test-Path -LiteralPath $file)) { return '0.0.0' }

    try {
        $obj = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        if ($obj.version) {
            $script:packageVersion = [string]$obj.version
            return $script:packageVersion
        }
    } catch { }

    $match = Select-String -LiteralPath $file -Pattern '"version"\s*:\s*"([^"]+)"' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) {
        $script:packageVersion = $match.Matches[0].Groups[1].Value
        return $script:packageVersion
    }
    return '0.0.0'
}

# ===========================================================================
# 4. HUD и итоговые боксы
# ===========================================================================
function Update-BotRuntimeInfo {
    param([int]$RootPid = 0)

    $portText = Read-EnvValue -Key 'WEB_PORT' -Fallback '8080'
    $port = 8080
    [void][int]::TryParse($portText, [ref]$port)
    if ($port -le 0) { $port = 8080 }

    $owner = Get-PortOwnerPid -Port $port
    if ($owner -and $owner -ne $RootPid) {
        try {
            $procInfo = Get-Process -Id $owner -ErrorAction Stop
            $script:botPid = $owner
            $script:botMemoryMB = [int]($procInfo.WorkingSet64 / 1MB)
            return
        } catch { }
    }

    if ($RootPid -le 0) { return }
    try {
        $child = Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $RootPid) -ErrorAction Stop |
            Where-Object { $_.Name -match '^node(\.exe)?$' } |
            Select-Object -First 1
        if ($child) {
            $procInfo = Get-Process -Id ([int]$child.ProcessId) -ErrorAction SilentlyContinue
            if ($procInfo) {
                $script:botPid = [int]$child.ProcessId
                $script:botMemoryMB = [int]($procInfo.WorkingSet64 / 1MB)
            }
        }
    } catch { }
}

function Show-Hud {
    param(
        [TimeSpan]$Uptime,
        [int]$MemoryMB,
        [int]$Events
    )

    if (-not $script:uiReady) { return }

    $pulse = if (([int]$Uptime.TotalSeconds % 2) -eq 0) {
        $script:theme.green
    } else {
        @(134, 239, 172)
    }
    $timeText = $Uptime.ToString('hh\:mm\:ss')
    $memory = if ($script:botMemoryMB -gt 0) { $script:botMemoryMB } else { $MemoryMB }
    $memText = if ($memory -gt 0) { [string]$memory + ' MB' } else { '— MB' }
    $pidText = if ($script:botPid) { 'PID ' + $script:botPid } else { '' }

    $script:stepLine = (Paint '  ● LIVE' $pulse) +
        (Paint ('  ' + $timeText) $script:theme.ink) +
        (Paint '  ·  ' $script:theme.dim) + (Paint $memText $script:theme.muted) +
        (Paint '  ·  ' $script:theme.dim) + (Paint ([string]$Events + ' lines') $script:theme.muted)
    if ($pidText) {
        $script:stepLine += (Paint '  ·  ' $script:theme.dim) + (Paint $pidText $script:theme.muted)
    }

    $version = Get-PackageVersion
    $script:barLine = (Paint '  Ctrl+C stop' $script:theme.muted) +
        (Paint '   ·   ' $script:theme.dim) +
        (Paint 'data/launch.log' $script:theme.muted) +
        (Paint '   ·   ' $script:theme.dim) +
        (Paint ('NEXUS ' + $version) $script:theme.dim)

    Refresh-Ui
}

function Show-SuccessBox {
    param(
        [string]$Title = 'PIPELINE COMPLETE',
        [string]$Subtitle = 'Проверки, сборка и деплой завершены.',
        [object[]]$Details = @()
    )

    $inner = Get-InnerWidth -Preferred 70
    $green = $script:theme.green
    $elapsed = Format-Duration -Seconds ([int]((Get-Date) - $script:runStart).TotalSeconds)

    Push-LogLine ''
    Write-SectionRule -Label $Title -Rgb $green -Inner $inner -Right $elapsed -RightRgb $script:theme.muted

    foreach ($line in (Split-CardText -Text $Subtitle -Width ($inner - 4))) {
        Push-LogLine ('  ' + (Paint $line $script:theme.ink))
    }

    if ($null -ne $Details -and $Details.Count -gt 0) {
        Push-LogLine ''
        foreach ($detail in $Details) {
            $label = [string]$detail.Label
            if ($label.Length -lt 8) { $label = $label.PadRight(8) }
            Push-LogLine (
                '  ' + (Paint $label $script:theme.muted) + '  ' +
                (Paint ([string]$detail.Value) $script:theme.ink)
            )
        }
    }

    Push-LogLine ''
}

function Show-FailureBox {
    param(
        [string]$Title = 'PIPELINE FAILED',
        [string]$Hint = 'Исправь ошибки и запусти npm run launch снова.'
    )

    $inner = Get-InnerWidth -Preferred 70
    $red = $script:theme.red
    $amber = $script:theme.amber

    Push-LogLine ''
    Write-SectionRule -Label $Title -Rgb $red -Inner $inner

    if ($script:failures.Count -eq 0) {
        Push-LogLine ('  ' + (Paint '✕  Неизвестная ошибка' $amber))
    } else {
        foreach ($failure in $script:failures) {
            $wrapped = Split-CardText -Text ([string]$failure) -Width ($inner - 7)
            foreach ($line in $wrapped) {
                Push-LogLine ('  ' + (Paint '✕  ' $red) + (Paint $line $amber))
            }
        }
    }

    Push-LogLine ''
    foreach ($line in (Split-CardText -Text $Hint -Width ($inner - 4))) {
        Push-LogLine ('  ' + (Paint $line $script:theme.muted))
    }
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
    $lastRuntime = Get-Date
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
            if (((Get-Date) - $lastRuntime).TotalMilliseconds -ge 2500) {
                Update-BotRuntimeInfo -RootPid $proc.Id
                $lastRuntime = Get-Date
            }
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
    if ($Mode -eq 'Bot' -and -not $script:bootReported) {
        Show-BootReport -Force
    }
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
    $labelText = $Label

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
        Write-StepResult -Index $index -Label $Label -DurationSeconds $duration -Ok $true
        Write-LaunchLog ("step ok: {0} ({1}s)" -f $Label, $duration)
        return $true
    }

    Write-StepResult -Index $index -Label $Label -DurationSeconds $duration -Ok $false
    Write-LaunchLog ("step failed: {0} | exit={1} timedOut={2} canceled={3} | {4}" -f $Label, $state.ExitCode, $state.TimedOut, $state.Canceled, $reason)

    if (-not $ShowOutput -and $state.Tail.Count -gt 0) {
        $tail = @($state.Tail)
        $start = [Math]::Max(0, $tail.Count - 30)
        for ($i = $start; $i -lt $tail.Count; $i++) {
            Write-StreamLine -Text $tail[$i]
        }
    }
    if ($reason) {
        Push-LogLine (
            (Paint '     ↳ ' $script:theme.red) + (Paint $reason $script:theme.red)
        )
    }

    [void]$script:failures.Add($Label)
    return $false
}

# ===========================================================================
# 7. Бот: категории вывода, live-карточка, HUD
# ===========================================================================
function Get-BotCategory {
    param([string]$Text, [switch]$IsError)

    $clean = $Text
    $tag = ''

    $tagMatch = [regex]::Match($clean, '^\s*\[([a-z0-9_-]+)\]\s*', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($tagMatch.Success) {
        $rawTag = $tagMatch.Groups[1].Value.ToLowerInvariant()
        if ($rawTag -eq 'bot' -or $rawTag -eq 'web' -or $rawTag -eq 'db' -or $rawTag -eq 'err') {
            $tag = $rawTag
        }
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
        'web' { $r = 103; $g = 232; $b = 249 }
        'db'  { $r = 251; $g = 191; $b = 36 }
        'err' { $r = 251; $g = 113; $b = 133 }
        default { $r = 74; $g = 222; $b = 128 }
    }

    return [pscustomobject]@{ Tag = $tag; Text = $clean; R = $r; G = $g; B = $b }
}

function Reset-BootState {
    $script:bootActive = $false
    $script:bootGroup = ''
    $script:bootGroups = New-Object System.Collections.ArrayList
    $script:bootFacts = @{}
    $script:bootCounts = @{ ok = 0; info = 0; warn = 0; error = 0 }
    $script:bootIssues = New-Object System.Collections.ArrayList
    $script:bootReported = $false
    $script:botPid = $null
    $script:botMemoryMB = 0
}

function Add-BootFact {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [AllowEmptyString()][string]$Value,
        [string]$Status = 'ok'
    )

    if ($null -eq $script:bootFacts) { $script:bootFacts = @{} }
    $script:bootFacts[$Key] = [pscustomobject]@{ Value = $Value; Status = $Status }
}

function Get-BootGroupEntry {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($null -eq $script:bootGroups) {
        $script:bootGroups = New-Object System.Collections.ArrayList
    }
    foreach ($group in $script:bootGroups) {
        if ($group.Name -eq $Name) { return $group }
    }

    $created = [pscustomobject]@{
        Name   = $Name
        Checks = New-Object System.Collections.ArrayList
    }
    [void]$script:bootGroups.Add($created)
    return $created
}

function Find-BootGroup {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($null -eq $script:bootGroups) { return $null }
    foreach ($group in $script:bootGroups) {
        if ($group.Name -eq $Name) { return $group }
    }
    return $null
}

function Find-BootCheck {
    param(
        [Parameter(Mandatory = $true)][string]$GroupName,
        [Parameter(Mandatory = $true)][string]$CheckName
    )

    $group = Find-BootGroup -Name $GroupName
    if ($null -eq $group) { return $null }
    foreach ($check in $group.Checks) {
        if ($check.Name -eq $CheckName) { return $check }
    }
    return $null
}

function Get-BootStatusRank {
    param([string]$Status)

    switch ($Status) {
        'error' { return 3 }
        'warn'  { return 2 }
        'info'  { return 1 }
        default { return 0 }
    }
}

function Get-BootGroupStatus {
    param($Group)

    $rank = 0
    $hasOk = $false
    $hasInfo = $false
    foreach ($check in $Group.Checks) {
        if ($check.Status -eq 'ok') { $hasOk = $true }
        if ($check.Status -eq 'info') { $hasInfo = $true }
        $current = Get-BootStatusRank -Status $check.Status
        if ($current -gt $rank) { $rank = $current }
    }
    switch ($rank) {
        3 { return 'error' }
        2 { return 'warn' }
        default {
            if ($hasOk) { return 'ok' }
            if ($hasInfo) { return 'info' }
            return 'ok'
        }
    }
}

function Add-BootCheck {
    param([Parameter(Mandatory = $true)][string]$Text)

    $status = ''
    $rest = ''
    $marks = @(
        @{ Code = 0x2705; Status = 'ok' },
        @{ Code = 0x2139; Status = 'info' },
        @{ Code = 0x26A0; Status = 'warn' },
        @{ Code = 0x274C; Status = 'error' }
    )

    foreach ($mark in $marks) {
        $glyph = [string][char]$mark.Code
        if ($Text.StartsWith($glyph)) {
            $status = $mark.Status
            $rest = $Text.Substring($glyph.Length)
            $rest = $rest.Replace([string][char]0xFE0F, '').Trim()
            break
        }
    }

    if (-not $status) { return $false }

    $name = $rest
    $detail = ''
    $separator = $rest.IndexOf(' — ')
    if ($separator -lt 0) { $separator = $rest.IndexOf(' - ') }
    if ($separator -ge 0) {
        $name = $rest.Substring(0, $separator).Trim()
        $detail = $rest.Substring($separator + 3).Trim()
    }

    if (-not $name) { $name = 'Проверка' }
    if (-not $script:bootGroup) { $script:bootGroup = 'Общее' }

    $group = Get-BootGroupEntry -Name $script:bootGroup
    $check = [pscustomobject]@{ Name = $name; Status = $status; Detail = $detail }
    [void]$group.Checks.Add($check)
    $script:bootCounts[$status] = [int]$script:bootCounts[$status] + 1

    if ($status -eq 'warn' -or $status -eq 'error') {
        [void]$script:bootIssues.Add([pscustomobject]@{
            Group  = $script:bootGroup
            Name   = $name
            Status = $status
            Detail = $detail
        })
    }

    return $true
}


function Get-BootGroupLabel {
    param([string]$Name)

    switch -Regex ($Name) {
        '^Окружение$' { return 'CORE' }
        '^Конфигурация$' { return 'CONFIG' }
        '^База данных$' { return 'DATA' }
        '^Веб-панель$' { return 'PANEL' }
        '^Команды$' { return 'COMMANDS' }
        '^Tailscale$' { return 'NET' }
        '^Сервер:' { return 'SERVER' }
        default { return (Limit-Text -Text ($Name.ToUpperInvariant()) -Width 9) }
    }
}

function Get-BootStatusStyle {
    param([string]$Status)

    switch ($Status) {
        'error' { return [pscustomobject]@{ Glyph = '✖'; Rgb = $script:theme.red } }
        'warn'  { return [pscustomobject]@{ Glyph = '⚠'; Rgb = $script:theme.amber } }
        'info'  { return [pscustomobject]@{ Glyph = 'ℹ'; Rgb = $script:theme.muted } }
        default { return [pscustomobject]@{ Glyph = '✔'; Rgb = $script:theme.green } }
    }
}

function Get-BootGroupSummary {
    param($Group)

    $checks = @($Group.Checks)
    switch -Regex ($Group.Name) {
        '^Окружение$' {
            $node = Find-BootCheck -GroupName $Group.Name -CheckName 'Node.js'
            $intents = Find-BootCheck -GroupName $Group.Name -CheckName 'Intents'
            $nodeText = if ($node -and $node.Detail) { $node.Detail -replace '\s*\(.*$', '' } else { 'Node ok' }
            $intentText = if ($intents) { if ($intents.Status -eq 'ok') { 'intents ok' } else { 'intents ' + $intents.Status } } else { '' }
            if ($intentText) { return ($nodeText + ' · ' + $intentText) }
            return $nodeText
        }
        '^Конфигурация$' {
            if ($checks.Count -eq 1) { return '1 check' }
            return ('{0} checks' -f $checks.Count)
        }
        '^База данных$' {
            $schema = Find-BootCheck -GroupName $Group.Name -CheckName 'Схема'
            $file = Find-BootCheck -GroupName $Group.Name -CheckName 'Файл БД'
            $backup = Find-BootCheck -GroupName $Group.Name -CheckName 'Бэкапы'
            $parts = New-Object System.Collections.ArrayList
            if ($schema -and $schema.Detail) {
                [void]$parts.Add(($schema.Detail -replace 'версия\s*', 'schema '))
            }
            if ($file -and $file.Detail) {
                [void]$parts.Add(($file.Detail -split ' · ')[0])
            }
            if ($backup) {
                if ($backup.Detail -match '(\d+)\s*ч назад') {
                    [void]$parts.Add('backup ' + $matches[1] + 'h')
                } else {
                    [void]$parts.Add('backup ' + $backup.Status)
                }
            }
            if ($parts.Count -eq 0) { return 'online' }
            return ($parts -join ' · ')
        }
        '^Веб-панель$' {
            $availability = Find-BootCheck -GroupName $Group.Name -CheckName 'Доступность'
            $parts = New-Object System.Collections.ArrayList
            if ($script:bootFacts -and $script:bootFacts.ContainsKey('panel')) {
                $panelUrl = [string]$script:bootFacts['panel'].Value
                if ($panelUrl) { [void]$parts.Add((Limit-Text -Text $panelUrl -Width 24)) }
            }
            if ($availability -and $availability.Detail) {
                $avail = $availability.Detail
                $avail = $avail -replace 'локально', 'local'
                $avail = $avail -replace 'публично недоступно', 'public failed'
                $avail = $avail -replace 'публично доступно', 'public ok'
                $avail = $avail -replace '\s*\(fetch failed\)', ''
                [void]$parts.Add($avail)
            }
            if ($parts.Count -eq 0) { return 'disabled' }
            return ($parts -join ' · ')
        }
        '^Команды$' {
            $registration = Find-BootCheck -GroupName $Group.Name -CheckName 'Регистрация'
            if ($registration -and $registration.Detail -match '(\d+)\s+команд') {
                return ($matches[1] + ' commands')
            }
            $load = Find-BootCheck -GroupName $Group.Name -CheckName 'Загрузка'
            if ($load -and $load.Detail -match '(\d+)\s+команд') {
                return ($matches[1] + ' commands')
            }
            if ($checks.Count -eq 1) { return '1 check' }
            return ('{0} checks' -f $checks.Count)
        }
        '^Tailscale$' {
            $issues = @($checks | Where-Object { $_.Status -eq 'warn' -or $_.Status -eq 'error' })
            if ($issues.Count -eq 0) { return 'tailnet ok' }
            if ($issues.Count -eq 1) {
                return ('1 issue · ' + $issues[0].Name)
            }
            $names = @($issues | ForEach-Object { $_.Name }) -join ', '
            return ('{0} issues · {1}' -f $issues.Count, $names)
        }
        '^Сервер:' {
            $name = $Group.Name -replace '^Сервер:\s*', ''
            $members = Find-BootCheck -GroupName $Group.Name -CheckName 'Участники'
            $parts = New-Object System.Collections.ArrayList
            if ($name) { [void]$parts.Add($name) }
            if ($members -and $members.Detail -match '(\d+)\s+на сервере') {
                [void]$parts.Add($matches[1] + ' members')
            }
            return ($parts -join ' · ')
        }
        default {
            if ($checks.Count -eq 1) { return '1 check' }
            return ('{0} checks' -f $checks.Count)
        }
    }
}

function Show-BootReport {
    param([switch]$Force)

    if ($script:bootReported -and -not $Force) { return }
    if ($null -eq $script:bootGroups -or $script:bootGroups.Count -eq 0) { return }

    $inner = Get-InnerWidth -Preferred 70
    Push-LogLine ''
    Write-SectionRule -Label 'RUNTIME REPORT' -Rgb $script:theme.accent -Inner $inner -Right ('v' + (Get-PackageVersion)) -RightRgb $script:theme.muted

    foreach ($group in $script:bootGroups) {
        $status = Get-BootGroupStatus -Group $group
        $style = Get-BootStatusStyle -Status $status
        $label = Get-BootGroupLabel -Name $group.Name
        if ($label.Length -lt 9) { $label = $label.PadRight(9) }
        $detail = Get-BootGroupSummary -Group $group

        $prefixPlain = '  ' + $style.Glyph + '  ' + $label + '  '
        $detailBudget = [Math]::Max(8, $inner - $prefixPlain.Length + 2)
        $detail = Limit-Text -Text $detail -Width $detailBudget
        Push-LogLine (
            '  ' + (Paint $style.Glyph $style.Rgb) + '  ' +
            (Paint $label $script:theme.muted) + '  ' +
            (Paint $detail $script:theme.ink)
        )

        if ($status -eq 'warn' -or $status -eq 'error') {
            foreach ($issue in @($group.Checks | Where-Object { $_.Status -eq 'warn' -or $_.Status -eq 'error' })) {
                $issueText = [string]$issue.Name
                if ($issue.Detail) { $issueText += ' — ' + $issue.Detail }
                foreach ($wrapped in (Split-CardText -Text $issueText -Width ($inner - 14))) {
                    Push-LogLine (
                        '  ' + (' ' * 11) + (Paint '↳ ' $style.Rgb) +
                        (Paint $wrapped $script:theme.amber)
                    )
                }
            }
        }
    }

    $ok = [int]$script:bootCounts['ok']
    $info = [int]$script:bootCounts['info']
    $warn = [int]$script:bootCounts['warn']
    $errors = [int]$script:bootCounts['error']
    $verdict = if ($errors -gt 0) {
        'ACTION REQUIRED'
    } elseif ($warn -gt 0) {
        'READY WITH WARNINGS'
    } else {
        'READY'
    }
    $verdictRgb = if ($errors -gt 0) { $script:theme.red } elseif ($warn -gt 0) { $script:theme.amber } else { $script:theme.green }
    $summary = ('{0} ok · {1} info · {2} warn · {3} errors' -f $ok, $info, $warn, $errors)

    Write-SectionRule -Inner $inner
    $gap = [Math]::Max(2, $inner - $summary.Length - $verdict.Length - 2)
    Push-LogLine (
        '  ' + (Paint $summary $script:theme.muted) + (' ' * $gap) +
        (Paint $verdict $verdictRgb)
    )
    Write-SectionRule -Inner $inner
    Push-LogLine ''

    $script:bootReported = $true
    $script:bootActive = $false
}

function Test-BootLine {
    param(
        [AllowEmptyString()][string]$Text,
        [switch]$IsError
    )

    if ($IsError) { return $false }
    $raw = $Text.Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) { return $true }
    $t = $raw
    $leadMarks = @('✅', 'ℹ️', 'ℹ', '⚠️', '⚠', '❌', '✔', '✓', '✖', '✕')
    foreach ($lead in $leadMarks) {
        if ($t.StartsWith($lead)) {
            $t = $t.Substring($lead.Length).Trim()
            break
        }
    }
    if ([string]::IsNullOrWhiteSpace($t)) { return $true }

    # Служебный шум npm / устаревший ASCII-баннер / отчёт самого бота.
    if ($t -match '^>\s') { return $true }
    if ($t -match '^\[predev\]') { return $true }
    if ($t -match '^Discord moderation bot') { return $true }
    if ($t -match '^[─━═]{5,}$') { return $true }
    if ($t -match '█|╔|╚|║|╗|╝|╠|╣|╬') { return $true }
    if ($t -match '^\[startup\]') { return $true }

    $detail = if ($t -match ' — (.+)$') { $matches[1] } else { '' }

    if ($t -match '^Конфигурация проверена') {
        Add-BootFact -Key 'config' -Value $detail
        return $true
    }
    if ($t -match '^Подключаюсь к Discord') {
        Add-BootFact -Key 'discord' -Value $detail
        if ($t -match 'команд:\s*(\d+)') { Add-BootFact -Key 'commands' -Value $matches[1] }
        if ($t -match 'серверов:\s*(\d+)') { Add-BootFact -Key 'guilds' -Value $matches[1] }
        return $true
    }
    if ($t -match '^Планировщик наказаний') {
        Add-BootFact -Key 'scheduler' -Value $detail
        return $true
    }
    if ($t -match '^Авто-бэкап БД') {
        Add-BootFact -Key 'backup' -Value $detail
        return $true
    }
    if ($t -match '^Запускаю веб-панель') {
        Add-BootFact -Key 'panel' -Value $detail
        return $true
    }
    if ($t -match '^https?://') {
        Add-BootFact -Key 'panel' -Value $t
        return $true
    }
    if ($t -match '^Веб-панель:\s*(.+)$') {
        Add-BootFact -Key 'panel' -Value $matches[1]
        return $true
    }
    if ($t -match '^Локально:\s*(.+)$') {
        Add-BootFact -Key 'local' -Value $matches[1]
        return $true
    }
    if ($t -match '^Остановка:') { return $true }
    if ($t -match '^✦') { return $true }

    $groups = @('Окружение', 'Конфигурация', 'База данных', 'Веб-панель', 'Команды', 'Tailscale')
    if ($t -eq 'Окружение') {
        $script:bootActive = $true
        $script:bootGroup = 'Окружение'
        return $true
    }
    if ($script:bootActive -and ($groups -contains $t -or $t -like 'Сервер:*')) {
        $script:bootGroup = $t
        return $true
    }

    if ($t -match '^Итог проверок:') {
        Show-BootReport
        return $true
    }
    if ($t -match '^Критичных ошибок') { return $true }
    if ($t -match '^Бот готов') {
        Show-BootReport
        return $true
    }

    if ($script:bootActive) {
        if (Add-BootCheck -Text $raw) { return $true }
        if ($t -match '^STARTUP_STRICT') { return $false }
        return $true
    }

    return $false
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
    if (Test-BootLine -Text $cat.Text -IsError:$IsError) { return }

    $body = $cat.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($body)) { return }

    $glyph = '·'
    $rgb = $script:theme.dim
    $marks = @(
        @{ Glyph = '✅'; Status = 'ok' },
        @{ Glyph = 'ℹ'; Status = 'info' },
        @{ Glyph = '⚠'; Status = 'warn' },
        @{ Glyph = '❌'; Status = 'error' },
        @{ Glyph = '✔'; Status = 'ok' },
        @{ Glyph = '✓'; Status = 'ok' },
        @{ Glyph = '✖'; Status = 'error' },
        @{ Glyph = '✕'; Status = 'error' }
    )
    foreach ($mark in $marks) {
        if ($body.StartsWith($mark.Glyph)) {
            switch ($mark.Status) {
                'ok' { $glyph = '✔'; $rgb = $script:theme.green }
                'info' { $glyph = 'ℹ'; $rgb = $script:theme.muted }
                'warn' { $glyph = '⚠'; $rgb = $script:theme.amber }
                default { $glyph = '✖'; $rgb = $script:theme.red }
            }
            $body = $body.Substring($mark.Glyph.Length).Replace([string][char]0xFE0F, '').Trim()
            break
        }
    }

    if ($IsError -or $cat.Tag -eq 'err') {
        $glyph = '✖'
        $rgb = $script:theme.red
    }

    $tagText = if ($cat.Tag -eq 'bot' -and -not $IsError) {
        ''
    } else {
        $cat.Tag.ToUpperInvariant()
    }
    $catRgb = @($cat.R, $cat.G, $cat.B)
    $stamp = Get-Date -Format 'HH:mm:ss'
    $plainPrefixLength = 2 + 8 + 2 + 1 + 2
    if ($tagText) { $plainPrefixLength += $tagText.Length + 2 }

    if ($script:uiReady) {
        $max = $script:uiWidth - $plainPrefixLength - 1
        if ($max -lt 20) { $max = 20 }
        $body = Limit-Text -Text $body -Width $max
    }

    $colored = (Paint ('  ' + $stamp) $script:theme.dim) +
        (Paint ('  ' + $glyph) $rgb)
    if ($tagText) {
        $colored += (Paint ('  ' + $tagText) $catRgb)
    }
    $colored += (Paint ('  ' + $body) $script:theme.ink)
    Push-LogLine $colored
}

function Show-LiveBanner {
    param(
        [string]$Mode,
        [string]$Url,
        [string]$Version
    )

    $inner = Get-InnerWidth -Preferred 70
    $muted = $script:theme.muted
    $script:liveUrl = $Url

    $left = '● LIVE'
    $right = 'v' + $Version
    Push-LogLine ''
    Write-SectionRule -Label 'RUNTIME' -Rgb $script:theme.accent -Inner $inner -Right $right -RightRgb $muted

    $urlText = Limit-Text -Text $Url -Width ([Math]::Max(12, $inner - 20))
    Push-LogLine (
        '  ' + (Paint $left $script:theme.green) + '  ' +
        (Paint $Mode $script:theme.accent) + '  ' +
        (Paint '·' $script:theme.dim) + '  ' +
        (Paint $urlText $script:theme.cyan)
    )

    $stream = if ($Dev) { 'npm run dev' } else { 'npm run start' }
    Push-LogLine (
        '  ' + (Paint 'stream' $muted) + '  ' +
        (Paint $stream $script:theme.dim) + '  ' +
        (Paint '·' $script:theme.dim) + '  ' +
        (Paint 'Ctrl+C to stop' $script:theme.dim)
    )
    Push-LogLine ''
}

function Hide-LiveUi {
    if ($script:interactive -and $script:uiReady) {
        # Плавное затухание HUD перед выходом.
        for ($i = 4; $i -ge 0; $i--) {
            $t = $i / 4.0
            $r = Get-Lerp -From 74 -To 70 -T $t
            $g = Get-Lerp -From 84 -To 220 -T $t
            $b = Get-Lerp -From 108 -To 150 -T $t
            $rgb = @($r, $g, $b)
            $script:stepLine = (Paint '  ●' $rgb) + ' ' + (Paint 'LIVE' $rgb)
            $script:barLine = (Paint '  NEXUS' $rgb) + (Paint '  ·  ' $script:theme.dim) + (Paint $script:liveMode $rgb)
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

    $mode = Get-LaunchMode
    $script:liveMode = $mode

    $subtitle = if ($SkipDeploy) {
        'Проверки и сборка завершены · deploy пропущен.'
    } elseif ($ChecksOnly) {
        'Проверки и сборка завершены · бот не запускается.'
    } else {
        'Проверки, сборка и деплой завершены.'
    }

    if (-not $StartOnly) {
        $details = @(
            @{ Label = 'VERSION'; Value = 'v' + $version },
            @{ Label = 'MODE'; Value = $mode },
            @{ Label = 'PANEL'; Value = $publicUrl },
            @{ Label = 'LOCAL'; Value = $localUrl }
        )
        if (-not $ChecksOnly) {
            $details += @{ Label = 'STOP'; Value = 'Ctrl+C' }
        }

        $title = if ($ChecksOnly) { 'CHECKS COMPLETE' } else { 'PIPELINE COMPLETE' }
        Show-SuccessBox -Title $title -Subtitle $subtitle -Details $details
    }

    if ($ChecksOnly) {
        Push-LogLine (
            (Paint '  ℹ  ' $script:theme.cyan) + (Paint 'checks-only: бот не запускается.' $script:theme.muted)
        )
        Push-LogLine ''
        Hide-Ui
        Write-LaunchLog 'checks-only mode: bot start skipped'
        return 0
    }

    $startArgs = if ($Dev) { @('run', 'dev') } else { @('run', 'start') }
    Write-LaunchLog ("starting bot: npm {0}" -f ($startArgs -join ' '))

    Reset-BootState
    Show-LiveBanner -Mode $mode -Url $publicUrl -Version $version

    if ($script:uiReady) {
        Show-Hud -Uptime ([TimeSpan]::Zero) -MemoryMB 0 -Events 0
    }

    if (Test-Canceled) {
        $script:canceled = $true
        Hide-LiveUi
        Push-LogLine ((Paint '  ■  Запуск отменён пользователем.' $script:theme.amber))
        return 130
    }

    $state = Start-NpmProcess -NpmArgs $startArgs -TimeoutSeconds 0
    Write-LaunchLog ("bot process started: pid={0}" -f $state.Process.Id)
    Update-BotRuntimeInfo -RootPid $state.Process.Id

    Wait-NpmProcess -State $state -Mode Bot -TimeoutSeconds 0

    $code = $state.ExitCode
    if ($null -eq $code) { $code = 1 }

    Write-LaunchLog ("bot exited with code {0} canceled={1}" -f $code, $state.Canceled)
    Hide-LiveUi
    Push-LogLine ''

    if ($state.Canceled) {
        Push-LogLine ((Paint '  ■  NEXUS остановлен.' $script:theme.muted))
        Push-LogLine ((Paint '  Завершение по Ctrl+C — процесс остановлен корректно.' $script:theme.dim))
        return 130
    }

    if ($code -ne 0) {
        Push-LogLine ((Paint ("  ✕  Процесс завершился с кодом $code.") $script:theme.red))
        if ($InWindow) {
            Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null
        }
        return [int]$code
    }

    Push-LogLine ((Paint '  ■  NEXUS остановлен.' $script:theme.muted))
    return 0
}

# ===========================================================================
# 7a. Уведомления и режим launch:live
# ===========================================================================
function Show-DesktopToast {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet('Info', 'Error')][string]$Kind = 'Info'
    )

    $text = $Message
    if ($text.Length -gt 250) { $text = $text.Substring(0, 247) + '...' }

    try {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing

        if (-not $script:toastIcon) {
            $script:toastIcon = New-Object System.Windows.Forms.NotifyIcon
            $script:toastIcon.Text = 'NEXUS'
            $script:toastIcon.Visible = $true
        }

        if ($Kind -eq 'Error') {
            $script:toastIcon.Icon = [System.Drawing.SystemIcons]::Error
            $script:toastIcon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Error
        } else {
            $script:toastIcon.Icon = [System.Drawing.SystemIcons]::Information
            $script:toastIcon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
        }

        $script:toastIcon.BalloonTipTitle = $Title
        $script:toastIcon.BalloonTipText = $text
        $script:toastIcon.ShowBalloonTip(10000)
        Write-LaunchLog ("toast [{0}] {1} | {2}" -f $Kind, $Title, $text)
    } catch {
        Write-LaunchLog ("toast failed: " + $_.Exception.Message)
    }

    try {
        if ($Kind -eq 'Error') {
            [Console]::Beep(880, 180)
            [Console]::Beep(660, 320)
        } else {
            [Console]::Beep(1046, 180)
        }
    } catch { }
}

function Get-PortOwnerPid {
    param([int]$Port)

    try {
        $lines = netstat -ano -p tcp
        foreach ($line in $lines) {
            if ($line -match (':' + $Port + '\s+\S+\s+LISTENING\s+(\d+)')) {
                return [int]$matches[1]
            }
        }
    } catch { }

    try {
        $ownerPid = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop |
            Where-Object { $_.OwningProcess -gt 0 } |
            Select-Object -First 1 -ExpandProperty OwningProcess
        if ($ownerPid) { return [int]$ownerPid }
    } catch { }

    return $null
}

function Wait-PanelHealth {
    param(
        [int]$TimeoutSeconds = 60,
        [int]$ExpectPidChangeFrom = 0
    )

    $portText = Read-EnvValue -Key 'WEB_PORT' -Fallback '8080'
    if ([string]::IsNullOrWhiteSpace($portText)) { $portText = '8080' }
    $port = [int]$portText
    $url = "http://127.0.0.1:$port/health"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if (Test-Canceled) { return $false }
        try {
            $response = Invoke-RestMethod -Uri $url -TimeoutSec 2
            if ($response -and $response.ok) {
                if ($ExpectPidChangeFrom -gt 0) {
                    $owner = Get-PortOwnerPid -Port $port
                    if ($owner -and $owner -eq $ExpectPidChangeFrom) {
                        # Отвечает прошлый экземпляр — новый ещё не поднялся.
                        Start-Sleep -Milliseconds 700
                        continue
                    }
                }
                Write-LaunchLog ("live: panel healthy at {0} (version {1})" -f $url, $response.version)
                return $true
            }
        } catch { }
        Start-Sleep -Milliseconds 700
    }

    Write-LaunchLog ("live: panel health timeout at {0}" -f $url)
    return $false
}

function Start-BotWindow {
    $arguments = @(
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + $script:scriptPath + '"'),
        '-StartOnly'
    )
    if ($Dev) { $arguments += '-Dev' }

    $spawned = $false
    $wt = Get-Command wt.exe -ErrorAction SilentlyContinue

    if ($wt) {
        try {
            $wtArgs = @('-w', '-1', 'new-tab', '--title', 'NEXUS-LIVE', 'powershell.exe') + $arguments
            Start-Process -FilePath $wt.Source -ArgumentList $wtArgs -ErrorAction Stop | Out-Null
            Write-LaunchLog 'live: spawned Windows Terminal tab NEXUS-LIVE'
            $spawned = $true
        } catch {
            Write-LaunchLog ("live: wt.exe failed: " + $_.Exception.Message)
        }
    }

    if (-not $spawned) {
        try {
            Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -ErrorAction Stop | Out-Null
            Write-LaunchLog 'live: spawned powershell.exe window NEXUS-LIVE'
            $spawned = $true
        } catch {
            Write-LaunchLog ("live: powershell.exe failed: " + $_.Exception.Message)
        }
    }

    return $spawned
}

if ($StartOnly) {
    $InWindow = $true
    Show-Banner
    Initialize-Ui
    $code = Start-Nexus
    if ($null -eq $code) { $code = 1 }
    if ($code -ne 0 -and $code -ne 130 -and $script:interactive) {
        Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null
    }
    exit $code
}

# ===========================================================================
# 8. Перезапуск в новом окне
# ===========================================================================
if (-not $InWindow -and -not $NoNewWindow) {
    Write-Host ''
    Write-Host ('  ' + (Paint 'NEXUS' $script:theme.violet) + (Paint '  ·  release control' $script:theme.muted))
    Write-Host ('  ' + (Paint 'открываю новое окно…' $script:theme.dim))
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

    Write-Host ((Paint '  ⚠  Не удалось открыть новое окно — продолжаю в текущем.' $script:theme.amber))
    Start-Sleep -Milliseconds 500
}

# ===========================================================================
# 8a. launch:live — сначала бот и панель, потом проверки
# ===========================================================================
if ($StartFirst) {
    Show-Banner
    Initialize-Ui

    $resultFile = Join-Path $script:root 'data\verify-result.json'
    if (Test-Path -LiteralPath $resultFile) {
        Remove-Item -LiteralPath $resultFile -Force -ErrorAction SilentlyContinue
    }

    $buildNeeded = -not (Test-Path -LiteralPath (Join-Path $script:root 'dist\index.js'))
    $script:phaseNames = @(if ($buildNeeded) { 'BUILD'; 'VERIFY' } else { 'VERIFY' })
    $script:totalSteps = $script:phaseNames.Count
    $script:liveMode = 'LIVE'

    Write-LaunchLog ("live mode: buildNeeded={0} totalSteps={1}" -f $buildNeeded, $script:totalSteps)

    if ($buildNeeded) {
        Push-LogLine ''
        Write-SectionRule -Label 'PRE-BUILD' -Rgb $script:theme.amber -Inner (Get-InnerWidth -Preferred 70)
        Push-LogLine ((Paint '  ⚠  ' $script:theme.amber) + (Paint 'dist/index.js не найден — сначала соберу проект.' $script:theme.amber))
        $built = Invoke-NpmStep -Label 'Сборка · перед первым запуском' -NpmArgs @('run', 'build') -ShowOutput
        if (-not $built) {
            Show-DesktopToast -Title 'NEXUS · сборка не удалась' -Message 'Бот не запущен. Подробности в data\launch.log.' -Kind Error
            Hide-Ui
            Show-FailureBox -Title 'BUILD FAILED' -Hint 'Сборка не прошла. Исправь ошибки и повтори npm run launch:live.'
            if ($InWindow) { Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null }
            exit 1
        }
    }

    Push-LogLine ''
    Write-SectionRule -Label 'RUNTIME' -Rgb $script:theme.green -Inner (Get-InnerWidth -Preferred 70)
    Push-LogLine ((Paint '  ●  ' $script:theme.green) + (Paint 'Поднимаю бота и панель в окне NEXUS-LIVE…' $script:theme.ink))

    $webEnabled = (Read-EnvValue -Key 'WEB_ENABLED' -Fallback 'false') -eq 'true'
    $portText = Read-EnvValue -Key 'WEB_PORT' -Fallback '8080'
    if ([string]::IsNullOrWhiteSpace($portText)) { $portText = '8080' }
    $panelUrl = Read-EnvValue -Key 'WEB_PUBLIC_URL' -Fallback ''
    if ([string]::IsNullOrWhiteSpace($panelUrl)) { $panelUrl = "http://127.0.0.1:$portText" }
    $beforeOwner = if ($webEnabled) { Get-PortOwnerPid -Port ([int]$portText) } else { $null }

    $spawned = Start-BotWindow
    if ($spawned) {
        Push-LogLine ((Paint '  ·  ' $script:theme.dim) + (Paint 'Проверки идут параллельно с запуском бота.' $script:theme.muted))
    }

    Push-LogLine ''
    Write-SectionRule -Label 'VERIFY' -Rgb $script:theme.accent -Inner (Get-InnerWidth -Preferred 70)
    $checksOk = Invoke-NpmStep -Label 'Проверки · typecheck, lint, формат, тесты' -NpmArgs @('run', 'verify') -ShowOutput

    $botUp = $false
    if ($spawned) {
        if ($webEnabled) {
            Push-LogLine ((Paint '  ·  ' $script:theme.dim) + (Paint 'Жду /health панели (до 60 с)…' $script:theme.muted))
            $expectedFrom = if ($beforeOwner) { [int]$beforeOwner } else { 0 }
            $botUp = Wait-PanelHealth -TimeoutSeconds 60 -ExpectPidChangeFrom $expectedFrom
        } else {
            $botUp = $true
            Push-LogLine ((Paint '  ·  ' $script:theme.dim) + (Paint 'WEB_ENABLED=false — панель не проверяю.' $script:theme.muted))
        }
    }

    if (-not $botUp) {
        Push-LogLine ((Paint '  ✕  ' $script:theme.red) + (Paint 'Бот или панель не поднялись — смотри окно NEXUS-LIVE.' $script:theme.amber))
        Write-LaunchLog 'live: bot start failed or health timeout'
        Show-DesktopToast -Title 'NEXUS · бот не поднялся' -Message 'Проверь окно NEXUS-LIVE и data\launch.log.' -Kind Error
        [void]$script:failures.Add('Запуск бота и панели')
    }

    if ($checksOk -and $botUp) {
        $script:step = $script:totalSteps + 1
        Show-Progress
    }

    $summary = $null
    if (Test-Path -LiteralPath $resultFile) {
        try {
            $summary = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
        } catch {
            Write-LaunchLog ("live: cannot read verify result: " + $_.Exception.Message)
        }
    }

    $liveOk = $checksOk -and $botUp
    $failureTitle = 'BOT NOT READY'
    $failureHint = 'Проверь окно NEXUS-LIVE и data\launch.log. Проверки уже зелёные.'

    Push-LogLine ''
    if ($checksOk -and $botUp) {
        $panelValue = if ($webEnabled) { $panelUrl } else { 'WEB_ENABLED=false' }
        $details = @(
            @{ Label = 'PANEL'; Value = $panelValue },
            @{ Label = 'STATUS'; Value = 'бот и панель работают' },
            @{ Label = 'NEXT'; Value = 'перезапуск после npm run build' }
        )
        Show-SuccessBox -Title 'CHECKS PASSED · BOT LIVE' -Subtitle 'TypeScript, ESLint, Prettier и тесты зелёные.' -Details $details
        Show-DesktopToast -Title 'NEXUS · проверки прошли' -Message 'TypeScript, ESLint, Prettier и тесты зелёные. Бот работает.' -Kind Info
        Write-LaunchLog 'live: checks passed'
    } elseif (-not $checksOk) {
        $detail = if ($summary -and $summary.failedLabel) { [string]$summary.failedLabel } else { 'см. data\verify.log' }
        Push-LogLine ((Paint '  ✕  ' $script:theme.red) + (Paint ('Проверки упали: ' + $detail) $script:theme.red))
        Push-LogLine ((Paint '  Бот не останавливается. Исправь ошибки и повтори npm run launch:live.' $script:theme.muted))
        Show-DesktopToast -Title 'NEXUS · проверки упали' -Message ("Шаг: $detail. Подробности: data\verify.log") -Kind Error
        Write-LaunchLog ("live: checks failed at {0}" -f $detail)
        $failureTitle = 'CHECKS FAILED'
        $failureHint = 'Исправь ошибки и повтори npm run launch:live. Подробности: data\verify.log.'
    } else {
        Push-LogLine ((Paint '  ⚠  ' $script:theme.amber) + (Paint 'Проверки прошли, но бот/панель не поднялись.' $script:theme.amber))
    }

    if (-not $liveOk) {
        Hide-Ui
        Show-FailureBox -Title $failureTitle -Hint $failureHint
        if ($InWindow) { Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null }
        exit 1
    }

    Hide-Ui
    if ($InWindow) { Read-Host '  Проверки пройдены. Enter — закрыть окно' | Out-Null }
    exit 0
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
        Push-LogLine ((Paint '  ⚠  Deploy пропущен: сначала исправь ошибки выше.' $script:theme.amber))
        Push-LogLine ''
        continue
    }

    $result = Invoke-NpmStep -Label $definition.Label -NpmArgs $definition.Args -ShowOutput:$definition.Show
    if (-not $result) { $ok = $false }

    if ($script:canceled) { break }
}

if ($ok -and -not $script:canceled) {
    $script:step = $script:totalSteps + 1
    Show-Progress
}

# ===========================================================================
# 10. Итог
# ===========================================================================
if ($script:canceled) {
    Hide-Ui
    Push-LogLine ''
    Push-LogLine ((Paint '  ■  Остановлено пользователем (Ctrl+C).' $script:theme.amber))
    Push-LogLine ((Paint '  Пайплайн прерван, дочерние процессы остановлены.' $script:theme.muted))
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
