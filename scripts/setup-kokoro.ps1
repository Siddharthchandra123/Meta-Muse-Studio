# Phase 3.1 local voice output. Downloads official Kokoro ONNX weights (~326MB + ~28MB).
# No Meta key needed. Run from any directory in Windows PowerShell.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'models\kokoro'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$base = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1'
$files = @('kokoro-v1.0.onnx', 'voices-v1.0.bin')
foreach ($name in $files) {
  $output = Join-Path $dir $name
  if (Test-Path $output) {
    Write-Host "Already present: $name"
  } else {
    Write-Host "Downloading official Kokoro model file $name..."
    Invoke-WebRequest -Uri "$base/$name" -OutFile $output
  }
  $info = Get-Item $output
  if ($info.Length -lt 1048576) {
    throw "$name is unusually small; remove it and retry the official download."
  }
  $hash = Get-FileHash $output -Algorithm SHA256
  Write-Host "$name  Bytes=$($info.Length)  SHA256=$($hash.Hash)"
}
Write-Host 'Kokoro assets ready under models\kokoro; these are excluded by .gitignore.'
Write-Host 'Install requirements-voice.txt in Python 3.10-3.13 and restart FastAPI.'
