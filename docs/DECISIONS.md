# Architecture decision records (ADRs)

## ADR-001 · API-first, provider-neutral model routing · Accepted
**Decision:** Muse Spark 1.3 via Meta Model API for initial inference. Put a backend adapter between agent and provider; allow Glimmer as a separate later local backend. **Why:** $150 promotional credits make fast iteration possible; local model hosting is a separate optimization effort. **Trade-off:** Internet dependency and billable usage.

## ADR-002 · Standard API mode by default · Accepted
**Decision:** Use `muse-spark-1.3`, not `muse-spark-1.3-contributor`. **Why:** Meta's Standard mode says user content is not used to train Meta models; Contributor may use submitted content for training. **Trade-off:** Higher public rates.

## ADR-003 · Local in-memory prototype sessions · Temporary
**Decision:** For Phase 1.1 the local server stores a UUID-to-last-provider-response-ID mapping in RAM, and Meta keeps conversation history using `previous_response_id` and `store: true`. **Why:** Low-complexity context continuity including prior reasoning with the Responses API. **Trade-off:** Meta retains provider-side history; no local durability, account isolation, multi-worker support or deletion UI. **Exit:** Build authenticated user-owned history, stateless encrypted replay and deletion controls before production.

## ADR-004 · Separate ASR from reasoning · Accepted
**Decision:** Use Muse Voice Transcribe for microphone audio and Spark for text reasoning; Kokoro for outgoing audio. **Why:** Voice Transcribe is speech-to-text only; Spark 1.3 direct audio quality has documented limitations. **Trade-off:** Pipeline adds orchestration latency.

## ADR-005 · Human-in-the-loop actions · Accepted
**Decision:** No external side effects without explicit approval. **Why:** Tool output and webpages may contain malicious instructions, and personal assistants require bounded authority. **Trade-off:** Some workflows take extra confirmation steps.

## ADR-006 · Windows-first developer workflow · Accepted
**Decision:** All initial commands in PowerShell, using VS Code; optional GPU deployment may use Linux on remote host. **Why:** Existing user development setup. **Trade-off:** Some model-serving tools remain easier in Linux containers.

## ADR-007 · Local streaming prototype rather than premature framework build · Accepted
**Decision:** Add POST SSE streaming and a zero-build HTML demo in Phase 1.1, then develop Next.js in Phase 2. **Why:** Verifies actual event contracts independently of frontend toolchain. **Trade-off:** Basic demo cannot cancel or reconnect safely and is not a polished product interface.

- 2026-10-29: Use direct `httpx` Meta Responses HTTP/SSE adapter instead of OpenAI Python SDK for Windows policy compatibility.

## 2026-10-29: Phase 2 dashboard architecture

- Keep validated FastAPI v0.2.1 backend unchanged, including its direct HTTPX Muse provider; avoid reintroducing SDK `jiter` on Windows.
- Add Next.js **16.4.3** App Router + React + TypeScript as a separate `frontend/` app.
- Route browser requests through same-origin `app/api/...` proxy; keep `MUSE_BACKEND_URL` server-only and restricted to loopback.
- Store UI transcripts in browser localStorage only as a temporary **insecure** prototype convenience; never present them as encrypted persistent memory or provider-side deletion.
- Show only the currently usable Muse Spark 1.3 model; omit nonfunctional Wonder selection.
- Preserve existing backend no-build chat demo at port 8000; new dashboard runs on port 3000.
- Do not call Phase 2 verified until npm install/build and manual browser acceptance are complete on developer's Windows host.
