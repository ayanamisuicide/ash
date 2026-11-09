#requires -Version 5.1
<#
.SYNOPSIS
  NEXUS release pipeline: checks, build, deploy and bot start in one command.

.DESCRIPTION
  По умолчанию скрипт открывает новое окно Windows Terminal / PowerShell,
  запускает там полный пайплайн и завершает текущий процесс. Старое окно
  остаётся в оболочке, но сам запуск из него уже завершён.

.EXAMPLE
  npm run launch
  npm run launch:dev
  powershell -ExecutionPolicy Bypass -File scripts/launch.ps1 -ChecksOnly
#>
param(
  [switch]$InWindow,
  [switch]$Dev,
  [switch]$SkipDeploy,
  [switch]$ChecksOnly,
  [switch]$NoNewWindow,
  [switch]$NoBanner
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = (Get-Command npm).Source }
$esc = [char]27
$useTrueColor = [bool]$env:WT_SESSION
$script:step = 0
$script:totalSteps = if ($SkipDeploy) { 6 } else { 7 }
$script:failures = @()

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { $Host.UI.RawUI.WindowTitle = 'NEXUS // RELEASE PIPELINE' } catch { }

$launchLog = Join-Path $root 'data\launch.log'
function Write-LaunchLog {
  param([string]$Message)
  try {
    $dir = Split-Path -Parent $launchLog
    if (-not (Test-Path -LiteralPath $dir)) {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    Add-Content -LiteralPath $launchLog -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
  } catch { }
}

Write-LaunchLog "=== launch start: InWindow=$InWindow NoNewWindow=$NoNewWindow Dev=$Dev SkipDeploy=$SkipDeploy ChecksOnly=$ChecksOnly cwd=$(Get-Location) ==="

trap {
  $message = "LAUNCH ERROR: $($_.Exception.Message)`n$($_.ScriptStackTrace)"
  Write-Host $message -ForegroundColor Red
  Write-LaunchLog $message
  if ($InWindow) { Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null }
  exit 1
}

function C {
  param([string]$Text, [int]$R, [int]$G, [int]$B)
  if ($useTrueColor) { return "$esc[38;2;${R};${G};${B}m$Text$esc[0m" }
  return "$esc[36m$Text$esc[0m"
}

function Line {
  param([string]$Text = '')
  Write-Host $Text
}

function Show-Banner {
  if ($NoBanner) { return }

  Clear-Host
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
    @(84, 184, 255),
    @(61, 214, 140),
    @(61, 214, 140)
  )

  Line ''
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $color = $colors[$i]
    Line (C $lines[$i] $color[0] $color[1] $color[2])
  }
  Line ''
  Line ('  ' + (C 'DISCORD MODERATION SUITE' 141 150 180) + (C '  ·  ' 70 78 102) + (C 'RELEASE PIPELINE' 84 184 255))
  Line ('  ' + (C ('─' * 62) 54 62 86))
  Line ''
}

function Show-Progress {
  $filled = [Math]::Min($script:step, $script:totalSteps)
  $empty = $script:totalSteps - $filled
  $bar = ('█' * $filled) + ('░' * $empty)
  Line ('  ' + (C 'PIPELINE' 141 150 180) + '  ' + (C $bar 102 115 255) + '  ' + (C "$filled/$($script:totalSteps)" 84 184 255))
  Line ''
}

function Invoke-NpmStep {
  param(
    [string]$Label,
    [string[]]$NpmArgs,
    [switch]$ShowOutput
  )

  $script:step += 1
  $labelText = "[$($script:step)/$($script:totalSteps)] $Label"
  Write-LaunchLog "step $($script:step)/$($script:totalSteps): $Label"
  $frames = @('⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏')
  $job = Start-Job -ScriptBlock {
    param($Root, $NpmPath, $ArgsToRun)
    Set-Location $Root
    $output = & $NpmPath @ArgsToRun 2>&1 | ForEach-Object { $_.ToString() }
    if ($LASTEXITCODE -ne 0) { throw "npm exited with code $LASTEXITCODE" }
    $output
  } -ArgumentList $root, $npm, $NpmArgs

  $frame = 0
  while ($job.State -eq 'Running') {
    $spin = $frames[$frame % $frames.Count]
    Write-Host ("`r  " + (C $spin 102 115 255) + ' ' + $labelText + (' ' * 18)) -NoNewline
    [Console]::Out.Flush()
    Start-Sleep -Milliseconds 75
    $frame += 1
  }

  $output = @(Receive-Job -Job $job -ErrorAction SilentlyContinue)
  $state = $job.State
  $errorText = ''
  if ($state -eq 'Failed') {
    $errorText = ($job.ChildJobs[0].Error | ForEach-Object { $_.ToString() }) -join "`n"
  }
  Remove-Job -Job $job -Force | Out-Null

  if ($state -eq 'Completed') {
    Write-LaunchLog "step ok: $Label"
    Write-Host ("`r  " + (C '✔' 61 214 140) + ' ' + $labelText + (' ' * 18))
    if ($ShowOutput -and $output.Count -gt 0) {
      $output | ForEach-Object { Write-Host ('     ' + $_) -ForegroundColor DarkGray }
    }
    return $true
  }

  Write-LaunchLog "step failed: $Label | $errorText"
  Write-Host ("`r  " + (C '✖' 255 95 109) + ' ' + $labelText + (' ' * 18))
  $output | ForEach-Object { Write-Host ('     ' + $_) -ForegroundColor DarkGray }
  if ($errorText) { Write-Host ('     ' + $errorText) -ForegroundColor DarkGray }
  $script:failures += $Label
  return $false
}

function Show-FailureBox {
  $boxWidth = 66
  $top = '  ┌' + ('─' * $boxWidth) + '┐'
  $bottom = '  └' + ('─' * $boxWidth) + '┘'
  $title = ' PIPELINE FAILED '
  Line ''
  Line (C $top 255 95 109)
  Line ((C '  │' 255 95 109) + ' ' + (C $title 255 95 109) + (' ' * ($boxWidth - $title.Length - 3)) + (C '│' 255 95 109))
  Line ((C '  │' 255 95 109) + ' ' + (C 'Проверь вывод выше. Исправь ошибку и запусти снова: npm run launch' 180 188 210) + ' ' + (C '│' 255 95 109))
  Line (C $bottom 255 95 109)
  Line ''
}

function Show-SuccessBox {
  $boxWidth = 66
  $top = '  ┌' + ('─' * $boxWidth) + '┐'
  $bottom = '  └' + ('─' * $boxWidth) + '┘'
  Line ''
  Line (C $top 61 214 140)
  Line ((C '  │' 61 214 140) + ' ' + (C ' RELEASE READY ' 61 214 140) + (' ' * ($boxWidth - 17)) + (C '│' 61 214 140))
  Line ((C '  │' 61 214 140) + ' ' + (C 'Проверки, сборка и деплой завершены.' 180 188 210) + (' ' * 24) + (C '│' 61 214 140))
  Line (C $bottom 61 214 140)
  Line ''
}

function Read-EnvValue {
  param([string]$Key, [string]$Fallback = '')
  $file = Join-Path $root '.env'
  if (-not (Test-Path $file)) { return $Fallback }
  $match = Select-String -Path $file -Pattern "^\s*$Key\s*=\s*(.*?)\s*$" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $match) { return $Fallback }
  return $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
}

function Start-Nexus {
  Write-LaunchLog 'checks/build/deploy complete; preparing to start'
  $version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
  $publicUrl = Read-EnvValue 'WEB_PUBLIC_URL' 'http://127.0.0.1:8080'
  $port = Read-EnvValue 'WEB_PORT' '8080'
  $mode = if ($Dev) { 'DEV · WATCH' } else { 'PRODUCTION' }

  Show-SuccessBox
  Line ('  ' + (C 'BOT' 141 150 180) + '     v' + $version + '  ·  ' + $mode)
  Line ('  ' + (C 'PANEL' 141 150 180) + '   ' + $publicUrl)
  Line ('  ' + (C 'LOCAL' 141 150 180) + '   http://127.0.0.1:' + $port)
  Line ('  ' + (C 'STOP' 141 150 180) + '    Ctrl+C')
  Line (('  ' + (C ('─' * 62) 54 62 86)))
  Line ''

  if ($ChecksOnly) {
    Line ('  ' + (C 'Checks-only режим: бот не запускается.' 141 150 180))
    Line ''
    return 0
  }

  $startArgs = if ($Dev) { @('run', 'dev') } else { @('run', 'start') }
  Line ('  ' + (C '▶ Запускаю бота...' 84 184 255))
  Line ''
  Write-LaunchLog "starting bot: $npm $($startArgs -join ' ') in $(Get-Location)"
  & $npm @startArgs
  $code = $LASTEXITCODE
  Write-LaunchLog "bot exited with code $code"
  Line ''
  if ($code -ne 0) {
    Line ('  ' + (C "Бот завершился с кодом $code." 255 95 109))
    if ($InWindow) { Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null }
    return $code
  }
  Line ('  ' + (C 'Бот остановлен.' 141 150 180))
  return 0
}

# ---------------------------------------------------------------------------
# Открываем новое окно и выходим из старого запуска
# ---------------------------------------------------------------------------
if (-not $InWindow -and -not $NoNewWindow) {
  Write-Host ''
  Write-Host ('  ' + (C 'NEXUS' 102 115 255) + '  ' + (C 'открываю новое окно release pipeline…' 141 150 180))
  Write-Host ''

  $relaunchArgs = @(
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`"",
    '-InWindow'
  )
  if ($Dev) { $relaunchArgs += '-Dev' }
  if ($SkipDeploy) { $relaunchArgs += '-SkipDeploy' }
  if ($ChecksOnly) { $relaunchArgs += '-ChecksOnly' }
  if ($NoBanner) { $relaunchArgs += '-NoBanner' }

  $wt = Get-Command wt.exe -ErrorAction SilentlyContinue
  try {
    if ($wt) {
      $wtArgs = @('-w', '-1', 'new-tab', '--title', 'NEXUS-RELEASE', 'powershell.exe') + $relaunchArgs
      Write-LaunchLog "spawning Windows Terminal: $($wt.Source) $($wtArgs -join ' ')"
      Start-Process -FilePath $wt.Source -ArgumentList $wtArgs | Out-Null
    } else {
      Write-LaunchLog "spawning powershell.exe (wt not found)"
      Start-Process -FilePath 'powershell.exe' -ArgumentList $relaunchArgs | Out-Null
    }
    Start-Sleep -Milliseconds 500
    exit 0
  } catch {
    Write-Host ('  ' + (C 'Не удалось открыть новое окно — продолжаю здесь.' 255 176 32))
    Start-Sleep -Milliseconds 400
  }
}

# ---------------------------------------------------------------------------
# Пайплайн
# ---------------------------------------------------------------------------
Show-Banner
Show-Progress

$ok = $true
$ok = (Invoke-NpmStep 'Останавливаю прошлый экземпляр' @('run', 'stop')) -and $ok
Show-Progress
$ok = (Invoke-NpmStep 'TypeScript · строгая проверка типов' @('run', 'typecheck')) -and $ok
Show-Progress
$ok = (Invoke-NpmStep 'ESLint · правила кода' @('run', 'lint')) -and $ok
Show-Progress
$ok = (Invoke-NpmStep 'Prettier · форматирование' @('run', 'format:check')) -and $ok
Show-Progress
$ok = (Invoke-NpmStep 'Тесты · 100+ сценариев' @('run', 'test') -ShowOutput) -and $ok
Show-Progress
$ok = (Invoke-NpmStep 'Сборка · TypeScript + React-панель' @('run', 'build') -ShowOutput) -and $ok
Show-Progress

if ($ok -and -not $SkipDeploy) {
  $ok = (Invoke-NpmStep 'Deploy · регистрация слеш-команд' @('run', 'deploy') -ShowOutput) -and $ok
  Show-Progress
}

if (-not $ok) {
  Show-FailureBox
  Write-Host ('  ' + (C 'Неудачные шаги:' 255 95 109) + ' ' + ($script:failures -join ', '))
  Write-Host ''
  if (-not $ChecksOnly) { Read-Host '  Нажмите Enter, чтобы закрыть окно' | Out-Null }
  exit 1
}

exit (Start-Nexus)
