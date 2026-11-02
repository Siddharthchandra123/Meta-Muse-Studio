param([switch]$Live)
$ErrorActionPreference = 'Stop'
$base='http://127.0.0.1:8000'
Write-Host "MUSE Nova Phase 5 diagnostics" -ForegroundColor Cyan
$health=Invoke-RestMethod "$base/health"
Write-Host "Backend version: $($health.version)"
if($health.version -ne '0.5.0'){ throw 'Run the Phase 5 backend (version 0.5.0) first.' }
$status=Invoke-RestMethod "$base/v1/agent/status"
Write-Host "Search configured: $($status.configured_search)"
Write-Host "Approved domains: $($status.allowlisted_domains -join ', ')"
if(-not $status.configured_search){Write-Warning 'Configure SEARXNG_BASE_URL in .env; web search cannot run yet.'}
if(-not $status.allowlisted_domains.Count){Write-Warning 'Configure AGENT_ALLOWED_DOMAINS in .env; external URLs will be blocked.'}
if(-not $Live){Write-Host 'Local diagnostic complete (no Meta credits). Pass -Live for a billable agent test.';exit 0}
Write-Host "Starting one billable research test..." -ForegroundColor Yellow
$body=@{prompt='Calculate 19 * 23 using the calculate tool, then provide the result.'} | ConvertTo-Json
# Requests SSE; print event lines and the model's final answer.
$response=Invoke-WebRequest -Method Post -Uri "$base/v1/agent/stream" -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 240
$events=[regex]::Matches($response.Content,'(?m)^event: ([a-z]+)') | ForEach-Object { $_.Groups[1].Value }
Write-Host "Events: $($events -join ', ')"
if($events -notcontains 'done'){Write-Warning 'No done event. Inspect the response below.'}
$response.Content | Select-String -Pattern 'event: (done|error)' -Context 0,1
