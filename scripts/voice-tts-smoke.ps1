# No Muse credits consumed; tests only local Kokoro TTS.
$ErrorActionPreference='Stop'
$body = @{ text='Hello, this is MUSE Nova voice beta.'; voice='af_heart' } | ConvertTo-Json
$target=Join-Path $PSScriptRoot 'voice-test.wav'
Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://127.0.0.1:8000/v1/voice/synthesize' -ContentType 'application/json' -Body $body -OutFile $target
Write-Host "Generated: $target"
Write-Host "Size: $((Get-Item $target).Length) bytes"
Write-Host 'You can play this WAV file in Windows Media Player.'
