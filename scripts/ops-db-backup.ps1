param(
  [string]$DatabaseUrl = "",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[db-backup] $msg" -ForegroundColor Cyan
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

function Resolve-PgDump() {
  $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $candidate = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter pg_dump.exe -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName

  if (-not $candidate) {
    throw "pg_dump not found. Install PostgreSQL client tools first."
  }
  return $candidate
}

$projectRoot = Get-ProjectRoot
$resolvedUrl = Resolve-DatabaseUrl $DatabaseUrl $projectRoot
$db = Parse-DatabaseUrl $resolvedUrl
$pgDump = Resolve-PgDump

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $projectRoot "backups"
}
if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $OutputDir "ozon_admin-$ts.dump"
$checksumFile = "$backupFile.sha256"

Write-Step "Backing up database $($db.Db)@$($db.Host):$($db.Port)"
$env:PGPASSWORD = $db.Pass
try {
  & $pgDump -h $db.Host -p $db.Port -U $db.User -d $db.Db -F c -f $backupFile --no-owner --no-privileges
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

if (-not (Test-Path $backupFile)) {
  throw "Backup file not generated: $backupFile"
}

$hash = (Get-FileHash $backupFile -Algorithm SHA256).Hash
Set-Content -Path $checksumFile -Value $hash

Write-Host ""
Write-Host "Backup OK" -ForegroundColor Green
Write-Host "Dump: $backupFile"
Write-Host "SHA256: $hash"
Write-Host "Hash file: $checksumFile"
