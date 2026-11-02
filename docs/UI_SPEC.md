# Interface specification — draft

## Primary screen
- Left rail: conversations, tasks, memory review, settings, cost tracker.
- Center: conversation transcript, cited research cards, task progress steps, visible tool results.
- Bottom composer: text, microphone press-to-talk, image/file attach (later), stop generation.
- Right optional panel: task execution plan, pending approvals, execution history, citations.

## Voice states
`idle -> listening -> transcribing -> reasoning -> speaking -> idle`; user speech while speaking triggers `interrupting -> listening`. Errors show recoverable state and whether speech was preserved.

## Task approval card
Includes exact requested action, account, destination, payload preview, consequences, token expiry and two actions: Approve / Reject. No prechecked confirmation.

## Accessibility
Keyboard navigation, captions during voice output, high contrast, reduced animation preference, screen reader roles, multilingual input and easy manual stop.

## Future pages
- `/chat` main experience
- `/tasks` task executions and approvals
- `/memory` consented memories and delete/export controls
- `/usage` costs, model call breakdown and throttles
- `/settings` model routing, voice preferences, permissions and retention

A minimal static browser demo is **implemented** at `/` in Phase 1.1. The full Next.js frontend, microphone, image/file attachments, memory review, approvals, and task UI remain **not implemented**.

## Phase 2 v0.3.0 implemented interface

`frontend/src/app/page.tsx` includes: left conversation sidebar with local-only search and deletion, model status (Spark 1.3 only), live backend health, streaming assistant conversation with stop action, prompt suggestion cards, composer, usage dashboard, settings panel and local transcript export. Responsive styles are in `frontend/src/app/globals.css`.

Keyboard shortcuts: `Ctrl+K` / `Cmd+K` = new local chat; `/` = focus sidebar conversation search; Enter = send; Shift+Enter = new line.

Voice, memory, tools and uploads **are not functioning** and are only marked as future phases; no fake controls that suggest they are operational. See [`FRONTEND_PHASE2.md`](FRONTEND_PHASE2.md).
