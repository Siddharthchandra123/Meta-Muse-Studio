param([switch]$Live)
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8000'
Write-Host 'MUSE Nova v0.9.2 - Model Catalog and Comparison Lab'
$health = Invoke-RestMethod "$base/health"
Write-Host 'Backend:' $health.service 'version' $health.version
$catalog = Invoke-RestMethod "$base/v1/studio/models"
Write-Host 'Catalog entries:' $catalog.models.Count
Write-Host 'Catalog status:' $catalog.catalog_status
$catalog.models | Select-Object name,id,availability,family | Format-Table -AutoSize
if ($catalog.listing_error) { Write-Host 'Warning:' $catalog.listing_error }
$compare = $catalog.models | Where-Object { $_.family -eq 'reasoning' -and $_.mode -eq 'api' -and $_.availability -ne 'not-listed' } | Select-Object -First 2
if (-not $Live) {
  Write-Host 'Free diagnostics complete. Run with -Live to test two billable model responses.'
  exit 0
}
if (@($compare).Count -lt 2) { throw 'At least two runnable reasoning model IDs are required.' }
foreach ($model in $compare) {
  Write-Host 'Running billable test:' $model.id
  $body = @{model=$model.id; prompt='Reply in one short sentence: What is MUSE Nova?'; instructions='Be concise.'; effort='minimal'; max_output_tokens=512} | ConvertTo-Json -Depth 5
  $result = Invoke-WebRequest "$base/v1/studio/run/stream" -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing
  $result.Content -split "`n" | Where-Object { $_ -match '^(event:|data:)' } | Select-Object -Last 10
}
Write-Host 'Comparison request test completed. Review usage events above.'
