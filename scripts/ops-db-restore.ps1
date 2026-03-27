param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$DatabaseUrl = "",
  [switch]$DropRecreate
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[db-restore] $msg" -ForegroundColor Cyan
}

function Get-ProjectRoot() {
  return Split-Path -Parent $PSScriptRoot
}

function Resolve-DatabaseUrl([string]$inputUrl, [string]$projectRoot) {
  if (-not [string]::IsNullOrWhiteSpace($inputUrl)) {
    return $inputUrl
  }

  $envPath = Join-Path $projectRoot "ozon-admin-api\.env"
  if (-not (Test-Path $envPath)) {
    throw "Missing .env file: $envPath"
  }

  $line = Get-Content $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $line) {
    throw "DATABASE_URL not found in $envPath"
  }

  return $line.Substring("DATABASE_URL=".Length).Trim('"')
}

function Parse-DatabaseUrl([string]$url) {
  $pattern = '^postgres(?:ql)?:\/\/(?<user>[^:\/?#]+):(?<pass>[^@\/?#]*)@(?<host>[^:\/?#]+)(:(?<port>\d+))?\/(?<db>[^?]+)'
  if ($url -notmatch $pattern) {
    throw "Unsupported DATABASE_URL format."
  }

  return @{
    User = [uri]::UnescapeDataString($Matches["user"])
    Pass = [uri]::UnescapeDataString($Matches["pass"])
    Host = $Matches["host"]
    Port = if ($Matches["port"]) { [int]$Matches["port"] } else { 5432 }
    Db = $Matches["db"]
  }
}

function Resolve-PgBinary([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $candidate = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "$name.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName

  if (-not $candidate) {
    throw "$name not found. Install PostgreSQL client tools first."
  }
  return $candidate
}

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$projectRoot = Get-ProjectRoot
$resolvedUrl = Resolve-DatabaseUrl $DatabaseUrl $projectRoot
$db = Parse-DatabaseUrl $resolvedUrl

$pgRestore = Resolve-PgBinary "pg_restore"
$psql = Resolve-PgBinary "psql"

Write-Step "Restoring $BackupFile to $($db.Db)@$($db.Host):$($db.Port)"
$env:PGPASSWORD = $db.Pass
try {
  if ($DropRecreate) {
    Write-Step "Drop/Recreate public schema"
    & $psql -h $db.Host -p $db.Port -U $db.User -d $db.Db -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
  }

  & $pgRestore -h $db.Host -p $db.Port -U $db.User -d $db.Db --no-owner --no-privileges --clean --if-exists $BackupFile
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Restore OK" -ForegroundColor Green
