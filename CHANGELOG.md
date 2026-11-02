## v0.9.4 — Muse Studio UI refresh — 2026-10-31
- Unified responsive midnight design for Playground, Catalog and Compare with a persistent light theme option.
- Added catalog sorting, grid/list layouts, sticky comparison selection dock, paired result summary, accessible focus and reduced motion.
- No backend/API protocol changes; live Windows build/visual verification pending.

## v0.9.1 — TypeScript strict-mode fix (2026-10-31)

- Fix `message` closure narrowing in multimodal streaming API route (TS18047/TS2339).
- Keep all MUSE Nova v0.9.0 Muse Studio features unchanged.
- Frontend version 0.9.1; Python backend unchanged.

## v0.9.0 — Muse Studio (2026-10-31)

- Added `/studio` model catalog with live Meta `GET /models` availability, grouped models and safe availability labels.
- Added configurable text/image chat streaming, two-model compare, image generation/editing, WAV transcription and SAM raw segmentation.
- Added backend endpoints `/v1/studio/*`, Next.js same-origin routes and Studio documentation.
- Catalog includes open-weight and Muse Code-only models as non-runnable; Contributor models require explicit acknowledgment.
- 74 backend offline tests, 21 existing Node tests, TypeScript syntax parsed. **Live Meta/Windows integration and npm build remain unverified.**

# MUSE Nova Changelog

## v0.6.0 — Phase 4.1 Image Understanding — 2026-10-30
- Added 1–3 JPEG/PNG/WebP image upload via image picker, drag/drop and clipboard paste.
- Added thumbnail preview, remove action and filenames in transcript; raw image data excluded from local persisted history.
- Added Next.js multipart proxy and FastAPI vision SSE endpoint; used Meta Muse Spark Responses API typed `input_image` blocks.
- Preserved conversation response IDs so text follow-ups after an image can refer to that earlier turn.
- Added image bounds and first-byte type checks; no extra native-image dependencies (important for Windows Application Control environments).
- Added Windows image smoke script and Phase 4.1 architecture, privacy and release documentation.
- Regression: 42 offline Python tests; 13 Node frontend/audio tests; changed TypeScript files passed syntax transpilation. **Live Windows image test and full Next.js typecheck/build pending**.

## v0.5.1 — Phase 3.2 WebSocket hotfix — 2026-10-30
- Improved realtime voice WebSocket diagnostics and handling; user verified all Phase 3.2 functions.

## v0.5.0 / v0.4.0 / v0.3.1 / v0.2.x
- Continuous realtime voice / push-to-talk Kokoro voice / streaming Next.js dashboard / Muse text API foundation.

## v0.7.0 — Phase 4 complete source bundle (2026-10-30)
- Unified mixed PDF, DOCX, TXT, Markdown, CSV, JPEG, PNG, WebP upload with existing SSE chat context.
- Inline PDF parsing by Muse Spark's documented Responses API `input_file`; no Meta Files API storage.
- Explicit one-frame screen capture and optional live-voice one-frame context (off by default).
- Added bounded document parser, tests, smoke script, synthetic sample PDF, phase technical specification, revised progress log.
- **Live Windows / Meta verification pending.**

## v0.7.1 — Phase 4 multipart diagnostics and stale-session recovery
- Readable FastAPI 422 field/attachment errors; safe one-time retry for expired in-memory sessions on both text and multimodal streaming.
- User-visible context reset warning; route diagnostic; no changes to working voice/backend.

## v0.7.2 — Output-token budget fix
- Removed incorrect 2048 clamp (now 8192 cap) so `.env` values like 4096 take effect.
- Added minimal reasoning default for lower latency/cost, visible remediation guidance, tests and diagnostic script.
- Backend health 0.4.4; frontend 0.7.2; preserved voice and vision endpoints.

## v0.8.0 — Phase 5 research agent MVP (2026-10-30)
- Added bounded Muse Responses API function-calling tool loop and SSE agent status.
- Added local SearXNG JSON search, operator-approved HTTPS page reading and optional read-only Playwright.
- Added safe calculator, approval-only Markdown note proposals and one-time approve/reject endpoint.
- Added Next.js Research Agent workspace and same-origin local proxies.
- Added `requirements-agent.txt`, Docker SearXNG local compose, Windows test script, security/architecture documentation, new offline tests.
- Preserved existing Phase 1–4 modules and backend request contracts. Live Windows validation pending.

## v1.0.0 — Phase 6 Persistent Intelligence (2026-10-31)

- Integrated opt-in LangGraph + Postgres checkpointed conversation graph into existing text, image and document streams; durable research-workflow graph wraps Phase 5 tool loop.
- Introduced memory API and pgvector-backed, explicit saved knowledge with delete/search/category controls.
- Added Memory Center (`/memory`), durable thread browser and resume-in-chat control, and a local PostgreSQL Docker Compose service.
- Kept Meta API keys and uploaded media bytes out of LangGraph checkpoint state. Saved memory IDs, not memory content, are checkpointed.
- Updated AGENTS.md. Existing Phase 1–5 routes continue to work when memory is disabled.
- Offline tests added; production npm build, live Meta API / PostgreSQL integration remain to be verified on Windows.

## v1.1.0 — RAGaaS / Knowledge Hub (Phase 6.5 development)
- Docker-free local collections and document indexing, optional neural/hybrid retrieval, consent-controlled answers, new `/knowledge` UI, docs and tests.
- No change to existing Muse API key configuration. Existing memory/agent services unchanged.
