$ErrorActionPreference = 'SilentlyContinue'

function Stop-ByMatch($pattern) {
  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -match $pattern } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force
      Write-Host "[dev-down] stopped PID=$($_.ProcessId) pattern=$pattern"
    }
}

Stop-ByMatch 'ozon-admin-api'
Stop-ByMatch 'ozon-admin-web'

$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
  $projectRoot = Split-Path -Parent $PSScriptRoot
  Push-Location $projectRoot
  try {
    docker compose stop postgres | Out-Host
  } finally {
    Pop-Location
  }
}

Write-Host "[dev-down] done"
