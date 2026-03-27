param(
  [string]$ApiEnvPath = "",
  [string]$ApiBaseUrl = "http://localhost:3001",
  [switch]$SkipHealthCheck,
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[release-gate] $msg" -ForegroundColor Cyan
}

function Assert-HttpOk([string]$url) {
  try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
    if ($res.StatusCode -lt 200 -or $res.StatusCode -ge 300) {
      throw "HTTP $($res.StatusCode)"
    }
    return $res.Content
  } catch {
    throw "Health check failed: $url -> $($_.Exception.Message)"
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$preflightScript = Join-Path $PSScriptRoot "ops-cloud-preflight.ps1"
$backupScript = Join-Path $PSScriptRoot "ops-db-backup.ps1"
$backupsDir = Join-Path $projectRoot "backups"

Write-Step "Running cloud preflight"
if ([string]::IsNullOrWhiteSpace($ApiEnvPath)) {
  & $preflightScript
} else {
  & $preflightScript -ApiEnvPath $ApiEnvPath
}

if (-not $SkipHealthCheck) {
  $health = "$ApiBaseUrl/health"
  $ready = "$ApiBaseUrl/health/ready"
  Write-Step "Checking health endpoints"
  $healthBody = Assert-HttpOk $health
  $readyBody = Assert-HttpOk $ready
}

$latestDump = $null
$latestSha = $null
if (-not $SkipBackup) {
  Write-Step "Creating backup + checksum"
  & $backupScript

  if (Test-Path $backupsDir) {
    $latestDump = Get-ChildItem $backupsDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latestDump) {
      $shaPath = "$($latestDump.FullName).sha256"
      if (Test-Path $shaPath) {
        $latestSha = Get-Content $shaPath | Select-Object -First 1
      }
    }
  }
}

Write-Host ""
Write-Host "Release gate PASSED" -ForegroundColor Green
Write-Host "Project: $projectRoot"
if (-not $SkipHealthCheck) {
  Write-Host "Health: $ApiBaseUrl/health"
  Write-Host "Ready:  $ApiBaseUrl/health/ready"
}
if ($latestDump) {
  Write-Host "Backup: $($latestDump.FullName)"
}
if ($latestSha) {
  Write-Host "SHA256: $latestSha"
}
