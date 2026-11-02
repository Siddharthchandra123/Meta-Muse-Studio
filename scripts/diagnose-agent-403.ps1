# Free origin-guard probe: deliberately invalid prompt stops before any Meta request.
param([string]$Base = 'http://127.0.0.1:3000')
$ErrorActionPreference = 'Stop'
$uri = "$($Base.TrimEnd('/'))/api/agent/stream"
function Test-Origin([string]$name, [string]$origin, [int]$expected) {
  try {
    $response = Invoke-WebRequest -Uri $uri -Method Post -ContentType 'application/json' -Headers @{ Origin=$origin } -Body '{"prompt":"hi"}' -UseBasicParsing
    $status = [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    } else { throw }
  }
  Write-Host "$name : HTTP $status (expected $expected)"
  if ($status -ne $expected) { throw "$name failed; inspect Next.js startup logs and local port." }
}
$port = ([uri]$Base).Port
Test-Origin 'Same host' "http://127.0.0.1:$port" 422
Test-Origin 'Loopback alias' "http://localhost:$port" 422
Test-Origin 'Foreign origin blocked' 'https://external.example' 403
Write-Host 'Origin checks PASS; no Meta request was sent.'
