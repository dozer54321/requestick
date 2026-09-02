# Dump the Requestick database to .\backups\
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$envFile = Join-Path $Root "mesh.env"
if (-not (Test-Path $envFile)) { throw "mesh.env not found. Run install.ps1 first." }
$dir = Join-Path $Root "backups"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$out = Join-Path $dir "mesh-$stamp.sql"
docker compose --env-file $envFile exec -T db pg_dump -U mesh -d mesh --no-owner --clean --if-exists | Out-File -FilePath $out -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
Write-Host "Wrote $out"
Get-ChildItem $dir -Filter "mesh-*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item
