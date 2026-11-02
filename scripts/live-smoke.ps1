param([switch]$Live)

$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8000"
Write-Host "Checking local server (free)..."
Invoke-RestMethod "$base/health" | Format-List
if (-not $Live) {
    Write-Host "No credits used. Pass -Live to send TWO billable test requests."
    exit 0
}
Write-Host "Sending two small requests through your configured server key..."
$one = @{ message = "In this test, my favorite color is teal. Reply briefly." } | ConvertTo-Json
$first = Invoke-RestMethod "$base/v1/chat" -Method Post -ContentType "application/json" -Body $one
Write-Host "First answer: $($first.answer)"
$two = @{ message = "What is my test favorite color?"; conversation_id = $first.conversation_id } | ConvertTo-Json
$second = Invoke-RestMethod "$base/v1/chat" -Method Post -ContentType "application/json" -Body $two
Write-Host "Second answer: $($second.answer)"
Write-Host "Model: $($second.model)"
Write-Host "Local cost ESTIMATE (not provider invoice):"
Invoke-RestMethod "$base/v1/usage" | Format-List
