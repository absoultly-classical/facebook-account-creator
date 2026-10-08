param(
    [ValidateRange(1, 1000)]
    [int]$Count = 10,
    [string]$Domain = "",
    [string]$SshHost = "",
    [string]$ResultsPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $Domain) { throw "Pass the mailbox domain with -Domain" }
if (-not $SshHost) { throw "Pass the remote host with -SshHost" }

if (-not $ResultsPath) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $ResultsPath = Join-Path $PSScriptRoot "batch-results-$stamp.jsonl"
}

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path -LiteralPath $chrome)) {
    throw "Chrome not found at $chrome"
}

$env:CHROME_PATH = $chrome
$env:PROBE_ONLY = "false"
$env:USE_GOOGLE_SHEETS = "false"
$env:REQUIRE_INDONESIA = "false"
$env:UPLOAD_PROFILE_PHOTO = "false"
$env:MAX_REGISTRATIONS = [string]$Count
$env:RESULTS_PATH = $ResultsPath
$env:VMAIL_SSH_HOST = $SshHost
$env:VMAIL_DOMAIN = $Domain
$env:VMAIL_OTP_TIMEOUT = "180"

Write-Host "Starting $Count registrations with @$Domain mailboxes"
Write-Host "Results: $ResultsPath"

Push-Location $PSScriptRoot
try {
    & node .\register-loop.js
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
