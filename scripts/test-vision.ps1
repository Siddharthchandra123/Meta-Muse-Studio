param(
    [switch]$Live,
    [string]$ImagePath,
    [string]$Question = "Describe this image and mention the main visual elements.",
    [switch]$ViaFrontend
)
$ErrorActionPreference = 'Stop'
$base = if ($ViaFrontend) { 'http://127.0.0.1:3000' } else { 'http://127.0.0.1:8000' }
$healthUri = if ($ViaFrontend) { "$base/api/health" } else { "$base/health" }
$endpoint = if ($ViaFrontend) { "$base/api/chat/vision/stream" } else { "$base/v1/chat/vision/stream" }
Write-Host "MUSE Nova Phase 4.1 image check" -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri $healthUri -Method Get -TimeoutSec 12
    Write-Host "Backend status: $($health.status) version $($health.version)" -ForegroundColor Green
} catch {
    Write-Host "Cannot connect to $healthUri. Start the app first." -ForegroundColor Red
    exit 1
}
if (-not $Live) {
    Write-Host 'Readiness OK. This was a free health check; no Meta request was sent.' -ForegroundColor Green
    Write-Host 'For an actual paid image test use: .\scripts\test-vision.ps1 -Live -ImagePath "C:\path\photo.png"'
    exit 0
}
if (-not $ImagePath -or -not (Test-Path -LiteralPath $ImagePath -PathType Leaf)) {
    Write-Host 'Provide a real image with -ImagePath. Do not use private/sensitive screenshots.' -ForegroundColor Red
    exit 1
}
$file = Get-Item -LiteralPath $ImagePath
if ($file.Length -gt 4194304 -or $file.Length -lt 1) { throw 'Image must be smaller than 4 MiB.' }
$ext = $file.Extension.ToLowerInvariant()
$mime = switch ($ext) { '.png' {'image/png'} '.jpeg' {'image/jpeg'} '.jpg' {'image/jpeg'} '.webp' {'image/webp'} default {throw 'Use JPEG, PNG, or WebP.'} }
Write-Host "Sending $($file.Name) through $endpoint (billable Muse Spark request)..." -ForegroundColor Yellow
& curl.exe --silent --show-error --no-buffer --fail-with-body -X POST `
    -F ("message=" + $Question) -F ("images=@" + $file.FullName + ";type=" + $mime) $endpoint
if ($LASTEXITCODE -ne 0) { throw "curl exited with code $LASTEXITCODE" }
