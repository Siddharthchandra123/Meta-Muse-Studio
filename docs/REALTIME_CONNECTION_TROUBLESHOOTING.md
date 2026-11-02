# Troubleshooting MUSE Nova real-time voice on Windows

The exact error **Cannot reach Meta's realtime WebSocket** means an upstream Python networking exception. It does **not** prove Windows Defender/firewall is responsible.

## 1. Ensure the Phase 5 backend is running

From the inner `muse-nova` directory with its venv active:

```powershell
python -m pip install -r requirements-agent.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --log-level info
```

The Phase 5 `/health` should report version `0.5.0`. In a second terminal, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-realtime.ps1
```

This checks local configuration, DNS, and direct TLS (free). It does not contact the paid Muse ASR API. Corporate proxy networks may block direct TLS even when an authenticated proxy works.

## 2. Test Meta's live handshake (optional; may consume credits)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-realtime.ps1 -Live
```

It connects through your local FastAPI WebSocket and sends the Meta handshake, but no microphone audio. It prints safe error codes without your key.

## 3. Interpret results

| Result | Meaning | Action |
|---|---|---|
| DNS FAILED | Hostname could not be resolved | Check VPN / local DNS / proxy settings |
| TCP/TLS FAILED | Direct outbound TLS failed | Check network, corporate proxy or certificate trust. Do not disable security controls |
| META_PROXY_ERROR | Proxy rejected the WebSocket connection | Check proxy credentials and whether it allows `wss://` |
| META_DNS_ERROR | DNS resolution failed inside Python's connection path | Check Python process network and DNS |
| META_TLS_ERROR | TLS handshake/certificate validation failed | Resolve certificate trust or organizational TLS interception |
| META_NETWORK_ERROR | Other upstream OS networking error | Compare direct test with another network, inspect server logs |
| META_AUTH_OR_ACCESS | Meta rejected credentials or model access | Check Meta Model API dashboard |
| META_RATE_LIMIT | Realtime concurrency/rate limit | Stop old live sessions and retry with backoff |
| READY | Meta accepted the live voice handshake | Test microphone and browser reconnect logic |

Meta documented endpoint: `wss://api.meta.ai/v1/asr/realtime`. Successful text chat or batch transcription does not prove that a WebSocket can connect. Do not paste `.env` or full proxy URLs/credentials into logs or chat.

If the issue began after upgrading from Phase 3, ensure only one FastAPI process owns port 8000. The v0.8.0 diagnostic mistakenly rejected any backend other than v0.3.3; v0.8.1 corrects this.

In the meantime, **push-to-talk** (`/v1/voice/transcribe`) continues to operate separately when the Meta REST audio endpoint is reachable.
