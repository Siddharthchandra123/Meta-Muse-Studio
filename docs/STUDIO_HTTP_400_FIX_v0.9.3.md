# Muse Studio v0.9.3: model HTTP 400 diagnostics

## What changed

The model playground previously reported only `Studio model failed: Meta API HTTP 400` and offered `max` reasoning to models that reject it. This release addresses those two problems:

- **Model-specific reasoning validation:** `max` is selectable only for `muse-spark-1.3` (Standard) and `muse-wonder-1.0`. The backend rejects unsupported combinations with HTTP 422 before sending a billable request. Older Spark versions and Contributor modes remain available with `minimal` through `xhigh`.
- **Safe API error hints:** Studio reports the upstream HTTP status and a restricted parameter name, then offers advice based on the parameter type (reasoning, output tokens, model ID, conversation, context, sampling). The raw Meta error message is not forwarded, because it may echo the prompt or other user data.
- **Direct diagnostic:** `python .\scripts\diagnose-studio-http.py --model muse-spark-1.3` makes a *single billable request* independently of Studio, printing HTTP status, error type/parameter/code and usage (if available). It never prints the API key or raw prompt.
- **Comparison UI:** If either chosen model does not support `max`, the shared setting changes to `xhigh`, preventing an unsupported comparison.

## Windows verification

1. Keep your prior working `.env` (never upload or commit it) and copy it to the new project root.
2. From the new project root, run `python -m pytest -q` and start `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
3. From `frontend`, run `npm install`, `npm run typecheck`, `npm run build`, then `npm run dev`.
4. Open `/studio/compare` and choose Muse Spark 1.3 versus Muse Wonder. Use `minimal`, 512 output tokens and a short prompt first.
5. If a 400 persists, run the direct diagnostic for the model that failed. Compare its status to the Studio error. Share only HTTP status, error type, safe parameter name and code; **not** API keys, whole request bodies or raw upstream messages.

## Known limitations

- This cannot prove the cause of a past HTTP 400 from the generic message alone. The direct diagnostic and revised error hints narrow it down.
- Live Meta account permissions are not testable offline. Individual model entitlements, plan restrictions and model-specific limits may differ.
- The runtime uses a local, single-user development backend. No durable account balances, cost caps or production auth are included.
- The full Next.js dependency install and production build still require verification in the user's Windows environment.

## Offline checks

82 Python tests, 30 Node frontend tests, 32 TypeScript/TSX source files parsed without syntax errors. No live Meta calls were made for release validation.
