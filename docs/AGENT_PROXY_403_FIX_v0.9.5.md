# MUSE Nova v0.9.5 — Agent proxy origin fix

## Symptom

`POST /api/agent/stream 403` reported by the Next.js dev server after the v0.9.4 Studio refresh.

## Root cause / scope

The `agent/stream` and note approval routes required the literal browser `Origin` header to match `new URL(request.url).origin`. A browser using `localhost` and a Next.js request URL normalized to `127.0.0.1` (or vice versa) would be denied, even on the same local port. Other upstream 403 causes are possible, but FastAPI's default agent route has no explicit 403.

## Fix

- Shared helper accepts loopback alias hostnames only with HTTP and an **identical port**; all other origins remain rejected.
- Both agent streaming and note-approval routes use the same policy.
- Research dashboard displays an actionable safe error detail if the proxy rejects a request.
- A free diagnostic submits an invalid two-character prompt, so accepted requests stop at HTTP 422 without contacting Meta. A true foreign Origin must return HTTP 403.

## Windows test

```powershell
# In the project root, after starting Next.js on 127.0.0.1:3000
powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-agent-403.ps1
# In frontend:
npm run test:stream
npm run typecheck
npm run build
```

Expected diagnostic: 422 for same-host and loopback-alias tests; 403 for foreign origin. Then retry `/agents`. The actual Muse tool loop and local SearXNG still require separate runtime verification.

No API keys, unsafe wildcard CORS or unauthenticated public hosting changes were introduced.
