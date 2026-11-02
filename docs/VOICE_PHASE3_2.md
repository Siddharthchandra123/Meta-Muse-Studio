# Phase 3.2 — Continuous real-time voice (beta)

## Scope

This is an **opt-in continuous ASR voice mode**. The Next.js dashboard now has a **Start live conversation** button above the chat composer. It uses Muse Voice Transcribe's realtime WebSocket (not the recorded-file ASR endpoint), model-side endpointing, live partials, a bounded completed-turn queue, Muse Spark's existing SSE request/response path, and the existing Kokoro full-WAV synthesis.

The implementation supports **interrupting ongoing browser playback** and **cancelling in-flight HTTP generation** on speech-start. It does **not** yet stream Kokoro audio sentence-by-sentence, guarantee low latency, or provide server-side cross-device playback cancellation. No latency measurements have been made.

## Requirements
- Working and verified v0.4.0 Phase 3.1 environment and valid `MODEL_API_KEY` in the project root `.env`.
- Python `websockets>=14,<17`, installed through `requirements-voice.txt`.
- Recent Chrome or Edge with AudioWorklet, secure mic access on `http://127.0.0.1:3000`.
- FastAPI served only on `127.0.0.1:8000` and Next.js only on `127.0.0.1:3000`.
- Headphones strongly recommended; browser echo cancellation cannot guarantee acoustic isolation.

## How to run

### PowerShell terminal A — FastAPI

```powershell
cd "$HOME\Downloads\muse-nova-phase32\muse-nova"
# Copy your actual working .env from v0.4.0 into THIS folder (do not publish it).
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-voice.txt
python -m pytest -q
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Kokoro model `.onnx` and voice `.bin` files must also exist in the new folder. If not, rerun `scripts/setup-kokoro.ps1`, or copy your existing model assets locally. Don't add them to Git.

### PowerShell terminal B — Next.js

```powershell
cd "$HOME\Downloads\muse-nova-phase32\muse-nova\frontend"
Copy-Item .env.local.example .env.local
npm install
npm run test:stream
npm run typecheck
npm run build
npm run dev
```

Open `http://127.0.0.1:3000`. Click **Start live conversation** and grant permission. Speak, pause, observe the partial transcript, then wait for the finalized turn and response. Speak again while Kokoro is playing to test interruption. Stop live mode to close the mic. The older one-turn microphone button remains available when live mode is off.

## Wire behavior

The browser opens `ws://127.0.0.1:8000/v1/voice/realtime`. FastAPI checks the WebSocket Origin + Host and retrieves the API key from `.env`. FastAPI opens the Meta realtime WebSocket, sends the Meta handshake in the **first text frame** (it is not an HTTP Authorization header), and forwards 24kHz mono PCM16 as binary frames. Meta emits:

```
speechStart(turnId) -> transcript (partial replacements) -> speechEnd(turnId)
    -> speechComplete(turnId, finalized transcript)
```

`speechEnd` is not a transcript-complete signal. Only `speechComplete` can enqueue a Muse Spark response. Asynchronous turn IDs are de-duplicated. Once the browser sends `{"type":"endStream"}`, the backend permits the Meta stream to flush before shutdown.

## Windows acceptance checklist

- [ ] Backend health reports v0.3.2.
- [ ] Push-to-talk and manual Listen still work.
- [ ] Clicking Start live conversation shows Listening.
- [ ] Live microphone publishes intermediate words that may revise in place.
- [ ] A short pause yields a **finalized** question and exactly one Muse Spark request.
- [ ] Assistant replies aloud automatically via Kokoro.
- [ ] Speaking over the reply stops playing audio and aborts the current request where possible.
- [ ] Stop live conversation shuts off microphone; no unexpected new turns afterwards.
- [ ] `npm run typecheck` and `npm run build` pass locally.
- [ ] Check actual Meta ASR charges in Meta dashboard (not local usage API).

## Known limitations and next optimization

- TTS currently buffers a complete WAV before playing, so initial response audio may be delayed; move to sentence-by-sentence queued synth and playback if latency requires it.
- If your speakers are loud, their output can be transcribed as a new user utterance even with browser echo cancellation; use headphones.
- The browser initiates a direct **local** backend WebSocket. Running the dashboard on a different device won't work; production needs authenticated HTTPS/WSS and server-side identity.
- The frontend has a 20-minute automatic session stop to avoid accidentally leaving paid transcription running. Meta documents a maximum 60-minute realtime session.
- Backpressure is capped and unreliable networks may close the stream. Push-to-talk is the fallback.
- No complete hard Meta API spending cap or production multi-user controls.

## References
- https://dev.meta.ai/docs/api-reference/voice/realtime
- https://dev.meta.ai/docs/speech-to-text
- https://dev.meta.ai/docs/cookbook/voice-api-fundamentals

## v0.5.1 WebSocket startup diagnostic (2026-10-30)

Previous v0.5.0 live mode was reported to show browser WebSocket error 1006.
The **root cause on the user's Windows host is not yet verified**. The new build
changes failure visibility and adds preflight checks; it is not a confirmed repair
of any external firewall, proxy or Meta access problem.

From the project root, while FastAPI v0.3.3 is running:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-realtime.ps1
# Only if local readiness passes and you want to check the Meta websocket:
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-realtime.ps1 -Live
```

The first command is free and checks backend version, configured key (boolean
only), `websockets` package, and allowed browser origins. The `-Live` command
connects to Meta through FastAPI, performs a handshake, immediately sends
`endStream` without audio, and may consume a small amount of API credit.

A successful upstream session reports `Meta realtime handshake: READY`.
A failure now returns a sanitized code, for example `META_AUTH_OR_ACCESS`,
`META_CONNECT_TIMEOUT`, or `META_NETWORK_ERROR`, rather than an unhelpful
browser error. The backend intentionally never logs the raw exception message
because it could include sensitive information.

Open the dashboard at `http://127.0.0.1:3000` (or port 3001 if Next.js chose
that port); those local origins are allowed by default. To replace the allowlist:

```
LIVE_VOICE_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
```

Keep it local-only. Do not add wildcard or public origins to this research beta.
Phase 3.1 push-to-talk remains the verified fallback.
