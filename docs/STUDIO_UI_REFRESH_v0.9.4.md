# MUSE Nova Studio UI refresh — v0.9.4

This is a presentation/UI upgrade based on v0.9.3. The FastAPI API, Meta authentication, tool permissions, model routing, real-time voice, vision and document flows are unchanged.

## What changed

- **Unified look:** Studio Playground (`/studio`), Model Catalog (`/studio/catalog`), and Compare Lab (`/studio/compare`) now use a cohesive dark slate/navy palette with mint/blue highlights. A theme toggle switches all three pages back to a lighter design; preference is saved in browser local storage.
- **Catalog UX:** sortable by featured order, name or API availability; two responsive card layouts (grid/list); a sticky comparison selection dock with one-click clear and compare action.
- **Comparison UX:** once both model requests have completed, show a compact summary of the two responses, lower *measured wall time* and combined reported token counts. Wall time includes network delay and is **not** inference throughput or quality ranking.
- **Polish:** keyboard focus styles, high-density responsive cards, accessible control labels, responsive mobile navigation, reduced-motion support.

## Unchanged safeguards

- A model shown in the catalog is not automatically available through your key. Meta's live `/models` listing controls the availability labels.
- Contributor mode confirmation, blocked-model states, HTTPS tool allowlists and external-action approval remain unchanged.
- No browser-disclosed API secrets and no automatic model runs; comparing two models generates two billable requests only on explicit user action.
- No credit balance or hard spending limit is implemented. UI does not claim these features.

## Files changed

- `frontend/src/app/studio/page.tsx`
- `frontend/src/app/studio/catalog/page.tsx`
- `frontend/src/app/studio/compare/page.tsx`
- `frontend/src/app/studio/ui-refresh.css` (new)
- `frontend/src/components/StudioThemeToggle.tsx` (new)
- `frontend/tests/studio-ui-refresh.test.mjs` (new)
- `frontend/package.json`, `README.md`, `AGENTS.md`, `CHANGELOG.md`

## Windows acceptance checklist

1. In your **existing working v0.9.3 directory**, back up your `.env`, voice assets and any local data; do not place them inside a public ZIP.
2. Extract this complete v0.9.4 release into a separate directory; copy your existing `.env` and Kokoro model assets into the corresponding paths.
3. Start FastAPI with `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
4. From `frontend`, run `npm install`, `npm run test:stream`, `npm run typecheck`, `npm run build`, `npm run dev`.
5. Open `/studio`, `/studio/catalog` and `/studio/compare`; test theme persistence and mobile width.
6. Refresh model availability, filter and sort the catalog, select two eligible reasoning models, and compare them using a short prompt. This final step incurs API charges.
7. Regression-test existing `/`, `/agents`, voice, documents and image upload.

Offline tests validate the new source and existing backend, but the full Next.js production build could not run in the authoring environment because npm registry DNS was unavailable. UI is **not user-verified** until Windows tests succeed.
