# Architecture & data flows

## Principles
**API-first, replaceable provider adapter, explicit approval for actions, progressive deployment.** The API provides intelligence; the product owns workflow policy and execution. In v0.2, Meta manages conversation history; user-owned history is a future phase.

## Component boundaries
| Component | Runs | Responsibility | Initial status |
|---|---|---|---|
| Browser test UI | browser | plain-text chat streaming with no build step | Implemented (local-only) |
| Next.js interface | browser | multimodal inputs, task cards, approvals | Planned |
| API gateway | localhost FastAPI | validate requests, JSON/SSE responses | Implemented (local-only) |
| Session service | backend | local UUID to upstream `previous_response_id` map | Prototype in RAM; provider stores history |
| Orchestrator | backend | task plan, node transitions, retries, checkpoints | Planned LangGraph |
| Model adapter | backend | Meta Responses; future Glimmer OpenAI-compatible adapter | Spark implemented |
| ASR adapter | backend relay | authenticate to Muse Voice; normalize transcripts | Planned |
| Policy / approvals | backend | execute sensitive actions only with scoped token and user consent | Planned |
| Tool gateway | isolated workers | search, web browsing, email/calendar integrations | Planned |
| Memory service | DB | short-term context + consented long-term memories + retrieval | Planned |
| TTS | local/audio service | sentence chunks to Kokoro streaming audio | Planned |
| Telemetry and billing | backend | estimates of token costs; future durable records | In-process usage estimates only |

## Runtime graph
See `diagrams/architecture.mmd` for the authoritative diagram source.

## Data flow — text (implemented v0.2)
1. Browser sends `POST /v1/chat/stream` (SSE) or `POST /v1/chat` (JSON) with message and optional local conversation ID.
2. API validates the request; the local session maps to Meta's last `previous_response_id` or starts a new chain.
3. Model adapter calls Meta Responses API in Standard mode with `store: true`, resending the fixed instructions each turn.
4. Streamed `response.output_text.delta` becomes sanitized SSE `delta` events; a completed provider result produces `done`, with a new response ID and estimated token cost.
5. The session updates **only after completion**. Partial failure yields an error and does not advance local response chain. Provider may still bill on interrupted requests.
6. The demo UI displays text only, not raw Markdown HTML. No browser automation, voice or external actions are implemented.

**Caveat:** We do not yet control transcript retention or deletion; the provider stores response chains. This is suitable only for non-sensitive prototype data until privacy/retention decisions are implemented.

## Data flow — future voice
1. Frontend captures microphone only after explicit permission.
2. Audio is sent over WebRTC/WebSocket to our backend, not with the Meta secret embedded in a browser.
3. Backend creates the required WebSocket handshake frame at `wss://api.meta.ai/v1/asr/realtime`. Meta Voice docs note its realtime `Authorization` HTTP header is ignored; authentication belongs in the handshake frame.
4. `speechStart`, `transcript`, `speechEnd`, `speechComplete` events map to UI transcript state; key turns by `turnId`.
5. Completed speech turns enter the same orchestrator as typed user input.
6. Assistant response is spoken through Kokoro; new detected user speech cancels queued audio (barge-in).

## Future concurrency, recoverability and failure
- Use idempotency keys for side-effecting tools; do not blindly retry an email send.
- Persist task checkpoints before/after tools; resume after failures with recorded state.
- Cap model/tool iterations and per-task budget; use typed recoverable error responses.
- Handle provider timeouts/rate limits (429/5xx); degrade to text-only on TTS failure.
- When credits are exhausted, show an explicit error or switch to configured local model *only* if compatible and healthy.

## Deployment topologies
- **Dev:** Windows PowerShell + FastAPI localhost + hosted Muse API; DB/Redis later with Docker Desktop.
- **Hybrid:** frontend+orchestrator+memory on owned host, hosted Muse models via HTTPS; Kokoro local.
- **GPU:** ROCm/vLLM Muse Glimmer on remote AMD MI300X; do not claim performance until actual measurements.

## Security boundaries
Browser is untrusted; model output is untrusted; retrieved web content is untrusted; tool worker is sandboxed; credential vault is never in model context. See SECURITY.md.
