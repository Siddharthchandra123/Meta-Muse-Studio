# Threat model, privacy and deployment gates

## Assets
API credits, private conversation text, microphone streams, user documents, OAuth credentials, browser sessions, audit trails.

## Entry points and defenses
| Risk | Defense |
|---|---|
| API key leak | `.env` gitignored; backend-only; secret manager in production; rotate on exposure |
| Browser prompt injection | Treat all page text as data; isolate web content; never execute instructions from pages |
| Tool abuse | Typed schemas, backend allowlists, policy checks and approvals before side effects |
| SSRF / private network access | Block loopback, link-local, metadata service and private network destinations in browser tools |
| Cross-user memory leakage | Authentication + strict owner scoping + DB row-level policies (future) |
| Unexpected credit spend | Short histories, token ceilings, rate limiting, alerting and provider billing controls |
| CSRF / XSS | Secure cookies, CSRF tokens where needed, CSP and UI sanitization (future) |
| Untrusted uploaded files | MIME inspection, limits, isolated parsing, anti-malware checks when needed |
| Voice replay/inadvertent action | Intent verification and explicit approval for impactful actions |
| Excessive logs | Redaction, access control, log retention and consent |

## Critical release blockers
The current starter is **NOT production-secure**. No authentication, authorization, persistent audit log, production spend enforcement, or isolated browser is implemented. Keep on `127.0.0.1` only.

Before exposing any user-facing service:
1. Implement sign-in/authenticated sessions with authorization tests.
2. Separate all users, documents, memories and tool credentials by principal.
3. Enforce action approval and typed tool allowlists.
4. Use per-user rate limits, spend caps, real billing alerts and bounded workloads.
5. Add data retention policy, consent screens, export/deletion and TLS.
6. Test prompt-injection, replay, tool abuse, SSRF and malformed file handling.

## Provider privacy decision
Default model is `muse-spark-1.3` **Standard mode**. Do not silently switch to `muse-spark-1.3-contributor`: Meta says Contributor content can be used for training. Users must explicitly opt in if ever made available.

## Phase 1.1 privacy disclosure
Meta Responses calls use `store: true` for multi-turn `previous_response_id` continuity. Local session mapping is in-memory and disappears on restart, but dropping or resetting that mapping does not delete provider-side history. Use only synthetic/non-sensitive messages in this prototype. The browser receives no API key.

## Phase 2 — Next.js dashboard (development-only)

- Bind both processes to `127.0.0.1`; **no public deployment or team sharing**. Both Next.js `/api` routes and FastAPI remain unauthenticated; a production rollout needs user/session authentication, CSRF protection, request rate limiting and data segregation.
- Keys stay only in Python `.env`; browser calls `/api/chat/stream` through server-only local proxy. `frontend/.env.local` contains only `MUSE_BACKEND_URL`.
- Chat transcripts in browser `localStorage` are unencrypted. Deleting them does **not** delete Meta-hosted `store:true` responses. Use only non-sensitive data until retention is redesigned.
- UI treats generated text as plain text; do not add `dangerouslySetInnerHTML` for model responses.
- Stop/abort is best-effort: request may still consume API credits. Usage panel is an estimate, **not** a credit balance, invoice or enforcement mechanism.
- Browser history may persist a stale UUID after FastAPI restart; show invalid-session error and start a fresh chat.
