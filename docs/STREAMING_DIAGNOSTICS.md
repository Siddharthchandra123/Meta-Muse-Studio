# Streaming troubleshooting — Phase 2 hotfix v0.3.1

## Symptom

Next.js renders a user message and a failed assistant bubble. The old UI showed the uninformative **No response received** fallback. This **does not** establish whether the failure is Meta, FastAPI, or the Next.js proxy.

## First determine which hop fails

Keep FastAPI (`127.0.0.1:8000`) and Next.js (`127.0.0.1:3000`) running in separate Windows PowerShell terminals. From the **project root**:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-stream.ps1 -Target Backend
```

If backend succeeded, verify the proxy:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-stream.ps1 -Target Frontend
```

Each stream check makes one billable model request, even if it fails after reaching Meta. The script never prints the API key. The initial health checks are free.

- Backend fails with a `Meta API HTTP ...` or `max_output_tokens` error: inspect FastAPI terminal logs and backend `.env`. The direct non-streaming test can work even when streaming fails.
- Backend passes and frontend fails: check `frontend/.env.local` (`MUSE_BACKEND_URL=http://127.0.0.1:8000`), restart `npm run dev`, check its terminal output, and examine browser Network > `POST /api/chat/stream`.
- Both pass but the dashboard bubble fails: capture the displayed error detail and browser DevTools Console. Do not share API keys or request authorization headers.
- `404` for an older chat: backend session state is in RAM; after FastAPI restart, open **New conversation**. Browser-local chat messages don't restore the backend session.

## Fixes included

- Backend sends `answer` inside terminal `done` event; UI uses it to recover when deltas are missing.
- Frontend displays the actual safe error reason in the failed reply bubble instead of **No response received**.
- Backend distinguishes a model token-budget incomplete event and safe upstream HTTP status codes.
- Frontend flushes final UTF-8 bytes before parsing the last SSE frame.
- Version labels: backend `0.2.2`, dashboard `0.3.1`.

## For a token-budget failure only

Update the backend project-root `.env` (not `frontend/.env.local`) to:

```dotenv
MAX_OUTPUT_TOKENS=1024
MUSE_REASONING_EFFORT=minimal
```

Restart FastAPI. This increases the maximum permitted output (including reasoning) and could increase billable output usage. Not all failures are token-limit errors.

## Security

Never paste `.env`, authorization headers, API keys, or full private user messages into bug reports. This local prototype remains unauthenticated and is not production-ready.
