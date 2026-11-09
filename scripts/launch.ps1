#requires -Version 5.1
# ВАЖНО: файл должен быть сохранён как UTF-8 with BOM.
# Windows PowerShell 5.1 без BOM читает кириллицу, символы брайля и блочную
# псевдографику как ANSI — баннер, рамки и спиннер превращаются в мусор.
# В PowerShell 7+ BOM не обязателен.
<#
.SYNOPSIS
    NEXUS release pipeline для Windows PowerShell 5.1+.

.DESCRIPTION
    Красивая консольная обёртка над npm-скриптами проекта NEXUS:
    stop -> typecheck -> lint -> format:check -> test -> build -> deploy.
    Каждый шаг выполняется в фоновом job (ThreadJob или Start-Job) с
    braille-спиннером, прогресс-баром, записью в data/launch.log и
    корректной обработкой exit code.

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
$script:useTrueColor = [bool]$env:WT_SESSION -or ($env:COLORTERM -match 'truecolor|24bit') -or ($env:TERM_PROGRAM -eq 'vscode')

$script:interactive = $true
try { $script:interactive = -not [Console]::IsOutputRedirected } catch { }

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $Host.UI.RawUI.WindowTitle = 'NEXUS // RELEASE PIPELINE' } catch { }

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
# 1. npm, ANSI-палитра и вспомогательные функции
# ===========================================================================
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npmCmd) {
    throw 'npm не найден в PATH. Установи Node.js 22+ и перезапусти терминал.'
}
$npm = if ($npmCmd.Path) { $npmCmd.Path } else { $npmCmd.Source }

# ThreadJob легче Start-Job, но в Windows PowerShell 5.1 его может не быть.
# Проверяем модуль и прозрачно откатываемся на Start-Job.
$script:threadJobAvailable = $false
try {
    # В PS 5.1 модуль называется ThreadJob, в PS 7 — Microsoft.PowerShell.ThreadJob.
    $threadJobModules = @(
        Get-Module -ListAvailable -Name 'ThreadJob' -ErrorAction SilentlyContinue
        Get-Module -ListAvailable -Name 'Microsoft.PowerShell.ThreadJob' -ErrorAction SilentlyContinue
    )
    if ($threadJobModules.Count -gt 0) {
        Import-Module -Name $threadJobModules[0].Name -ErrorAction Stop
    }
    $script:threadJobAvailable = $null -ne (Get-Command Start-ThreadJob -ErrorAction SilentlyContinue)
} catch {
    $script:threadJobAvailable = $null -ne (Get-Command Start-ThreadJob -ErrorAction SilentlyContinue)
}
$jobEngine = if ($script:threadJobAvailable) { 'Start-ThreadJob' } else { 'Start-Job (ThreadJob module not found)' }
Write-LaunchLog ("job engine: $jobEngine")

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

# Best-effort включение VT-последовательностей в старом conhost.
# В Windows Terminal не требуется: там truecolor работает из коробки.
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

function Get-Ansi16 {
    param(
        [int]$R,
        [int]$G,
        [int]$B
    )

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

function Show-Banner {
    if ($NoBanner) { return }

    try { Clear-Host } catch { }

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

    Line ''
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $lineText = $lines[$i]
        $color = $colors[$i]
        Line (C $lineText $color[0] $color[1] $color[2])
    }
    Line ''
    Line ('  ' + (C 'DISCORD MODERATION SUITE' 141 150 180) + (C '  ·  ' 70 78 102) + (C 'RELEASE PIPELINE' 84 184 255))
    Line ('  ' + (C ('─' * 62) 54 62 86))
    Line ''
}

function Show-Progress {
    $filled = [Math]::Min($script:step, $script:totalSteps)
    $empty = [Math]::Max(0, $script:totalSteps - $filled)
    $bar = ('█' * $filled) + ('░' * $empty)

    Line ('  ' + (C 'PIPELINE' 141 150 180) + '  ' + (C $bar 102 115 255) + '  ' + (C "$filled/$($script:totalSteps)" 84 184 255))
    Line ''
}

function Show-SuccessBox {
    param([string]$Subtitle = 'Проверки, сборка и деплой завершены.')

    $inner = 62
    $blank = ''.PadRight($inner)
    $title = '  ✔  RELEASE READY'
    $subtitleText = '  ' + $Subtitle

    Line ''
    Line ('  ' + (C ('┌' + ('─' * $inner) + '┐') 61 214 140))
    Line ('  ' + (C '│' 61 214 140) + (C ($title.PadRight($inner)) 61 214 140) + (C '│' 61 214 140))
    Line ('  ' + (C '│' 61 214 140) + (C $blank 61 214 140) + (C '│' 61 214 140))
    Line ('  ' + (C '│' 61 214 140) + (C ($subtitleText.PadRight($inner)) 180 188 210) + (C '│' 61 214 140))
    Line ('  ' + (C ('└' + ('─' * $inner) + '┘') 61 214 140))
    Line ''
}

function Show-FailureBox {
    $inner = 62
    $blank = ''.PadRight($inner)
    $hint = '  Исправь ошибки и запусти npm run launch снова.'

    Line ''
    Line ('  ' + (C ('┌' + ('─' * $inner) + '┐') 255 95 109))
    Line ('  ' + (C '│' 255 95 109) + (C ('  ✖  PIPELINE FAILED'.PadRight($inner)) 255 95 109) + (C '│' 255 95 109))
    Line ('  ' + (C '│' 255 95 109) + (C $blank 255 95 109) + (C '│' 255 95 109))

    if ($script:failures.Count -eq 0) {
        Line ('  ' + (C '│' 255 95 109) + (C ('  ✖ Неизвестная ошибка'.PadRight($inner)) 255 176 32) + (C '│' 255 95 109))
    } else {
        foreach ($failure in $script:failures) {
            $text = '  ✖ ' + [string]$failure
            if ($text.Length -gt ($inner - 2)) {
                $text = $text.Substring(0, $inner - 5) + '...'
            }
            Line ('  ' + (C '│' 255 95 109) + (C ($text.PadRight($inner)) 255 176 32) + (C '│' 255 95 109))
        }
    }

    Line ('  ' + (C '│' 255 95 109) + (C $blank 255 95 109) + (C '│' 255 95 109))
    Line ('  ' + (C '│' 255 95 109) + (C ($hint.PadRight($inner)) 180 188 210) + (C '│' 255 95 109))
    Line ('  ' + (C ('└' + ('─' * $inner) + '┘') 255 95 109))
    Line ''
}

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

function Get-JobErrorText {
    param(
        [Parameter(Mandatory = $true)]$Job,
        [object[]]$StreamErrors = @()
    )

    $parts = @()

    # Причина остановки: у ThreadJob — на самом Job, у Start-Job — на ChildJob.
    if ($Job.JobStateInfo.Reason) {
        $msg = $Job.JobStateInfo.Reason.Message
        if (-not $msg) { $msg = [string]$Job.JobStateInfo.Reason }
        if ($msg) { $parts += $msg }
    }
    foreach ($child in @($Job.ChildJobs)) {
        if ($child -and $child.JobStateInfo.Reason) {
            $msg = $child.JobStateInfo.Reason.Message
            if (-not $msg) { $msg = [string]$child.JobStateInfo.Reason }
            if ($msg) { $parts += $msg }
        }
    }

    # ThreadJob складывает ошибки в $Job.Error, Start-Job — в ChildJobs[*].Error.
    $errorRecords = @()
    if ($Job.Error) { $errorRecords += @($Job.Error) }
    foreach ($child in @($Job.ChildJobs)) {
        if ($child -and $child.Error) { $errorRecords += @($child.Error) }
    }
    foreach ($streamError in $StreamErrors) {
        if ($streamError) { $errorRecords += @($streamError) }
    }

    foreach ($errorRecord in $errorRecords) {
        $msg = $errorRecord.ToString()
        if ($msg) { $parts += $msg }
    }

    return (($parts | Select-Object -Unique) -join ' | ')
}

function Invoke-NpmStep {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string[]]$NpmArgs,
        [switch]$ShowOutput
    )

    $script:step += 1
    $index = $script:step
    $startedAt = Get-Date
    $labelText = "[$index/$($script:totalSteps)] $Label"

    Write-LaunchLog ("step {0}/{1} start: {2} | npm {3}" -f $index, $script:totalSteps, $Label, ($NpmArgs -join ' '))

    $frames = @('⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏')
    $spinnerWidth = 110
    if ($script:interactive) {
        try {
            if ([Console]::WindowWidth -gt 40) {
                $spinnerWidth = [Math]::Min(110, [Console]::WindowWidth - 1)
            }
        } catch { }
    }

    $jobPayload = [pscustomobject]@{
        Root = $script:root
        Npm  = $npm
        Args = $NpmArgs
    }

    $jobScript = {
        param($Payload)

        Set-Location -LiteralPath ([string]$Payload.Root)
        $npmPath = [string]$Payload.Npm
        $argList = @($Payload.Args)

        & $npmPath @argList 2>&1 | ForEach-Object { $_.ToString() }
        $code = $LASTEXITCODE

        Write-Output ("::NEXUS_EXIT::{0}" -f $code)
        if ($code -ne 0) {
            throw "npm exited with code $code"
        }
    }

    if ($script:threadJobAvailable) {
        try {
            $job = Start-ThreadJob -ScriptBlock $jobScript -ArgumentList $jobPayload
        } catch {
            Write-LaunchLog ("Start-ThreadJob failed, falling back to Start-Job: " + $_.Exception.Message)
            $job = Start-Job -ScriptBlock $jobScript -ArgumentList $jobPayload
        }
    } else {
        $job = Start-Job -ScriptBlock $jobScript -ArgumentList $jobPayload
    }

    $frame = 0
    $collected = New-Object System.Collections.Generic.List[string]
    $jobErrors = @()
    $exitCode = $null
    $state = $job.State

    while ($true) {
        $state = $job.State

        if ($state -ne 'NotStarted') {
            $chunk = @(Receive-Job -Job $job -ErrorAction SilentlyContinue -ErrorVariable +jobErrors)
            foreach ($item in $chunk) {
                $text = if ($null -eq $item) { '' } else { ([string]$item).Replace("`r", '') }
                if ($text -match '^::NEXUS_EXIT::(-?\d+)$') {
                    $exitCode = [int]$Matches[1]
                    continue
                }
                $collected.Add($text)
                if ($ShowOutput) {
                    if ($script:interactive) {
                        [Console]::Write("`r" + (' ' * $spinnerWidth) + "`r")
                        [Console]::Out.Flush()
                    }
                    Write-Host ('     ' + $text) -ForegroundColor DarkGray
                }
            }
        }

        if ($state -eq 'Blocked') {
            Write-LaunchLog "step blocked: $Label"
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            break
        }
        if ($state -ne 'Running' -and $state -ne 'NotStarted') { break }

        if ($script:interactive) {
            $spin = $frames[$frame % $frames.Count]
            $elapsed = [int](((Get-Date) - $startedAt).TotalSeconds)
            $visible = '  ' + $spin + ' ' + $labelText + '  ' + $elapsed + 's'
            $pad = [Math]::Max(0, $spinnerWidth - $visible.Length)

            [Console]::Write("`r  " + (C $spin 102 115 255) + ' ' + $labelText + '  ' + (C ($elapsed.ToString() + 's') 84 184 255) + (' ' * $pad))
            [Console]::Out.Flush()
        }

        Start-Sleep -Milliseconds 75
        $frame += 1
    }

    Wait-Job -Job $job | Out-Null

    $tailChunk = @(Receive-Job -Job $job -ErrorAction SilentlyContinue -ErrorVariable +jobErrors)
    foreach ($item in $tailChunk) {
        $text = if ($null -eq $item) { '' } else { ([string]$item).Replace("`r", '') }
        if ($text -match '^::NEXUS_EXIT::(-?\d+)$') {
            $exitCode = [int]$Matches[1]
            continue
        }
        $collected.Add($text)
        if ($ShowOutput) {
            if ($script:interactive) {
                [Console]::Write("`r" + (' ' * $spinnerWidth) + "`r")
                [Console]::Out.Flush()
            }
            Write-Host ('     ' + $text) -ForegroundColor DarkGray
        }
    }

    $state = $job.State
    $reason = Get-JobErrorText -Job $job -StreamErrors $jobErrors

    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue | Out-Null

    if ($null -eq $exitCode) {
        if ($state -eq 'Completed') { $exitCode = 0 } else { $exitCode = 1 }
    }
    $success = ($state -eq 'Completed' -and $exitCode -eq 0)

    if (-not $success -and -not $reason) {
        $reason = "npm завершился с кодом $exitCode (state: $state)"
    }

    $duration = [int](((Get-Date) - $startedAt).TotalSeconds)

    if ($success) {
        $mark = '✔'
        $r = 61
        $g = 214
        $b = 140
    } else {
        $mark = '✖'
        $r = 255
        $g = 95
        $b = 109
    }

    $visible = '  ' + $mark + ' ' + $labelText + '  ' + $duration + 's'
    $pad = if ($script:interactive) { [Math]::Max(0, $spinnerWidth - $visible.Length) } else { 0 }
    $prefix = if ($script:interactive) { "`r" } else { '' }

    Write-Host ($prefix + '  ' + (C $mark $r $g $b) + ' ' + $labelText + '  ' + (C ($duration.ToString() + 's') 141 150 180) + (' ' * $pad))

    if ($success) {
        Write-LaunchLog ("step ok: {0} ({1}s)" -f $Label, $duration)
        return $true
    }

    Write-LaunchLog ("step failed: {0} | exit={1} state={2} | {3}" -f $Label, $exitCode, $state, $reason)

    if (-not $ShowOutput -and $collected.Count -gt 0) {
        $tail = @($collected | Select-Object -Last 30)
        foreach ($outputLine in $tail) {
            Write-Host ('     ' + $outputLine) -ForegroundColor DarkGray
        }
    }
    if ($reason) {
        Write-Host ('     ' + (C ('↳ ' + $reason) 255 95 109))
    }

    [void]$script:failures.Add($Label)
    return $false
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

    $subtitle = if ($SkipDeploy) {
        'Проверки и сборка завершены · deploy пропущен.'
    } elseif ($ChecksOnly) {
        'Проверки и сборка завершены · бот не запускается.'
    } else {
        'Проверки, сборка и деплой завершены.'
    }

    Show-SuccessBox -Subtitle $subtitle
    Line ('  ' + (C 'VERSION' 141 150 180) + '   v' + $version)
    Line ('  ' + (C 'MODE' 141 150 180) + '      ' + $mode)
    Line ('  ' + (C 'PANEL' 141 150 180) + '     ' + $publicUrl)
    Line ('  ' + (C 'LOCAL' 141 150 180) + '     ' + $localUrl)
    Line ('  ' + (C 'STOP' 141 150 180) + '      Ctrl+C')
    Line ('  ' + (C ('─' * 62) 54 62 86))
    Line ''

    if ($ChecksOnly) {
        Line ('  ' + (C 'Checks-only: бот не запускается.' 141 150 180))
        Line ''
        Write-LaunchLog 'checks-only mode: bot start skipped'
        return 0
    }

    $startArgs = if ($Dev) { @('run', 'dev') } else { @('run', 'start') }
    Line ('  ' + (C '▶  Запускаю NEXUS...' 84 184 255))
    Line ''
    Write-LaunchLog ("starting bot: npm {0}" -f ($startArgs -join ' '))

    # Out-Host обязателен: иначе вывод бота попадёт в return-значение функции.
    & $npm @startArgs | Out-Host
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 1 }

    Write-LaunchLog ("bot exited with code {0}" -f $code)
    Line ''

    if ($code -ne 0) {
        Line ('  ' + (C "Процесс завершился с кодом $code." 255 95 109))
        if ($InWindow) {
            Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null
        }
        return [int]$code
    }

    Line ('  ' + (C 'NEXUS остановлен.' 141 150 180))
    return 0
}

# ===========================================================================
# 2. Перезапуск в новом окне
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
# 3. Пайплайн
# ===========================================================================
Show-Banner
Show-Progress

$ok = $true

$ok = (Invoke-NpmStep -Label 'Останавливаю прошлый экземпляр' -NpmArgs @('run', 'stop')) -and $ok
Show-Progress

$ok = (Invoke-NpmStep -Label 'TypeScript · строгая проверка типов' -NpmArgs @('run', 'typecheck')) -and $ok
Show-Progress

$ok = (Invoke-NpmStep -Label 'ESLint · правила кода' -NpmArgs @('run', 'lint')) -and $ok
Show-Progress

$ok = (Invoke-NpmStep -Label 'Prettier · проверка форматирования' -NpmArgs @('run', 'format:check')) -and $ok
Show-Progress

$ok = (Invoke-NpmStep -Label 'Тесты · сценарии проекта' -NpmArgs @('run', 'test') -ShowOutput) -and $ok
Show-Progress

$ok = (Invoke-NpmStep -Label 'Сборка · TypeScript + React-панель' -NpmArgs @('run', 'build') -ShowOutput) -and $ok
Show-Progress

if (-not $SkipDeploy) {
    if ($ok) {
        $ok = (Invoke-NpmStep -Label 'Deploy · регистрация слэш-команд' -NpmArgs @('run', 'deploy') -ShowOutput) -and $ok
    } else {
        Write-LaunchLog 'deploy skipped: previous steps failed'
        Line ('  ' + (C 'Deploy пропущен: сначала исправь ошибки выше.' 255 176 32))
        Line ''
    }
    Show-Progress
}

# ===========================================================================
# 4. Итог
# ===========================================================================
if (-not $ok) {
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
