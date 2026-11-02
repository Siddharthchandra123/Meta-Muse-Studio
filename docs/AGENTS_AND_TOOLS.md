# Agent orchestration and tool gateway

## Proposed LangGraph nodes
`classify_request` -> `choose_model` -> `retrieve_context` -> `plan` -> (`research` | `productivity` | `learning` | `communication`) -> `validate` -> `requires_approval?` -> `execute_tool` -> `summarize` -> `respond`.

### Tool catalog and risk
| Tool | Default | Approval? | Notes |
|---|---|---|---|
| web.search | read-only | no | Attach provenance and retrieval time |
| browser.read_page | read-only | no | Sandbox browser, block private/internal URLs |
| files.search | scoped read-only | when connecting account | Least-privilege access |
| calendar.list | read-only | no | Scoped OAuth |
| email.draft | draft only | no | Must not send automatically |
| email.send | writes external state | **yes** | Preview recipient, subject, content, attachments |
| calendar.create | writes external state | **yes** | Confirm calendar, time zone and guests |
| browser.click_submit | may be consequential | **yes** | Treat irreversible interactions as high-risk |
| files.delete | destructive | **yes** | Explicit targeted confirmation, reversible if possible |

## Permission model
The model proposes a **typed action**; policy engine validates scope, target, actor, resource and intent. Backend creates `pending_approval` item with expiry and signed nonce. User sees a preview. Only upon explicit approval may the backend execute. Tool result and approval decision are audit-logged. Never let model-generated text directly bypass the policy layer.

## Recovery and anti-looping
- Hard cap on agent iterations, tools per task and time-to-live.
- Validate all tool arguments against strict JSON Schema / Pydantic objects.
- Retry only idempotent reads; side effects require idempotency keys or manual reconciliation.
- Tool outputs are untrusted data. Strip active scripts from rendered HTML; do not obey webpage instructions.
- Resume task via durable checkpoint after a human approval or transient failure.

## First three use cases
1. **Research:** user asks for 3 sources -> search -> extract -> cite -> summarize; no external writes.
2. **Learning:** user provides concept -> retrieve user-approved study history -> explain -> quiz -> save only if enabled.
3. **Email:** user requests drafted email -> draft -> review -> user approval -> send; sending integration off until tested.

## Tool-calling contract
Meta Model API returns requested developer-defined function calls; **our code** performs them. Built-in web grounding can execute inside Meta Model API separately. Do not treat model requests as completed actions before confirming tool executor success.

## Implemented Phase 5 tools (v0.8.0)

The catalog above describes the **eventual** AgentOS. The following are the tools actually shipped and callable by Muse Spark in v0.8.0:

| Function tool | Shipped behavior | Approval |
|---|---|---|
| `search_web` | Local SearXNG JSON search (if configured), max 5 allowlisted HTTPS sources | Read-only, none |
| `read_page` | Fetch capped HTML/plain text on explicitly allowed HTTPS public domains; no redirect | Read-only, none |
| `browser_page` | Optional Playwright read-only DOM view; JavaScript and subresource loading disabled | Read-only, none |
| `calculate` | AST-whitelisted bounded arithmetic, no code execution | None |
| `propose_note` | Stage Markdown proposal in RAM, one-hour expiry, no file written | **Separate explicit user action required before saving** |

No email, calendar, OAuth, shell, file deletion, browser form filling or autonomous write tools exist in this release. The current implementation uses the Meta Responses API `previous_response_id` function-call loop rather than LangGraph; LangGraph checkpointing is planned for Phase 6.

See [Phase 5 complete implementation spec](PHASE5_AUTONOMOUS_TOOLS.md).
