param(
  [switch]$SkipWeb,
  [switch]$NoPull,
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[local-recover] $msg" -ForegroundColor Cyan
}

function Invoke-HealthCheck([string]$Url, [int]$TimeoutSec = 8) {
  try {
    $resp = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing
    Write-Host "[local-recover] OK $Url ($($resp.StatusCode))" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "[local-recover] FAIL $Url - $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}

if (-not (Test-Path (Join-Path $ProjectRoot "docker-compose.yml"))) {
  throw "docker-compose.yml not found in $ProjectRoot"
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  throw "Docker command not found. Please install Docker Desktop first."
}

Push-Location $ProjectRoot
try {
  if (-not $NoPull -and (Test-Path ".git")) {
    Write-Step "Pulling latest code (fast-forward only)"
    git pull --ff-only | Out-Host
  }

  Write-Step "Stopping current compose services"
  docker compose stop | Out-Host

  $services = @("postgres", "api")
  if (-not $SkipWeb) {
    $services += "web"
  }

  Write-Step "Starting services with --no-build: $($services -join ', ')"
  docker compose up -d --no-build @services | Out-Host

  Write-Step "Current container status"
  docker compose ps | Out-Host

  Write-Step "Health checks"
  [void](Invoke-HealthCheck "http://127.0.0.1:3001/health")
  if (-not $SkipWeb) {
    [void](Invoke-HealthCheck "http://127.0.0.1:3000")
  }

  Write-Step "Recent logs (api/web)"
  docker compose logs --tail=80 api | Out-Host
  if (-not $SkipWeb) {
    docker compose logs --tail=80 web | Out-Host
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Local recover finished." -ForegroundColor Green
