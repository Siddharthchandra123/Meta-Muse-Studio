# One live Meta Model API test using PowerShell only (no OpenAI SDK, no jiter).
# Run from the extracted v0.2.1 project: .\scripts\test-meta-direct.ps1
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path $envPath)) { throw "Missing .env in project root: $projectRoot" }
$line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*MODEL_API_KEY\s*=' } | Select-Object -First 1
if (-not $line) { throw 'MODEL_API_KEY is missing from .env' }
$key = ($line -split '=',2)[1].Trim().Trim('"').Trim("'")
if (-not $key -or $key -match '^LLM_YOUR_') { throw 'MODEL_API_KEY is empty or a placeholder' }
$headers = @{ Authorization = "Bearer $key" }
$body = @{ model = 'muse-spark-1.3'; input = 'Reply with exactly OK.'; max_output_tokens = 128 } | ConvertTo-Json
try {
    $res = Invoke-RestMethod -Method Post -Uri 'https://api.meta.ai/v1/responses' -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 90
    Write-Host 'META API SUCCESS'
    Write-Host "Response status: $($res.status)"
    Write-Host "Response ID: $($res.id)"
    $texts = @($res.output | ForEach-Object { $_.content } | Where-Object { $_.type -eq 'output_text' } | ForEach-Object { $_.text })
    Write-Host "Assistant response: $($texts -join '')"
    Write-Host "Input tokens: $($res.usage.input_tokens)"
    Write-Host "Output tokens: $($res.usage.output_tokens)"
} catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'N/A' }
    Write-Host "META API FAILED (HTTP status: $status)"
    Write-Host "Error type: $($_.Exception.GetType().Name)"
    throw 'Please share only the HTTP status and error type. Do not share your API key.'
}
