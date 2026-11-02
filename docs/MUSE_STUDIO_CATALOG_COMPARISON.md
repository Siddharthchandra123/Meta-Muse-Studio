# MUSE Studio Model Catalog & Comparison Lab (v0.9.2)

**Purpose:** Make MUSE Nova's Studio model exploration more like a developer model studio, without replacing the working assistant or altering its Meta API credentials.

## Screens

- `/studio/catalog`: searchable model cards, family and access-status filters, capability descriptions, details, choose two compatible models for comparison.
- `/studio/compare`: choose two distinct hosted reasoning models, enter one common prompt and system instructions, tune effort and output budget, independently stream each result, see input/output tokens and elapsed wall time, cancel and export results.
- `/studio`: existing chat/image/speech/segmentation playground, with links to both new screens.

## Architecture

`Next.js pages` → `/api/studio/models` & `/api/studio/run/stream` same-origin proxy → FastAPI `/v1/studio/models` & `/v1/studio/run/stream` → Meta Model API.

- The backend key remains only in `.env`; the frontend receives no key.
- The live catalog uses Meta `GET /v1/models` and caches responses for 60 seconds; reload to recheck.
- Known hosted models appear with documented capability families. Unknown model IDs returned by Meta appear in **Other API listings**, are marked **listed**, but cannot be run until an adapter is implemented.
- Listed models are **not** guaranteed to work on a given key, account, region, endpoint or quota. If listing fails, known hosted entries are marked **unverified**.
- Open-weight models appear for discovery but **no local inference** is automatically configured. Muse Wonder Full remains Muse Code-only.
- Only curated, non-Contributor Meta-hosted reasoning models are selectable for comparison; Contributor mode is excluded to avoid accidentally accepting different data-use terms.
- Two comparison requests are independently streamed with the same request arguments. One failure remains visible without hiding the other.
- Elapsed wall time includes network and browser transfer; it is **not** pure model throughput. Token usage comes from Meta, when returned.
- Every comparison launches **two billable** requests. No background requests or hard credit caps are implemented. Remaining credit balance is not available through these screens.

## Windows PowerShell

From extracted inner `muse-nova` folder:

```powershell
# Use your pre-existing working .env; never include keys in a ZIP.
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-agent.txt
python -m pytest -q
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Second terminal:

```powershell
cd frontend
npm install
npm run test:stream
npm run typecheck
npm run build
npm run dev
```

Open `http://127.0.0.1:3000/studio/catalog` and `http://127.0.0.1:3000/studio/compare`.

Run the free catalog diagnostic from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-studio-catalog-compare.ps1
```

Use `-Live` only when ready to spend credits on two requests.

## Acceptance tests

- Catalog loads and shows model family, availability and detail panels; filters and search work.
- Models not listed are not treated as runnable. Unknown IDs are displayed without an execution adapter.
- Select two different hosted reasoning models, then open comparison.
- Both models stream independently, each shows a final response and provider-reported usage.
- Deliberately select an unavailable model and check disabled Run behavior.
- Stop a comparison midway; both requests cancel.
- Export a completed comparison to JSON; no key appears in the export.
- Verify existing `/`, `/agents`, `/studio`, voice and documents still work.

**Verification boundary:** Python and Node offline tests and TS/TSX syntax parse passed. Full Next.js dependency build and real Meta API interactions remain unverified until run on Windows.

## References

- https://dev.meta.ai/docs/models
- https://dev.meta.ai/docs/api-reference/models/list-models
- https://dev.meta.ai/docs/protocols/responses
