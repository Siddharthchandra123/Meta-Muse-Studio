# Muse Studio — AI Studio-inspired model workspace (v0.9.0)

**Status:** implemented and verified with mocked Meta responses. Real account-specific permissions and media calls require testing on Windows. Independent app — not affiliated with or endorsed by Google or Meta.

## What it does

The new **`/studio`** page is an experiment workbench, designed around the core pattern of an AI model studio: model catalog → prompt editor → run controls → results/usage → compare/export. It is separate from the main MUSE Nova conversational assistant.

### Model catalog

- **API text models:** `muse-wonder-1.0`, `muse-spark-1.3`, `muse-spark-1.2`, `muse-spark-1.1`.
- **Contributor modes:** `muse-spark-1.3-contributor` and `muse-spark-1.2-contributor`, visibly marked. Explicit confirmation required before sending any requests (Contributor requests may be used to improve Meta models).
- **Image model:** `muse-image-1.0`: image generation and one-off editing.
- **Speech model:** `muse-voice-transcribe-1.0`: offline file transcription using the existing verified audio route; live realtime voice still lives in main chat.
- **Segmentation:** `sam-3.1`: image + short object noun phrase → **raw** segmentation output. It does not yet render pixel masks/overlays; model response parsing/visualization is a separate future milestone.
- **Open-weight:** Muse Glimmer 30B, Muse Spark Open: shown as *self-hosted, not connected*; Meta API credits do not run them.
- **Muse Wonder Full:** shown as Muse Code subscription-only, not runnable through the pay-as-you-go Model API.

GET `/v1/studio/models` contacts Meta's `GET /v1/models` using the *server-side* `MODEL_API_KEY`. Results are cached for one minute. Each catalog entry has a status: `listed`, `not-listed`, `unverified`, `requires-local-deployment`, or `muse-code-only`. **Listed** means Meta returned the model ID for the account, not a guarantee that a specific request will succeed. A failed catalog lookup is shown as unverified; no availability claims are invented.

### Studio capabilities

| Capability | Endpoint | Notes |
|---|---|---|
| Catalog | `GET /v1/studio/models` | Uses GET `/v1/models` (no generation bill) |
| Text playground, streaming | `POST /v1/studio/run/stream` | Supported hosted reasoning IDs, SSE output, system instructions, reasoning effort, output tokens, optional image, `previous_response_id` |
| Compare two models | Two independent calls to text stream | User-triggered; **two billable requests**; no automatic comparison |
| Muse Image generate | `POST /v1/studio/image/generate` | One image; base64, output PNG, selectable aspect ratio |
| Muse Image edit | `POST /v1/studio/image/edit` | Multipart validated image + instruction |
| Voice transcription | Existing `POST /v1/voice/transcribe` | Requires WAV PCM16 mono, 16/24kHz, <= 90s |
| SAM segmentation | `POST /v1/studio/run/stream` with `sam-3.1` | Requires image; raw output, no mask overlay yet |

## Local security and privacy boundaries

1. **Never place `MODEL_API_KEY` in Next.js `.env.local` or in the browser.** It exists only in the FastAPI `.env` file.
2. FastAPI binds to `127.0.0.1:8000`, Next.js to `127.0.0.1:3000`. There is **no authentication, quota enforcement, true credit-balance API, hard spend cap or production security model**. Do not expose publicly.
3. Uses HTTPX instead of the OpenAI SDK to avoid native `jiter` policies on some Windows workstations.
4. No arbitrary provider URL from browser; this Studio requires `https://api.meta.ai/v1`. No arbitrary model IDs, shell, filesystem tools or remote browser actions.
5. Images and WAV files sent to Meta via a user-initiated action. Image attachments are restricted to valid JPEG, PNG or WebP <=4 MiB. The frontend does not persist uploaded files. Exported JSON is user-triggered and contains the text session.
6. Contributor modes carry an explicit acknowledgment. For private material, use Standard models.
7. Session state is browser memory while the page is open and Meta response IDs when chaining; no server-side conversation database yet.
8. Error responses are sanitized, with HTTP status codes but no raw upstream response content or secrets in browser.
9. Running a model or producing an image is billable. Compare mode sends **two requests**. The usage panel shows provider-reported tokens, **not** remaining $150 credit balance. Image/audio/SAM have different billing units.

## Windows PowerShell setup

Unzip into a **new** folder. Copy the private working `.env` from v0.8.1; keep Kokoro model files as before. From the inner `muse-nova` directory:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-agent.txt
python -m pytest -q
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

From a second PowerShell terminal:

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
npm run test:stream
npm run typecheck
npm run build
npm run dev
```

Navigate to `http://127.0.0.1:3000/studio`. If the catalog says `unverified`, check Meta network access and the backend `.env`. To test without spending credits:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/v1/studio/models | ConvertTo-Json -Depth 5
```

## Acceptance tests

- Studio sidebar displays the catalog and Meta availability, with self-hosted models not runnable.
- Spark 1.3 responds to a text prompt and reports usage.
- Switch to Wonder; model session resets; model is not silently kept at Spark.
- Compare Spark and Wonder (explicitly launches two chargeable calls).
- Generate one Muse Image picture and download it; optionally edit an uploaded image.
- Transcribe a user-selected PCM WAV.
- Run SAM with a JPEG/PNG and a short object noun phrase; raw segmentation response appears.
- Contributor models require a privacy acknowledgment.
- Existing chat, voice, vision, document and agents pages continue functioning.

**Offline validation at release:** 74 backend tests and 24 frontend tests passed, TypeScript files parsed. Windows Next.js `npm install/typecheck/build` and live Meta image/segmentation/voice requests **remain user validation steps**; this execution environment cannot access the npm registry.

## Official references

- https://dev.meta.ai/docs/models
- https://dev.meta.ai/docs/api-reference/models/list-models
- https://dev.meta.ai/docs/image-generation
- https://dev.meta.ai/docs/media-segmentation
- https://dev.meta.ai/docs/overview
