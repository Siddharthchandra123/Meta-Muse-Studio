param([switch]$Live)
$ErrorActionPreference = 'Stop'
$base='http://127.0.0.1:8000'
Write-Host 'Checking MUSE Nova Studio (catalog call is free)...'
$health=Invoke-RestMethod "$base/health"
Write-Host 'Backend version:' $health.version
$catalog=Invoke-RestMethod "$base/v1/studio/models"
Write-Host 'Models in catalog:' $catalog.models.Count
$catalog.models | Select-Object name,id,availability | Format-Table -AutoSize
if($catalog.listing_error){Write-Host 'Model listing warning:' $catalog.listing_error}
if($Live){
    Write-Host 'Sending one BILLABLE inference request to Muse Spark 1.3...'
    $payload=@{model='muse-spark-1.3';prompt='Respond with one short sentence introducing MUSE Nova Studio.';effort='minimal';max_output_tokens=512}|ConvertTo-Json
    $response=Invoke-WebRequest "$base/v1/studio/run/stream" -Method Post -ContentType 'application/json' -Body $payload -UseBasicParsing
    $response.Content -split "`n" | Where-Object {$_ -match '^(event:|data:)'} | Select-Object -Last 12
}else{Write-Host 'No inference was sent. Use -Live for a single billable text test.'}
