param(
  [switch]$SkipWeb,
  [switch]$SkipApi,
  [switch]$Lan,
  [string]$LanIp
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) {
  Write-Host "[dev-up] $msg" -ForegroundColor Cyan
}

function Test-TcpPort($HostName, $Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect($HostName, $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(1200, $false)
    if (-not $ok) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Parse-DbHostPortFromUrl($DatabaseUrl) {
  if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    return @{ Host = 'localhost'; Port = 5432 }
  }

  if ($DatabaseUrl -match '@(?<host>[^:/?#]+)(:(?<port>\d+))?') {
    $dbHostName = $Matches['host']
    $dbPort = if ($Matches['port']) { [int]$Matches['port'] } else { 5432 }
    return @{ Host = $dbHostName; Port = $dbPort }
  }

  return @{ Host = 'localhost'; Port = 5432 }
}

function Get-LanIpv4() {
  $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -ne '127.0.0.1' -and
      $_.IPAddress -notlike '169.254*' -and
      $_.InterfaceAlias -notlike '*Loopback*' -and
      $_.InterfaceAlias -notlike 'vEthernet*' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Sort-Object -Property InterfaceMetric

  if ($candidates -and $candidates.Count -gt 0) {
    return $candidates[0].IPAddress
  }

  $fallback = ipconfig | Select-String -Pattern 'IPv4' |
    ForEach-Object {
      if ($_ -match '(\d{1,3}\.){3}\d{1,3}') {
        $Matches[0]
      }
    } |
    Where-Object {
      $_ -and $_ -ne '127.0.0.1' -and $_ -notlike '169.254*'
    } |
    Select-Object -First 1

  if ($fallback) {
    return $fallback
  }

  return $null
}

function Merge-CorsOrigins($Origins, $ExtraOrigin) {
  if ([string]::IsNullOrWhiteSpace($Origins)) {
    return $ExtraOrigin
  }

  if ($Origins.Trim() -eq '*') {
    return $Origins
  }

  $items = $Origins.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  if ($items -contains $ExtraOrigin) {
    return ($items -join ',')
  }
  return (($items + $ExtraOrigin) -join ',')
}

function Merge-CorsOriginsMany($Origins, $ExtraOrigins) {
  $result = $Origins
  foreach ($origin in $ExtraOrigins) {
    if (-not [string]::IsNullOrWhiteSpace($origin)) {
      $result = Merge-CorsOrigins $result $origin
    }
  }
  return $result
}

function Ensure-PostgresReady($ProjectRoot) {
  $apiEnvPath = Join-Path $ProjectRoot 'ozon-admin-api\.env'
  if (-not (Test-Path $apiEnvPath)) {
    throw "Missing file: $apiEnvPath"
  }

  $databaseUrlLine = Get-Content $apiEnvPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  $databaseUrl = ''
  if ($databaseUrlLine) {
    $databaseUrl = $databaseUrlLine.Substring('DATABASE_URL='.Length).Trim('"')
  }

  $db = Parse-DbHostPortFromUrl $databaseUrl
  $dbHost = $db.Host
  $dbPort = $db.Port

  if (Test-TcpPort $dbHost $dbPort) {
    Write-Step "PostgreSQL ready at $dbHost`:$dbPort"
    return
  }

  Write-Step "PostgreSQL not ready, trying to start via docker compose..."
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($docker) {
    Push-Location $ProjectRoot
    try {
      docker compose up -d postgres | Out-Host
    } finally {
      Pop-Location
    }
  } else {
    Write-Host "[dev-up] Docker not found. Please start PostgreSQL manually." -ForegroundColor Yellow
  }

  $maxWaitSeconds = 45
  for ($i = 0; $i -lt $maxWaitSeconds; $i++) {
    if (Test-TcpPort $dbHost $dbPort) {
      Write-Step "PostgreSQL ready at $dbHost`:$dbPort"
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "PostgreSQL is still unavailable at $dbHost`:$dbPort"
}

function Start-ServiceProcess($Name, $Workdir, $NpmArgs) {
  Write-Step "Starting $Name ..."
  $npmCmd = 'C:\Program Files\nodejs\npm.cmd'
  if (-not (Test-Path $npmCmd)) {
    $npmCmd = 'npm.cmd'
  }
  if ([string]::IsNullOrWhiteSpace($NpmArgs)) {
    throw "Start-ServiceProcess received empty args for $Name"
  }
  Start-Process -FilePath $npmCmd -ArgumentList $NpmArgs -WorkingDirectory $Workdir | Out-Null
}

function Get-FirstMigrationName($ApiDir) {
  $migrationsDir = Join-Path $ApiDir 'prisma\migrations'
  if (-not (Test-Path $migrationsDir)) {
    return ""
  }

  $migration = Get-ChildItem -Path $migrationsDir -Directory |
    Sort-Object Name |
    Select-Object -First 1

  if (-not $migration) {
    return ""
  }

  return $migration.Name
}

function Sync-PrismaSchema($ApiDir) {
  Write-Step "Running prisma generate + migrate deploy"
  Push-Location $ApiDir
  try {
    npm run prisma:generate | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "prisma generate failed with code $LASTEXITCODE"
    }

    npm run prisma:migrate:deploy | Out-Host
    if ($LASTEXITCODE -eq 0) {
      return
    }

    Write-Host "[dev-up] migrate deploy failed. Trying baseline resolve for existing database..." -ForegroundColor Yellow
    $baseline = Get-FirstMigrationName $ApiDir
    if (-not [string]::IsNullOrWhiteSpace($baseline)) {
      npx prisma migrate resolve --applied $baseline | Out-Host
      if ($LASTEXITCODE -ne 0) {
        throw "prisma migrate resolve failed with code $LASTEXITCODE"
      }
      npm run prisma:migrate:deploy | Out-Host
      if ($LASTEXITCODE -eq 0) {
        return
      }
    }

    throw "prisma migrate deploy failed with code $LASTEXITCODE"
  } finally {
    Pop-Location
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $projectRoot 'ozon-admin-api'
$webDir = Join-Path $projectRoot 'ozon-admin-web'
$effectiveLanIp = $null

if ($Lan) {
  if ([string]::IsNullOrWhiteSpace($LanIp)) {
    $effectiveLanIp = Get-LanIpv4
  } else {
    $effectiveLanIp = $LanIp.Trim()
  }

  if ([string]::IsNullOrWhiteSpace($effectiveLanIp)) {
    throw 'LAN mode enabled but no LAN IPv4 detected. Please pass -LanIp x.x.x.x'
  }

  $apiOrigin = "http://${effectiveLanIp}:3001"
  $webOrigin = "http://${effectiveLanIp}:3000"
  $localhostWebOrigin = "http://localhost:3000"
  $loopbackWebOrigin = "http://127.0.0.1:3000"

  # Runtime overrides for child npm processes.
  $env:HOST = '0.0.0.0'
  $env:PORT = '3001'
  $env:NEXT_PUBLIC_API_BASE_URL = $apiOrigin
  $env:API_INTERNAL_BASE_URL = 'http://127.0.0.1:3001'
  $env:NEXT_DEV_ALLOWED_ORIGINS = "$localhostWebOrigin,$loopbackWebOrigin,$webOrigin"
  $env:CORS_ORIGINS = Merge-CorsOriginsMany $env:CORS_ORIGINS @(
    $webOrigin,
    $localhostWebOrigin,
    $loopbackWebOrigin
  )
  if ([string]::IsNullOrWhiteSpace($env:CORS_ORIGINS)) {
    $env:CORS_ORIGINS = "$localhostWebOrigin,$loopbackWebOrigin,$webOrigin"
  }

  Write-Step "LAN mode enabled. LAN IP: $effectiveLanIp"
  Write-Step "Runtime CORS_ORIGINS: $($env:CORS_ORIGINS)"
}

Write-Step "Checking PostgreSQL"
Ensure-PostgresReady $projectRoot

if (-not $SkipApi) {
  Sync-PrismaSchema $apiDir
}

if (-not $SkipApi) {
  Start-ServiceProcess 'API (3001)' $apiDir 'run start:dev'
}

if (-not $SkipWeb) {
  if ($Lan) {
    Start-ServiceProcess 'Web (3000)' $webDir 'run dev -- -H 0.0.0.0 -p 3000'
  } else {
    Start-ServiceProcess 'Web (3000)' $webDir 'run dev'
  }
}

Write-Host ''
Write-Host 'Start flow submitted:' -ForegroundColor Green
if (-not $SkipApi) { Write-Host '- API: http://localhost:3001/health' }
if (-not $SkipWeb) { Write-Host '- Web: http://localhost:3000' }
if ($Lan -and -not [string]::IsNullOrWhiteSpace($effectiveLanIp)) {
  Write-Host "- LAN Web: http://$effectiveLanIp`:3000" -ForegroundColor Yellow
  Write-Host "- LAN API: http://$effectiveLanIp`:3001/health" -ForegroundColor Yellow
}
