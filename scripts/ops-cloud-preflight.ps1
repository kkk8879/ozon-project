param(
  [string]$ApiEnvPath = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[cloud-preflight] $msg" -ForegroundColor Cyan
}

function Read-EnvMap([string]$path) {
  $map = @{}
  foreach ($line in Get-Content $path) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith("#")) { continue }
    if ($line -notmatch "=") { continue }
    $parts = $line.Split("=", 2)
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"')
    $map[$key] = $value
  }
  return $map
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $projectRoot "ozon-admin-api"
if ([string]::IsNullOrWhiteSpace($ApiEnvPath)) {
  $ApiEnvPath = Join-Path $apiDir ".env"
}

if (-not (Test-Path $ApiEnvPath)) {
  throw "Missing env file: $ApiEnvPath"
}

$envMap = Read-EnvMap $ApiEnvPath
$requiredKeys = @(
  "DATABASE_URL",
  "CORS_ORIGINS",
  "ORDER_WEBHOOK_SECRET"
)

$missing = @()
foreach ($k in $requiredKeys) {
  if (-not $envMap.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($envMap[$k])) {
    $missing += $k
  }
}

if ($missing.Count -gt 0) {
  throw "Missing required env keys: $($missing -join ', ')"
}

Write-Step "Env keys check passed"

Push-Location $apiDir
try {
  Write-Step "Running prisma migrate status"
  npm run prisma:migrate:status | Out-Host
  $statusCode = $LASTEXITCODE
  if ($statusCode -ne 0) {
    Write-Host "[cloud-preflight] migrate status returned code $statusCode." -ForegroundColor Yellow
    Write-Host "[cloud-preflight] If target DB is existing and already has tables, run:" -ForegroundColor Yellow
    Write-Host "  npx prisma migrate resolve --applied 20260326060000_postgres_baseline" -ForegroundColor Yellow
    Write-Host "[cloud-preflight] If target DB is new/empty, run:" -ForegroundColor Yellow
    Write-Host "  npm run prisma:migrate:deploy" -ForegroundColor Yellow
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Cloud preflight OK" -ForegroundColor Green
