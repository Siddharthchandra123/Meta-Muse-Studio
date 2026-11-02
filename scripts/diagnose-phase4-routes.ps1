param([string]$Base = 'http://127.0.0.1:8000')
$ErrorActionPreference='Stop'
Write-Host 'Checking Phase 4 FastAPI without calling Meta (free)...'
try {
    $health=Invoke-RestMethod "$Base/health"
    Write-Host "Backend: $($health.service) version=$($health.version) status=$($health.status)"
    $spec=Invoke-RestMethod "$Base/openapi.json"
    $route=$spec.paths.PSObject.Properties['/v1/chat/multimodal/stream']
    if ($null -eq $route) {
        Write-Host 'Multimodal route: MISSING. You are running an older project/backend.' -ForegroundColor Red
        exit 1
    }
    Write-Host 'Multimodal route: PRESENT' -ForegroundColor Green
    Write-Host '422 means validation failed (read the UI error detail).'
    Write-Host '404 with Unknown conversation_id means FastAPI lost in-memory session state.'
    Write-Host 'The frontend v0.7.2 retries an expired conversation once with fresh context.'
} catch {
    Write-Host 'Backend diagnostic failed. Is FastAPI running on the correct port?' -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
