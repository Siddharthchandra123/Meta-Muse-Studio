# MUSE Nova v1.1.1 RAG 404 diagnostic; no Meta API calls or data mutations.
param(
    [string]$CollectionId = '',
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 3000
)
$ErrorActionPreference = 'Continue'
$backend = "http://127.0.0.1:$BackendPort"
$frontend = "http://127.0.0.1:$FrontendPort"

function Probe([string]$Label, [string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 8
        Write-Host ("{0}: HTTP {1}" -f $Label, [int]$response.StatusCode)
        $value = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($null -ne $value) {
            if ($value.detail) { Write-Host ("  Detail: {0}" -f ($value.detail | Out-String).Trim()) }
            if ($value.version) { Write-Host ("  Backend version: {0}" -f $value.version) }
            if ($null -ne $value.items) { Write-Host ("  Collections: {0}" -f @($value.items).Count) }
            if ($value.backend) { Write-Host ("  RAG storage: {0}" -f $value.backend) }
        }
    }
    catch {
        $code = 'UNREACHABLE'
        if ($null -ne $_.Exception.Response) {
            try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        }
        Write-Host ("{0}: HTTP {1}" -f $Label, $code)
        if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) {
            Write-Host ("  Detail: {0}" -f $_.ErrorDetails.Message)
        } elseif ($null -ne $_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $body = $reader.ReadToEnd()
                    if ($body) { Write-Host ("  Body: {0}" -f $body.Substring(0,[Math]::Min(300,$body.Length))) }
                }
            } catch {}
        } else { Write-Host ("  Connection error: {0}" -f $_.Exception.Message) }
    }
}

Write-Host 'MUSE Nova RAG checks (free / read-only)'
Probe 'Backend health' "$backend/health"
Probe 'Backend RAG status' "$backend/v1/rag/status"
Probe 'Frontend RAG status' "$frontend/api/rag/status"
Probe 'Backend collections' "$backend/v1/rag/collections"
Probe 'Frontend collections' "$frontend/api/rag/collections"

if ($CollectionId) {
    if ($CollectionId -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') {
        Write-Host 'CollectionId must be a UUID.'; exit 2
    }
    Probe 'Backend documents' "$backend/v1/rag/collections/$CollectionId/documents"
    Probe 'Frontend documents' "$frontend/api/rag/collections/$CollectionId/documents"
}
Write-Host 'SQLite file location used by THIS Python environment:'
python -c "from app.rag_service import db_path; print(db_path())"
Write-Host 'Interpretation: backend RAG status 404 = wrong/old FastAPI backend.'
Write-Host 'Backend documents 404 = collection absent in active database.'
Write-Host 'Backend documents 200 + frontend 404 = Next.js proxy/build mismatch.'
Write-Host 'Restart both servers after installing the fix. Keep your original SQLite file.'
