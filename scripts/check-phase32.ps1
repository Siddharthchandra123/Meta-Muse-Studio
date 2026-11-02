$ErrorActionPreference = 'Stop'
Write-Host '=== MUSE Nova Phase 3.2 local verification ===' -ForegroundColor Cyan
Write-Host 'Checking dependencies (does not spend API credits)...'
python -c "import fastapi, websockets, httpx; print('Python runtime:', __import__('sys').version.split()[0]); print('websockets:', websockets.__version__)"
Write-Host 'Running backend offline tests...'
python -m pytest -q
Write-Host 'Running Node audio/stream parser offline tests...'
Push-Location .\frontend
try { npm run test:stream } finally { Pop-Location }
Write-Host 'Checking FastAPI health (start the server separately first)...'
try {
  $status = Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 5
  Write-Host "Backend version: $($status.version)"
} catch {
  Write-Host 'Backend is not listening on 127.0.0.1:8000; start uvicorn first.' -ForegroundColor Yellow
}
Write-Host 'Run scripts/diagnose-realtime.ps1 to verify local startup. Browser voice still needs live testing.' -ForegroundColor Cyan
