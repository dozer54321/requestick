# Stop Requestick containers. Does NOT delete the database volume.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$envFile = Join-Path $Root "mesh.env"
if (-not (Test-Path $envFile)) { throw "mesh.env not found." }
docker compose --env-file $envFile down
Write-Host "Requestick is stopped. Database volume mesh_pgdata is still on disk."
Write-Host "To wipe data as well: docker volume rm mesh_pgdata"
