# MUSE Nova v1.0.0 — Persistent Intelligence

**Phase 6 adds PostgreSQL/pgvector memory and LangGraph durable checkpoints while preserving Phases 1–5 and Muse Studio.**

Start here: [Phase 6 setup and architecture](docs/PHASE6_MEMORY_LANGGRAPH.md).

## New in this release

- `/memory` for explicit saved knowledge, search, conversation restore, and safe deletion
- `MEMORY_ENABLED=true` to switch text, multimodal and research workflows to durable LangGraph checkpoints
- Local PostgreSQL+pgvector via `infra/memory/compose.yaml`
- Existing voice, vision, Muse Studio and agent tools remain available

---

**UI update v0.9.4:** Muse Studio now has consistent dark/light theming, a sortable model catalog and a comparison result summary. Open `/studio`, `/studio/catalog` and `/studio/compare`. Setup: `docs/STUDIO_UI_REFRESH_v0.9.4.md`.

**Current release:** MUSE Nova v0.9.3 — Muse Studio HTTP 400 diagnostics and model-aware reasoning validation. See [release notes](docs/STUDIO_HTTP_400_FIX_v0.9.3.md).

# MUSE Nova v0.9.2 — Muse Studio with Model Catalog & Comparison Lab

**NEW:** Navigate to `http://127.0.0.1:3000/studio` to browse the Muse model catalog, test system prompts, compare two hosted reasoning models, generate/edit images, transcribe WAV audio, and try SAM segmentation. Existing chat, voice, document and autonomous agent features are retained.

**Important:** "all models" refers to the complete model lineup **in the catalog**. Only hosted models returned by your account's Meta `/v1/models` are listed as available. Open-weight Glimmer/Spark Open need separately deployed inference services; Muse Wonder Full is not available on the Model API. All live requests may consume credits. No UI credit balance or hard spend limit is implemented.

Full guide: `docs/MUSE_STUDIO.md`. Windows development: start FastAPI on 8000 and Next.js on 3000, then open `/studio`.

---

> **Phase 5.0.1 connectivity update (v0.8.1):** See `docs/REALTIME_CONNECTION_TROUBLESHOOTING.md` for safe real-time voice diagnostics. The WebSocket connectivity error still requires a local live test.

# MUSE Nova v0.8.1 — Phase 5 Research Agent + Voice Connectivity Diagnostics

**New:** Open `http://127.0.0.1:3000/studio/catalog` for the searchable model catalog and `http://127.0.0.1:3000/studio/compare` for side-by-side comparison. See `docs/MUSE_STUDIO_CATALOG_COMPARISON.md`.

**One project: Phases 1–4 preserved and Phase 5 research tools added.** Independent developer prototype using Meta's Muse models; not a Meta product. Designed for **Windows 11, PowerShell, VS Code, local FastAPI + Next.js**. Keep the working v0.5.1/v0.6.0 folder intact; extract this ZIP into a separate location.

## What is included

| Capability | Phase | Implementation |
|---|---|---|
| JPEG, PNG, WebP uploads + multi-image questions | 4.1 | Muse Spark `input_image` in existing SSE session |
| PDF analysis, chart/figure interpretation, page-aware questions | 4.2 | Inline Muse Spark `input_file`, PDF text + page images handled by Meta |
| DOCX, TXT, Markdown, CSV analysis | 4.2 | Bounded local plaintext extraction, passed in prompt context |
| Compare up to two documents and three images in a single turn | 4.2 | One unified multimodal chat stream |
| Shared-screen or window snapshots | 4.3 | Explicit browser permission, manually attach a frame |
| Optional live voice + current screen | 4.3 | One frame per finalized voice turn **only when explicitly opted in** |
| Original text chat, push-to-talk, live voice, Kokoro TTS | Regression | Preserved from v0.5.1 |

**Verification:** Offline Python tests **47 passed**; Node frontend tests **16 passed**; TypeScript source syntax check passed. **Full npm install/typecheck/production build and live Meta vision/PDF/screen-share runs still require verification on your Windows workstation.** Do not treat these implementations as user-verified until you test them.

## Setup on Windows (PowerShell)

Unzip, then open the extracted **inner `muse-nova` directory** in VS Code. Copy your private `.env` from the previously working release (do not copy it into GitHub or share it).

### Terminal 1 — Python backend

```powershell
cd "$HOME\Downloads\muse-nova-phase4-complete\muse-nova"   # adjust if extracted elsewhere

# Copy from your previously verified project, adjusting its path:
Copy-Item "$HOME\Downloads\muse-nova-phase32\muse-nova\.env" .env

py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-voice.txt
python -m pytest -q
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If you already have Kokoro ONNX and voice assets in another installation, copy those assets into the corresponding paths expected by `app/voice.py`. Avoid redownloading the model. For a new installation, run `powershell -ExecutionPolicy Bypass -File .\scripts\setup-kokoro.ps1` before launching the voice service.

Backend health: `http://127.0.0.1:8000/health` should show version **0.5.0**.

### Terminal 2 — Dashboard

```powershell
cd "$HOME\Downloads\muse-nova-phase4-complete\muse-nova\frontend"
Copy-Item .env.local.example .env.local
npm install
npm run test:stream
npm run typecheck
npm run build
npm run dev
```

Open **http://127.0.0.1:3000**. Only one backend and frontend should be running at a time. Keep `MODEL_API_KEY` in **backend `.env`**; no Muse key in frontend `.env.local`.

## Phase 4 acceptance flow

1. **Image chat:** attach `PNG/JPEG/WebP`, ask “What is shown?”, then a follow-up in the same chat.
2. **PDF understanding:** attach `samples/example_report.pdf`, ask “What are the March tasks? Is there a chart on page 2?” Check the model's page citation against the file.
3. **Documents:** attach `samples/example_notes.txt` and the sample PDF, ask for a comparison with source distinctions. Try your own DOCX (ordinary text; DOCX embedded graphics are not automatically analyzed).
4. **Screen capture:** click **Share a screen or window**, grant the browser's display permission, then **Attach screenshot**. Ask about the captured frame and click **Send**. Stop screen sharing. Starting share alone does not upload any pixel data to Meta.
5. **Voice + vision:** while explicitly sharing the screen, check **Include one screen frame with each live voice question**. Start live voice and ask “What is on this screen?”; allow the speech turn to finish, and expect a multimodal question and spoken answer. Uncheck and stop screen sharing afterward.
6. **Regression:** text chat, conversation follow-up, push-to-talk, live voice, interruptions, Kokoro playback, stop-generation, usage estimates.

### Local/online smoke tests

```powershell
# From the project root, while FastAPI is running
powershell -ExecutionPolicy Bypass -File .\scripts\test-phase4.ps1
# Optional, one billable Meta request using synthetic sample PDF
powershell -ExecutionPolicy Bypass -File .\scripts\test-phase4.ps1 -Live
```

## Limits and privacy

- Up to **3 images**, each **4 MiB**, and **2 documents**, each **12 MiB**, per message. PDF max **100 pages** in this prototype.
- Meta's documented PDF processing uses page text from **the first 100 pages** and visual page images from **the first 50 pages**. Charts on later pages cannot be reliably analyzed visually. Check page numbers and numerical claims yourself.
- PDFs are passed to Meta **inline**, not stored by this application using the Meta Files API. DOCX/TXT/MD/CSV content is extracted and sent as text. Session conversation state is still kept upstream by Meta (`previous_response_id`).
- Screen sharing requires browser permission. **Auto-frame upload is off by default** and is enabled only by the adjacent live-voice checkbox. A frame may be sent when a recognized speech turn finishes. Click **Stop screen sharing** to revoke the live capture.
- The browser stores the text transcript and **attachment filenames only** in localStorage, not raw images, PDFs or screen frames. Multipart uploads may spool temporarily to local disk as part of FastAPI request handling. Do **not** upload private data to this unauthenticated development build.
- The running model can make mistakes and hallucinate page references. Document text and screenshots are treated as untrusted input; they must not be used to execute instructions.
- This is a **localhost-only, single-user prototype**, not an authenticated service. Never expose port 8000/3000 publicly. The API usage estimates do not equal the actual $150 credit balance and do not impose a hard spending cap.
- Windows Application Control previously blocked the OpenAI SDK's `jiter`; the existing pure-HTTPX adapter remains in place. `pypdf` for PDF validation is pure Python.

## Where to go next

- [Phase 4 technical spec](docs/PHASE4_COMPLETE.md)
- [Project status, tests, decisions](AGENTS.md)
- [Updated roadmap](docs/ROADMAP.md)
- [Meta file handling reference](https://dev.meta.ai/docs/file-handling)

**Phase 5 is now included:** see the setup section below. Phase 6 is persistent memory.


## If Muse reports `output limit reached`
Set `MAX_OUTPUT_TOKENS=4096` and `MUSE_REASONING_EFFORT=minimal` in your private `.env`, restart FastAPI, and run `powershell -ExecutionPolicy Bypass -File .\scripts\check-output-limit.ps1` to verify the **effective** budget. See `docs/OUTPUT_TOKEN_FIX_v0.7.2.md`.

---

## Phase 5: Autonomous research and approved tools (v0.8.0)

The integrated **Research Agent** is at `http://127.0.0.1:3000/agents`, linked in the main sidebar. It uses Muse Spark's real function-calling loop through HTTPX, local SearXNG, allowlisted HTTPS page reading, optional read-only Playwright, safe arithmetic, and **approval-gated local Markdown note saving**. The model never receives unrestricted filesystem, shell, email or purchasing privileges.

**New dependencies** (from the project root):

```powershell
python -m pip install -r requirements-agent.txt
# Optional for browser_page:
python -m playwright install chromium
```

**Local search** (requires Docker Desktop and explicit `.env` configuration):

```powershell
cd infra\searxng
docker compose up -d
cd ..\..
```

Copy the two Phase 5 variables from `.env.example` into your existing private `.env` and restart FastAPI. Start the frontend normally. Free diagnostic: `powershell -ExecutionPolicy Bypass -File .\scripts\test-phase5.ps1`. A billable agent test is available with `-Live`.

**Complete instructions, security limits and acceptance tests:** [docs/PHASE5_AUTONOMOUS_TOOLS.md](docs/PHASE5_AUTONOMOUS_TOOLS.md). **Project source state:** [AGENTS.md](AGENTS.md).

Phase 5 has passed offline tests but is **not user-verified on Windows**. Phase 1–3 remain user-verified. Phase 4 document inference is user-reported working after the v0.7.2 token fix; image and screen workflows still need explicit user confirmation.

### Phase 5 regression (offline)

`python -m pytest -q` passed **62 tests** and `npm run test:stream` passed **21 tests** in the build environment. The changed TypeScript/TSX source passed syntax-transpilation checks. These tests use mocked Muse tool calls; they do **not** prove Meta credentials, Docker search, Playwright browser or the Next.js production build works on your PC.

### Knowledge Hub / RAG as a Service (v1.1.0)

Open `/knowledge` in the Next.js dashboard to create local knowledge collections, upload documents, preview retrieved sources and optionally ask Muse Spark grounded questions. This feature uses SQLite FTS5 by default and runs without Docker. See [the detailed guide](docs/RAGAAS_PHASE6_5.md). Neural semantic/hybrid search is optional and requires `requirements-rag-embeddings.txt`; it is not emulated when disabled. Uploading to an ordinary chat does not automatically index private data.


### Knowledge Hub v1.1.1 maintenance fix

The Knowledge Hub now uses an in-page delete confirmation, stabilizes relative SQLite paths to the project directory, and provides `scripts/diagnose-rag-404.ps1` for distinguishing stale collection IDs from old backend or proxy routes. Never remove the existing `data/rag.sqlite3` file to troubleshoot a 404.
