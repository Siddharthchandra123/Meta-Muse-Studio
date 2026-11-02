# Prints effective Muse output settings without displaying your API key or using credits.
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Push-Location $root
try {
@'
from dotenv import load_dotenv
from pathlib import Path
import os
load_dotenv(Path.cwd() / '.env', override=True)
if not os.environ.get('MODEL_API_KEY', '').strip():
    print('MODEL_API_KEY: missing (configure .env before live calls)')
else:
    print('MODEL_API_KEY: configured (not displayed)')
from app.provider import MuseProvider
try:
    p = MuseProvider()
    print('Effective MAX_OUTPUT_TOKENS:', p.max_tokens)
    print('Effective MUSE_REASONING_EFFORT:', p.reasoning_effort)
    if p.max_tokens < 4096:
        print('RECOMMENDATION: Set MAX_OUTPUT_TOKENS=4096 in .env')
except Exception as exc:
    print('Configuration check:', type(exc).__name__)
'@ | python -
} finally { Pop-Location }
