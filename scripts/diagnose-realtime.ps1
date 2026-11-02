param([switch]$Live)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if ($Live) {
    & python .\scripts\diagnose-realtime.py --live
} else {
    & python .\scripts\diagnose-realtime.py
}
exit $LASTEXITCODE
