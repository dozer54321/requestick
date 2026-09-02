# Requestick — Windows server installer (not for sales PCs).
# Run elevated:
#   .\install.ps1 requestick.yourcompany.com
# If Docker Desktop is already running you can skip this and use:
#   .\start.ps1 requestick.yourcompany.com
param(
  [Parameter(Position = 0)]
  [string]$Domain = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Fail([string]$Msg) {
  Write-Host ""
  Write-Host $Msg -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  Requestick Setup" -ForegroundColor Cyan
Write-Host "  Premade Docker stack — sales desks stay on the browser."
Write-Host ""

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Fail "Right-click install.bat and Run as administrator."
}

if (-not $Domain) {
  $Domain = Read-Host "Hostname (example: requestick.yourcompany.com)"
}
$Domain = $Domain.Trim().ToLower()
if (-not $Domain -or $Domain -match "^\d+\.\d+\.\d+\.\d+$") {
  Fail "Use a real hostname you own. Login will not work on a bare IP."
}

if (-not (Test-Path (Join-Path $Root "docker-compose.yml"))) {
  Fail "Missing docker-compose.yml. Unpack the full Requestick Windows pack first."
}

function HaveDocker {
  try {
    docker info 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker is not installed. Attempting Docker Desktop via winget..."
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    Fail "Docker Desktop is installing. Reboot if it asks, start Docker Desktop, then run this installer again."
  }
  Fail "Install Docker Desktop, start it, then run this installer again."
}

if (-not (HaveDocker)) {
  Fail "Docker is installed but not running. Start Docker Desktop and wait until it is idle, then re-run."
}

$iis = Get-Service W3SVC -ErrorAction SilentlyContinue
if ($iis -and $iis.Status -eq "Running") {
  Write-Host "IIS is using the web ports. Stopping World Wide Web Publishing Service so Requestick can take HTTPS."
  Stop-Service W3SVC -Force
  Set-Service W3SVC -StartupType Manual
}

foreach ($port in 80, 443) {
  $name = "Requestick $port"
  if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $name -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
  }
}

& (Join-Path $Root "start.ps1") $Domain
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
