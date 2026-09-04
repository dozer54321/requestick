# Requestick — start the premade Docker stack (Docker Desktop already running).
# Usage: .\start.ps1 requestick.yourcompany.com
param(
  [Parameter(Position = 0)]
  [string]$Domain = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Fail([string]$Msg) {
  Write-Host $Msg -ForegroundColor Red
  exit 1
}

if (-not $Domain) {
  $hint = ""
  $envFile = Join-Path $Root "mesh.env"
  if (Test-Path $envFile) {
    $line = Select-String -Path $envFile -Pattern '^MESH_DOMAIN=' | Select-Object -Last 1
    if ($line) { $hint = ($line.Line -replace '^MESH_DOMAIN=', '').Trim().Trim('"').Trim("'") }
  }
  if ($hint) {
    $entered = Read-Host "Domain or subdomain [$hint]"
    $Domain = if ($entered) { $entered } else { $hint }
  } else {
    $Domain = Read-Host "Domain or subdomain (example: tickets.yourshop.com)"
  }
}
$Domain = $Domain.Trim().ToLower()
$Domain = $Domain -replace '^https?://', ''
$Domain = ($Domain -split '/')[0]
$Domain = ($Domain -split ':')[0]
$Domain = $Domain.TrimEnd('.')
if (-not $Domain -or $Domain -match "^\d+\.\d+\.\d+\.\d+$") {
  Fail "Use a domain or subdomain you own. Login will not work on a bare IP."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "Docker is not installed. Run install.bat as administrator, or install Docker Desktop first."
}
try {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
} catch {
  Fail "Docker is not running. Start Docker Desktop, wait until it is idle, then re-run."
}

function HexSecret([int]$Bytes) {
  $buf = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  return ($buf | ForEach-Object { $_.ToString("x2") }) -join ""
}

$envFile = Join-Path $Root "mesh.env"
if (Test-Path $envFile) {
  Write-Host "Keeping existing mesh.env (secrets already set)."
} else {
  @"
MESH_DOMAIN=$Domain
POSTGRES_PASSWORD=$(HexSecret 24)
BETTER_AUTH_SECRET=$(HexSecret 32)
"@ | Set-Content -Path $envFile -Encoding ascii
  Write-Host "Wrote mesh.env with fresh secrets. Keep this file private."
}

$content = Get-Content $envFile
if ($content -match "^MESH_DOMAIN=") {
  $content = $content -replace "^MESH_DOMAIN=.*", "MESH_DOMAIN=$Domain"
} else {
  $content += "MESH_DOMAIN=$Domain"
}
$content | Set-Content -Path $envFile -Encoding ascii

function LoadPrebuiltImage {
  foreach ($f in @(
      (Join-Path $Root "requestick-image.tar.gz"),
      (Join-Path (Split-Path $Root) "requestick-image.tar.gz")
    )) {
    if (Test-Path $f) {
      Write-Host "Loading prebuilt Requestick image..."
      docker load -i $f
      if ($LASTEXITCODE -ne 0) { Fail "docker load failed." }
      return $true
    }
  }
  return $false
}

$imageOk = $false
$inspect = & docker image inspect requestick:local 2>$null
if ($LASTEXITCODE -eq 0 -and $inspect) { $imageOk = $true }
elseif (LoadPrebuiltImage) { $imageOk = $true }

if ($imageOk) {
  docker compose --env-file $envFile up -d
} else {
  Write-Host "No prebuilt image yet — building the Requestick container (app is already compiled)."
  docker compose --env-file $envFile up -d --build
}
if ($LASTEXITCODE -ne 0) { Fail "Docker compose failed." }

Write-Host ""
Write-Host "Requestick is starting." -ForegroundColor Green
Write-Host "1. Point $Domain at this machine (A record -> public IP)."
Write-Host "2. Wait a minute for HTTPS, then open https://$Domain"
Write-Host "3. First person to Sign in and fill their station card is the admin."
Write-Host ""
Write-Host "Logs:    docker compose --env-file mesh.env logs -f app"
Write-Host "Stop:    .\uninstall.ps1"
Write-Host "Backup:  .\backup.ps1"
