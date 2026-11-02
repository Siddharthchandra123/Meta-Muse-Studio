<#
MUSE Nova end-to-end SSE diagnostic for Windows PowerShell 5.1+.
Does not import the OpenAI SDK or display API keys.
Each selected streaming check makes ONE billable Meta model request.

Examples:
  powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-stream.ps1 -Target Backend
  powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-stream.ps1 -Target Frontend
#>
param(
  [ValidateSet('Backend', 'Frontend', 'Both')]
  [string]$Target = 'Backend'
)

$ErrorActionPreference = 'Stop'
$backend = 'http://127.0.0.1:8000'
$frontend = 'http://127.0.0.1:3000'

function HealthCheck([string]$Name, [string]$Url) {
  try {
    $info = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 10
    Write-Host "${Name}: online (version: $($info.version))" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "${Name}: unavailable ($($_.Exception.Message))" -ForegroundColor Red
    return $false
  }
}

function StreamCheck([string]$Name, [string]$Url) {
  Write-Host "`nTesting $Name stream (one billable API call)..." -ForegroundColor Cyan
  $data = @{ message = 'Reply with one short sentence saying MUSE Nova streaming works.' } | ConvertTo-Json -Compress
  try {
    $res = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Url `
      -Headers @{Accept = 'text/event-stream'} -ContentType 'application/json' `
      -Body $data -TimeoutSec 150
  } catch {
    $status = 'no HTTP status'
    if ($_.Exception.Response) {
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    }
    Write-Host "${Name}: request error, status $status" -ForegroundColor Red
    Write-Host $_.Exception.Message
    return
  }
  Write-Host "HTTP status: $([int]$res.StatusCode)"
  $raw = [string]$res.Content
  $events = @()
  $textBuilder = New-Object System.Text.StringBuilder
  $completed = $false
  $errorDetail = ''

  foreach ($frame in [regex]::Split($raw, '\r?\n\r?\n')) {
    $typeMatch = [regex]::Match($frame, '(?m)^event:\s*([^\r\n]+)')
    if (!$typeMatch.Success) { continue }
    $eventName = $typeMatch.Groups[1].Value.Trim()
    $events += $eventName
    $dataLines = [regex]::Matches($frame, '(?m)^data:\s*(.*)$')
    if ($dataLines.Count -eq 0) { continue }
    $payload = (($dataLines | ForEach-Object { $_.Groups[1].Value.TrimEnd("`r") }) -join "`n")
    try { $item = $payload | ConvertFrom-Json -ErrorAction Stop } catch { continue }
    if ($eventName -eq 'delta' -and $null -ne $item.text) { [void]$textBuilder.Append($item.text) }
    if ($eventName -eq 'done') {
      $completed = $true
      if ($item.answer) {
        [void]$textBuilder.Clear()
        [void]$textBuilder.Append([string]$item.answer)
      }
    }
    if ($eventName -eq 'error') { $errorDetail = [string]$item.message }
  }

  Write-Host "Event sequence: $($events -join ', ')"
  Write-Host "Completed: $completed"
  Write-Host "Assistant text length: $($textBuilder.Length)"
  if ($errorDetail) { Write-Host "Model error: $errorDetail" -ForegroundColor Yellow }
  if (-not $completed) {
    Write-Host "RESULT: Stream failed or closed early. See FastAPI terminal logs." -ForegroundColor Red
  } elseif ($textBuilder.Length -eq 0) {
    Write-Host "RESULT: Completed without text. Check model/provider streaming parser." -ForegroundColor Red
  } else {
    Write-Host "RESULT: Stream works." -ForegroundColor Green
  }
}

Write-Host 'MUSE Nova - streaming diagnostic (API key is never printed)' -ForegroundColor Cyan
$backendOnline = HealthCheck 'FastAPI' "$backend/health"
$frontendOnline = HealthCheck 'Next.js proxy' "$frontend/api/health"

if ($Target -eq 'Backend' -or $Target -eq 'Both') {
  if ($backendOnline) { StreamCheck 'FastAPI' "$backend/v1/chat/stream" }
  else { Write-Host 'Skipping FastAPI stream: backend unavailable.' }
}
if ($Target -eq 'Frontend' -or $Target -eq 'Both') {
  if ($frontendOnline) { StreamCheck 'Next.js proxy' "$frontend/api/chat/stream" }
  else { Write-Host 'Skipping Next.js stream: frontend proxy unavailable.' }
}
