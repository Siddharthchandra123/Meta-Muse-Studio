# MUSE Nova Phase 4 — HTTP 422/404 diagnostic and v0.7.1 recovery

## Background

`422` from `POST /v1/chat/multimodal/stream` means the endpoint *exists* but did not accept a required form field, attachment, size, image signature, PDF structure, or conversation_id syntax. Before this release, the Next.js proxy hid FastAPI's detailed validation errors when `detail` was a list.

`404` can mean either that the endpoint is missing **or** that FastAPI returned `Unknown conversation_id`. The latter is common because FastAPI retains conversation ID -> Meta response ID only in process memory, while the Next.js browser persists its ID to localStorage. Restarting the server invalidates old IDs.

## What's fixed

* Both streaming proxy routes now preserve readable form validation errors from FastAPI.
* When and **only when** the backend reports HTTP 404 with `detail: "Unknown conversation_id"`, Next.js retries once without the stale ID. The initial rejection is before provider inference, so this does not duplicate a charged inference call.
* On successful recovery, browser shows a notice that provider context has restarted and old messages remain local-only. The backend `session` SSE event replaces the stale ID with the new one.
* HTTP 404 due to a missing route is not retried.

This is a **recovery mechanism**, not persistent memory: the old thread remains visible but Meta may not have the earlier messages in the new session. For durable context across backend restarts, Phase 6 must store backend session state or implement provider response ID rehydration.

## Free diagnostics

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-phase4-routes.ps1
```

Expected: version `0.4.3` (existing backend), `Multimodal route: PRESENT`.

## Validation checks

Send a valid PNG or the bundled `samples/example_report.pdf` and ask a question. If a request fails, the UI now reports specific validation error details rather than a generic 422. Make sure the request has `message` and multipart `images` or `documents` fields.

## Verification

Unit tests do not contact Meta. The Next.js production build and live Meta multimodal requests need to be verified on the user's Windows installation.
