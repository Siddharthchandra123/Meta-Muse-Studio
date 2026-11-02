param([string]$Base = 'http://127.0.0.1:8000')
$ErrorActionPreference='Stop'
Write-Host 'MUSE Nova — RAGaaS local smoke test (no Meta calls)'
$status=Invoke-RestMethod "$Base/v1/rag/status"
Write-Host "Status: $($status.status) | Backend: $($status.backend) | Docker required: $($status.docker_required)"
$collection=Invoke-RestMethod "$Base/v1/rag/collections" -Method Post -ContentType 'application/json' -Body '{"name":"RAG Smoke Test"}'
$id=$collection.id
$temp=Join-Path ([IO.Path]::GetTempPath()) 'muse-nova-rag-smoke.txt'
Set-Content -Path $temp -Value 'MUSE Nova supports local document indexing, full-text search, and source-grounded questions.' -Encoding utf8
try {
  $raw = & curl.exe -fsS -X POST -F "file=@$temp" "$Base/v1/rag/collections/$id/documents"
  if ($LASTEXITCODE -ne 0) { throw "Document upload failed (curl exit code $LASTEXITCODE)." }
  $response = $raw | ConvertFrom-Json
  Write-Host "Upload: $($response.status), chunks: $($response.chunks)"
  $body=@{collection_id=$id;query='local full text search';mode='keyword';top_k=5}|ConvertTo-Json
  $hits=Invoke-RestMethod "$Base/v1/rag/search" -Method Post -ContentType 'application/json' -Body $body
  if($hits.results.Count -lt 1) { throw 'Expected at least one source result.' }
  Write-Host "Retrieval passed: $($hits.results[0].citation)"
} finally {
  Invoke-RestMethod "$Base/v1/rag/collections/$id" -Method Delete | Out-Null
  Remove-Item $temp -ErrorAction SilentlyContinue
}
Write-Host 'RAGaaS LOCAL TEST PASSED. No Muse API request made.' -ForegroundColor Green
