# Launcher for Antigravity Token Intelligence Dashboard
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Launching Antigravity Token Dashboard on port 3333... " -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan
node server.js --open
