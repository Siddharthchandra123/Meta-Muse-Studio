param(
  [switch]$Live,
  [string]$DocumentPath = "",
  [string]$ImagePath = "",
  [string]$BaseUrl = "http://127.0.0.1:8000"
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Write-Host '=== MUSE Nova Phase 4 local verification ==='
try {
  $health = Invoke-RestMethod "$BaseUrl/health" -TimeoutSec 10
} catch { Write-Error 'Start FastAPI on 127.0.0.1:8000 first.'; exit 1 }
Write-Host "Backend: $($health.status); version: $($health.version)"
if ($health.version -ne '0.4.4') { Write-Warning 'Expected backend 0.4.4; check that the correct project directory is running.' }
if (-not $Live) {
  Write-Host 'Local readiness completed (free). Run python -m pytest -q and npm run test:stream for offline tests.'
  Write-Host 'Use -Live for one billable multimodal request to Meta.'
  exit 0
}
if (-not $DocumentPath -and -not $ImagePath) { $DocumentPath = Join-Path $projectRoot 'samples\example_report.pdf' }
$formArgs = @('-sS','-N','--max-time','180','-X','POST',"$BaseUrl/v1/chat/multimodal/stream",'-F','message=Summarize the supplied materials and provide a page reference if the page evidence is clear.')
if ($DocumentPath) {
  $resolvedDoc = (Resolve-Path $DocumentPath).Path
  $formArgs += @('-F', "documents=@$resolvedDoc")
}
if ($ImagePath) {
  $resolvedImg = (Resolve-Path $ImagePath).Path
  $formArgs += @('-F', "images=@$resolvedImg")
}
Write-Host 'Sending one live billable request to Meta via FastAPI. Look for event: done, not event: error.'
& curl.exe @formArgs
if ($LASTEXITCODE -ne 0) { Write-Error "curl.exe failed: $LASTEXITCODE"; exit $LASTEXITCODE }
Write-Host 'Check that the stream ended with event: done and a page-grounded answer.'
