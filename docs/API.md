# MUSE Nova API — version 0.2.0

**Base URL:** `http://127.0.0.1:8000` (local-only; no authentication).

## `GET /` — local demo
Single-page HTML chat test UI with real-time SSE text rendering. Not production frontend.

## `GET /health` — free
Returns `{"status":"ok","service":"muse-nova-api","version":"0.2.0"}`; makes no provider request.

## `POST /v1/chat` — nonstreaming

Request:
```json
{"message":"Hello Nova","conversation_id":null}
```

- `message`: required, 1–4000 characters.
- `conversation_id`: optional UUID. Omit/null for new conversation.
- Follow-up uses the returned `conversation_id`; local server maps it to `previous_response_id`.
- Unknown conversation ID returns HTTP 404. Server process restart forgets mapping.

Sample response (values are illustrative):
```json
{
  "conversation_id":"00000000-0000-0000-0000-000000000001",
  "answer":"Hello!",
  "model":"muse-spark-1.3",
  "provider_response_id":"resp_example",
  "usage":{
    "input_tokens":200,"output_tokens":50,"cached_input_tokens":0,
    "estimated_cost_usd":0.0004625
  }
}
```

## `POST /v1/chat/stream` — streaming SSE

Same JSON request as `/v1/chat`; returns content type `text/event-stream`. Example event sequence:

```text
event: session
data: {"conversation_id":"00000000-0000-0000-0000-000000000001"}

event: delta
data: {"text":"Hello"}

event: delta
data: {"text":"!"}

event: done
data: {"conversation_id":"00000000-0000-0000-0000-000000000001","provider_response_id":"resp_example","model":"muse-spark-1.3","usage":{"input_tokens":200,"output_tokens":50,"cached_input_tokens":0,"estimated_cost_usd":0.0004625}}
```

- `session`: available first; session ID is needed for follow-ups.
- `delta`: append `text` in order to render output.
- `done`: provider completed, state committed, approximate usage available.
- `error`: upstream failure or incomplete streaming; user may retry. **No session advancement** on failure. HTTP may still be 200 once SSE headers have been sent.
- `POST` requires fetch with readable stream or an SSE-capable client; browser `EventSource` itself supports only GET.
- Responses are **not** resumable after disconnect in this local backend; a disconnected request may still have been processed/billed upstream.

## `GET /v1/usage` — in-process estimates

```json
{
  "completed_calls":2,
  "estimated_total_usd":0.000925,
  "calls_without_pricing":0,
  "disclaimer":"In-memory estimates only; not a balance, invoice, or spending limit."
}
```

- This is not a credit balance and is reset on process restart.
- Uses Meta list prices for known text models; partial, failed, or unpriced requests may not be counted.
- These estimates are not reliable as a hard spending safeguard.

## Errors and privacy

- `422`: invalid message; `404`: unrecognized local conversation.
- `503`: missing `MODEL_API_KEY`; `502`: provider request failure (nonstream).
- SSE errors emit a sanitized `error` event without internal details.
- **`store: true`**: Meta server-managed conversations. No local durable conversation data.
- No authentication or public deployment support in this version.

## Future APIs (not implemented)

`WS /v1/realtime`, `POST /v1/tool-approvals/{id}`, `POST /v1/research`, `GET /v1/tasks/{id}`, `GET /v1/memories`, `DELETE /v1/memories/{id}`.

## Phase 2 v0.3.0 frontend proxy additions

These endpoints run on **Next.js 127.0.0.1:3000**, not FastAPI. The backend API above remains at version `0.2.1`.

| Next.js endpoint | Proxies to FastAPI | Details |
|---|---|---|
| `POST /api/chat/stream` | `POST /v1/chat/stream` | Same JSON body; forwards streamed SSE responses without buffering. |
| `GET /api/health` | `GET /health` | Returns current local backend health, or HTTP 503. |
| `GET /api/usage` | `GET /v1/usage` | Returns in-process estimates only. |

Proxy backend URL is server-only `MUSE_BACKEND_URL` in `frontend/.env.local`. It accepts loopback HTTP hosts only. **No credentials belong in the frontend.** The Next.js proxy does not authenticate users; both processes must stay bound to loopback. See [`FRONTEND_PHASE2.md`](FRONTEND_PHASE2.md) for browser behavior and tests.

## Phase 4.1 — Vision streaming

`POST /v1/chat/vision/stream`: multipart form fields `message` (required, 1–4000 chars), optional `conversation_id` UUID, and 1–3 `images` files, JPEG/PNG/WebP ≤4 MiB each. SSE `session`, `delta`, `done`, `error` exactly matches `/v1/chat/stream`.

Next.js browser proxy: `POST /api/chat/vision/stream` receives the same form fields; no key required in the browser. Invalid types/sizes return HTTP 422, oversized content may return HTTP 413. Local-only, unauthenticated, not public. See `docs/VISION_PHASE4_1.md`.
