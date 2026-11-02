# MUSE Nova Engineering State — v1.0.1 (2026-10-31)

## Phase 6 startup compatibility fix

- [x] Replaced `app.add_event_handler('shutdown', close_workflows)` with an ASGI `lifespan` async context manager; the old method was removed in Starlette 1.0.
- [x] Preserved lazy PostgreSQL + LangGraph initialization and awaited `close_workflows()` in the lifecycle `finally` block.
- [x] Bumped FastAPI application health version to `0.7.1` (project bundle `v1.0.1`); no frontend/API schema changes.
- [x] Added isolated lifespan regression tests and verified **91 Python tests pass**.
- [ ] Live validation: Windows Docker Desktop database, memory CRUD, LangGraph restart, Meta calls and full Next.js build still pending.
- [ ] Do not weaken Windows App Control or firewall to address this Python method error.

See `docs/PHASE6_LIFESPAN_HOTFIX.md`.

---

# MUSE Nova Engineering State — v1.0.0 (2026-10-31)

## User-verified milestones

- [x] Phase 1 — Meta Muse chat, streaming and API usage.
- [x] Phase 2 — Next.js dashboard.
- [x] Phase 3 — microphone, Muse transcription, Kokoro, continuous live voice/WebSocket hotfix.
- [x] Phase 4 document requests — resolved output-token limit; complete all-visual-modes live verification remains partial.
- [x] Phase 5 — user confirms web research and autonomous tool workflows are working.
- [x] Muse Studio — user confirms model catalog, playground and model comparison are working.

## Phase 6 implementation (this release)

- [x] `app/memory_db.py` — PostgreSQL tables and pgvector vector(384) HNSW index, deterministic local lexical embeddings; add/list/search/delete explicit user memory; chat/research thread index.
- [x] `app/persistent_graph.py` — real LangGraph StateGraph nodes and AsyncPostgresSaver integration, checkpointed chat and research threads. No credentials or raw uploaded image/document bytes in checkpoints.
- [x] `app/memory_api.py` — opt-in runtime and typed REST endpoints for memory and threads; confirmation-gated clear.
- [x] Existing FastAPI routes conditionally use durable chat LangGraph pipeline when MEMORY_ENABLED=true. When disabled, original behavior remains.
- [x] Agent stream optionally uses durable research LangGraph workflow, preserving approval-required note saves.
- [x] `frontend/src/app/memory/` — saved-memory CRUD, lexical search, durable thread inspection/deletion and resume in original chat sidebar.
- [x] Windows scripts, `requirements-memory.txt`, Docker Desktop compose config and complete Phase 6 docs.
- [ ] Windows live validation: Docker Postgres+pgvector, migrations, two-turn restart test, Muse multimodal regression, complete `npm run typecheck` and `npm run build`.

### Important limits

- Single-user localhost-only developer prototype. No account authentication or production-ready privacy/security yet.
- Default search uses local hashed lexical vectors, NOT neural semantic embeddings.
- Saved memories must be explicitly created. Deleting a memory removes it from future retrieval, but old answers / provider-side data may retain copies.
- Source compatibility: old browser-only sessions are not backfilled into PostgreSQL.
- `LANGGRAPH_STRICT_MSGPACK=true` recommended, and `MEMORY_ENABLED=false` is the safe legacy fallback if DB isn't available.

Read `docs/PHASE6_MEMORY_LANGGRAPH.md` before modifying this stage. Phase 7: AMD MI300X / local inference; Phase 8: authentication, production security and spending controls.

---

## v0.9.5 (2026-10-31) — Agent stream 403 loopback alias compatibility

- [x] Fixed over-strict same-origin check in agent streaming and note approval Next.js routes; `localhost` and `127.0.0.1` are accepted as equivalent *only when both use HTTP on the same port*.
- [x] Preserved cross-origin protections for foreign hosts, mismatched ports and schemes.
- [x] Updated agent UI to reveal local 403 validation details instead of a generic HTTP error.
- [x] Added focused Node origin-security tests and a no-credit PowerShell diagnostic `scripts/diagnose-agent-403.ps1`.
- [ ] Windows Next.js typecheck/build and real agent research request still require live verification.

---

## v0.9.4 (2026-10-31) — Unified Muse Studio UI refresh

- [x] Unified dark AI Studio-inspired design across `/studio`, `/studio/catalog`, `/studio/compare` with optional persistent light theme.
- [x] Added catalog sorting, grid/list view, responsive two-model selection dock, mobile section navigation, and completed-comparison usage/latency insights.
- [x] Keyboard-visible focus, reduced-motion preference, mobile layout, existing model access labels and approval boundaries retained.
- [x] No changes to backend provider, voice, vision, document, research agents or security-sensitive tool handlers.
- [x] Source tests: 82 Python backend, 35 frontend (including five new UI coverage tests); 32 TS/TSX files syntax parsed.
- [ ] Full Next.js TypeScript check/build and live visual tests on Windows pending; npm registry inaccessible in the build environment.

**Release:** v0.9.4 • Backend 0.6.1 unchanged • Frontend 0.9.4. See `docs/STUDIO_UI_REFRESH_v0.9.4.md`.

---

## v0.9.3 (2026-10-31) — Studio HTTP 400 validation & diagnostics

- [x] Upstream Meta HTTP 400 now produces safe error hints and a sanitized rejected-parameter identifier instead of only a status code; raw upstream error text and any prompt content remain private.
- [x] `max` effort is blocked for incompatible Muse Spark/Contributor models in both frontend and backend; support retained for Muse Spark 1.3 Standard and Muse Wonder.
- [x] Direct no-SDK diagnostic for one model: `python .\scripts\diagnose-studio-http.py --model muse-spark-1.3` (one billable API request).
- [x] Preserved previous main chat, voice, vision, agents and Studio catalog/comparison APIs.
- [x] 82 backend Python tests and 30 Node tests passed; 32 TS/TSX files syntax-parsed.
- [ ] Windows `npm run typecheck` and `npm run build`, real Meta model responses and original 400 cause still need live validation.

**Release:** v0.9.3 • Backend: 0.6.1 • Frontend: 0.9.3. See `docs/STUDIO_HTTP_400_FIX_v0.9.3.md`.

---

## v0.9.2 (2026-10-31) — Model Catalog & Comparison Lab

- [x] Added dedicated `/studio/catalog` and `/studio/compare` pages with AI Studio-inspired light UI and responsive layout.
- [x] Catalog: text search, family/availability filters, per-model details, capability tags, account catalog refresh and 2-model selection.
- [x] Backend catalog now also exposes unrecognized models returned by Meta `/models` without pretending a runnable adapter exists.
- [x] Comparison lab: two independent streamed API runs, same prompt/instructions/settings, output/error isolation, cancel, reported token usage, elapsed wall time, export JSON.
- [x] Excludes Contributor, local, image, speech and unconfigured models from general text comparison; no automatic billable requests.
- [x] Linked catalog and comparison pages from existing `/studio`; preserved Phase 1–5 functionality.
- [x] New Windows diagnostic script `scripts/test-studio-catalog-compare.ps1` with free catalog check and explicit `-Live` billable comparison test.
- [x] Offline verification: 76 backend tests, 28 frontend tests, 32 TS/TSX syntax checks.
- [ ] PENDING WINDOWS CHECK: `npm install`, `npm run typecheck`, `npm run build`, live Meta model listing and both independently streamed comparison requests.
- [ ] No live Meta account entitlement, throughput benchmark, pricing/credit balance or self-hosted inference validated by this release.

**Latest release:** v0.9.2 • Backend: 0.6.0 • Frontend: 0.9.2

## v0.9.1 (2026-10-31) — Next.js strict TypeScript compatibility fix

- [x] Fixed `frontend/src/app/api/chat/multimodal/stream/route.ts` TS18047/TS2339 by copying validated `FormData.get()` input into a local string before a nested `uploadBody()` helper. `FormData.get` returns `FormDataEntryValue | null`, so type narrowing inside the outer flow did not persist into that helper.
- [x] Normalized validated conversation ID to `string | null` before the helper for consistent typing.
- [x] No backend request format, payload constraints, security policies, or Muse Studio API routes changed.
- [ ] Full `npm run typecheck` / `npm run build` on Windows is still necessary; npm dependencies were not present in the build environment.

---

# AGENTS.md — MUSE Nova release status and implementation ledger

**Latest release:** v0.9.0 (2026-10-31) · **Backend:** 0.6.0 · **Frontend:** 0.9.0

## Muse Studio workbench — new in v0.9.0

- [x] `/studio` AI Studio-inspired model catalog, prompt playground, model comparison and configuration sidebar.
- [x] Back-end `/v1/studio/models` consults Meta `GET /v1/models` with a 60s cache; accounts may have different access. Model statuses are never invented.
- [x] Streaming Muse Wonder / Spark 1.1–1.3 with system prompts, reasoning effort, token allowance, and optional image input.
- [x] One-off Muse Image generation/editing, Voice Transcribe WAV upload, and SAM 3.1 **raw** segmentation output.
- [x] Contributor variants guarded by explicit data-use acknowledgment; self-hosted Glimmer/Spark Open and Muse Code-only Wonder Full are cataloged but not falsely runnable.
- [x] App-side source routes keep the key in FastAPI; the existing main chat/agents behavior is preserved.
- [x] Backend offline tests 74 passed; existing frontend offline tests 24 passed; TS/TSX syntax parse successful.
- [ ] **LIVE VERIFICATION PENDING:** npm install/typecheck/build, Meta model catalog availability, hosted model switching, image generation/edit, SAM responses and file transcription through Studio.
- [ ] Future: local inference adapters, parsed segmentation overlay, live credit balance if provider exposes one, durable sessions, server auth, actual spending caps and rate limits.

**Read:** `docs/MUSE_STUDIO.md`. Do not mark the Studio live-verified until the Windows acceptance checks pass.

---

# AGENTS.md — MUSE Nova release status and implementation ledger

**Release:** v0.8.1 (2026-10-30) · **Backend:** 0.5.0 · **Frontend:** 0.8.1

**Goal:** Meta Muse-powered assistant with text, voice, vision, documents, user-approved screen context and increasingly useful tool workflows. Windows 11 + VS Code + PowerShell are the default setup. Meta keys are private to backend `.env`; never put them in the ZIP, web bundle or logs.

## Verified by the user

- [x] **Phase 1:** Muse API successfully returns real output; FastAPI text streaming, context, API usage estimates.
- [x] **Phase 2:** Next.js dashboard, streaming, chat navigation.
- [x] **Phase 3.1:** push-to-talk microphone, Muse transcription and Kokoro speaking responses.
- [x] **Phase 3.2:** live WebSocket ASR, automatic turns, barge-in audio cancellation (v0.5.1 hotfix confirmed working).
- [x] **Phase 4 document path:** User reported the PDF/document output-limit error was resolved by v0.7.2. This establishes a working document request, NOT full validation of every image/screen feature.

## Phase 4 preserved in v0.8.0

- [x] Image upload in chat; PDF, DOCX, TXT, Markdown and CSV attachments; combined inputs. Screen/window capture only after explicit browser permission; opt-in frame with live voice remains off by default.
- [x] v0.7.2 fix retained: `MAX_OUTPUT_TOKENS=4096` default and 8192 cap, minimal reasoning, no silent 2048 clamp.
- [ ] Full live image + screenshot + document comparison + cross-browser screen/voice regression remains unconfirmed.

## Phase 5 source implemented in v0.8.0

- [x] `app/agent_runner.py`: Muse Responses API function calls with `previous_response_id` and `function_call_output`; max 5 planning rounds, max 10 tool calls; safe SSE statuses.
- [x] `app/agent_tools.py`: search via explicitly local SearXNG JSON API, allowlisted HTTPS `read_page`, optional Playwright read-only page snapshot, AST calculator, note proposal.
- [x] `app/agent_api.py`: `/v1/agent/status`, `/v1/agent/stream`, `/v1/agent/actions/{uuid}/approve`.
- [x] Explicit action approval: a generated note **cannot** save itself. One-time, expiring approval token; UUID-only filename inside `data/agent_notes/`.
- [x] `frontend/src/app/agents/page.tsx`: standalone research panel with timeline, sources and approve/reject controls; link added to existing chat sidebar; same-origin proxy routes.
- [x] Local `infra/searxng/compose.yaml` and JSON-enabled `settings.yml` for Docker Desktop; opt-in domains and URLs configured in `.env`.
- [x] Regression tests added: URL validation, DNS private-IP refusal, SearXNG filter, safe calculator, approval lifecycle, model tool-call loop, API mock.
- [ ] **LIVE VERIFICATION PENDING:** `npm install`, `npm run typecheck`, `npm run build`, Meta tool-calling, SearXNG online engine connectivity, Playwright Windows Chromium, note proposal user approval, regression of chat/voice/vision.

## Security and operational constraints

1. Keep `127.0.0.1:8000`, `127.0.0.1:3000`, `127.0.0.1:8080` bound locally; no public hosting or multi-user auth yet.
2. **Only Phase 5 read-only external tools run automatically.** `propose_note` only stages an action; browser approval is required to save any note. No arbitrary code execution, arbitrary disk access, shell, accounts, email, calendar or purchases.
3. `AGENT_ALLOWED_DOMAINS` is an explicit operator-controlled allowlist. Browser/page tools use HTTPS only, refuse redirects and check public DNS; network-level SSRF protection is still needed before production. No external websites are trusted as instructions.
4. Tool outputs may be long and untrusted; caps apply. SearXNG is optional and separately configured, free local developer deployment, but engine search quality varies.
5. Research agent has separate server-managed model response history only within each run; no persistent cross-task memory or LangGraph checkpointing (Phase 6). Approval tokens and usage estimates are RAM-only; approval restart loses tokens.
6. Research agent uses nonstreaming Meta requests per planning round but streams tool/status progress to UI. Multi-step model calls can be slower and cost more; no hard budget cap yet.
7. Old FastAPI endpoints and text/voice/vision behavior must remain backward compatible. The Windows jiter restriction means no OpenAI SDK native dependency; use HTTPX.
8. User-provided data and model responses may be stored by Meta (`store: true`). Do not use private material or copy keys into logs. Private `.env`, `data/` and downloaded Kokoro files are intentionally excluded from ZIPs.

## Windows test commands

```powershell
# from inner muse-nova project directory, use a new folder and copy working .env/model assets
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-agent.txt
python -m pytest -q
# optional browser dependency:
python -m playwright install chromium
# local search in a separate terminal with Docker Desktop:
cd infra\searxng
docker compose up -d
cd ..\..
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# second terminal, from frontend:
npm install
npm run test:stream
npm run typecheck
npm run build
npm run dev
# root, free diagnosis:
powershell -ExecutionPolicy Bypass -File .\scripts\test-phase5.ps1
# opt-in billable agent test:
powershell -ExecutionPolicy Bypass -File .\scripts\test-phase5.ps1 -Live
```

## Next milestone

**Phase 6:** durable PostgreSQL/pgvector memory, LangGraph checkpoints, retrieval-quality evaluation and memory-management controls. Future: Phase 7 AMD MI300X + local Muse Glimmer, Phase 8 hardened auth/OAuth/spending limits, Phase 9 mature AgentOS.

## Technical references

- Meta: https://dev.meta.ai/docs/tool-calling and https://dev.meta.ai/docs/protocols/responses
- SearXNG: https://docs.searxng.org/dev/search_api.html
- Phase 5 design: `docs/PHASE5_AUTONOMOUS_TOOLS.md`

## Phase 5.0.1 connectivity diagnostics (2026-10-30)

- User reported `META_NETWORK_ERROR` from Phase 5 real-time voice. The `live_voice.py` Meta WebSocket URL and original relay remained unchanged from previously working v0.5.1, so root cause is **not confirmed**.
- Corrected `scripts/diagnose-realtime.py`, which previously incorrectly refused Phase 5 backend `0.5.0` because it expected `0.3.3`.
- Added no-credit DNS and verified direct TLS checks; configured proxy presence (not values) is reported. Live handshake remains opt-in and uses no microphone audio.
- Added safe error categories `META_DNS_ERROR`, `META_TLS_ERROR`, and `META_PROXY_ERROR`, preserving generic `META_NETWORK_ERROR` fallback.
- Updated frontend diagnostic message and added `docs/REALTIME_CONNECTION_TROUBLESHOOTING.md`.
- **Live user verification is pending**. Do not mark the underlying connection resolved without the Windows diagnostic and live test.

## Phase 6.5 — Knowledge Hub / RAG as a Service (v1.1.0 candidate)

- Added Docker-independent SQLite FTS5 knowledge collections, PDF/DOCX/TXT/MD/CSV indexing, versioning and deletion.
- Added optional true neural embeddings and hybrid RRF retrieval (separate install and opt-in; **not** tested live on Windows).
- Added FastAPI `/v1/rag/*`, Next.js `/knowledge`, same-origin proxy, and consent-gated grounded Muse answers.
- Explicitly separated user-uploaded knowledge from the Phase 6 personal-memory store.
- Uploads made through Knowledge Hub are indexed; chat attachments are **not silently indexed**.
- Existing Phase 1–6 code and UI preserved. `MEMORY_ENABLED=false` can be used while Docker Desktop/Postgres are unavailable; this does not disable RAGaaS.
- Working patterns: keyword (default), semantic and hybrid (only with optional neural model), auto routing. Multi-query, parent-child, agentic, graph and multimodal RAG are documented roadmap items, not shipped implementations.
- Security: local single-user only, size limits, no raw file preservation, source-content prompt injection handling, no external-model transfer without consent, delete collection/document, no auth/multitenancy yet.
- Verification: Python regression suite and local RAG API tests. Next.js full build, neural embedding runtime, Windows smoke, and Meta answer request remain unverified.
- See `docs/RAGAAS_PHASE6_5.md` and `docs/diagrams/ragaas.mmd`.


## RAGaaS 1.1.1 — Documents 404 + browser dialog fix (2026-11-01)

- User reported GET/POST `/api/rag/collections/{uuid}/documents` returning 404 and browser throwing `prompt() is not supported` on collection deletion.
- Corrected Knowledge Hub collection deletion to use a visible, typed `DELETE_COLLECTION` confirmation. Document deletion also uses in-page approval rather than native browser dialogs.
- RAG SQLite relative file locations are now resolved against the project root (`<project>/data/rag.sqlite3`) regardless of the Uvicorn shell working directory. Absolute paths in `RAG_SQLITE_PATH` remain supported. **Do not delete or reset an existing SQLite database** when troubleshooting.
- RAG HTTP errors now distinguish a missing collection in the active database from a missing API route / older backend. Stale selected collections clear without repeated requests, and a Refresh collections button is available.
- Added `scripts/diagnose-rag-404.ps1 -CollectionId <uuid>` (read-only, no API credits) to compare direct FastAPI responses with Next.js proxy responses and print the active SQLite path.
- All legacy Phase 1–6.5 modules remain present. Offline tests confirm route registration, missing-collection response, stable database path and deletion UI structure. Live Windows restart and uploads require user validation.
