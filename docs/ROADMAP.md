# MUSE Nova roadmap status (2026-10-31)

- **Phases 1–3**: user-verified Meta Muse text/streaming, dashboard, voice/Kokoro and live WebSocket.
- **Phase 4**: image/document/screen components delivered; document analysis user-verified after v0.7.2; not every live visual path separately verified.
- **Phase 5**: user-verified web research and autonomous tool workflows.
- **Muse Studio**: user-verified playground, model catalog and comparison.
- **Phase 6 — v1.0.0**: code implemented for explicit Postgres/pgvector memory, LangGraph durable chat/research state, Memory Center management. **Live Windows Docker and npm build validation pending.** Read [Phase 6 architecture](PHASE6_MEMORY_LANGGRAPH.md).
- **Phase 7 (planned)**: AMD MI300X, local Muse Glimmer and inference benchmarking.
- **Phase 8 (planned)**: authentication, persistent approval execution, encryption/retention, spending caps, production deployment.
- **Phase 9 (planned)**: advanced AgentOS workflows and proactive personal assistance.

# MUSE Nova — Roadmap (2026-10-30)

| Phase | Scope | Status |
|---|---|---|
| 1 | Muse API, FastAPI, streaming and context | **User-verified** |
| 2 | Next.js assistant dashboard and usage | **User-verified** |
| 3 | Push-to-talk and real-time voice, Kokoro, barge-in | **User-verified** |
| 4 | Image, document, PDF, screen and opt-in voice+vision | Code implemented; **document inference user-reported working**, other flows not fully verified |
| 5 | Muse function tools, SearXNG research, read-only browser, note approvals | **Implemented v0.8.0; live Windows testing pending** |
| 6 | Long-term memory, pgvector, LangGraph checkpoints | Planned |
| 7 | Adaptive inference, Glimmer, AMD MI300X benchmarking | Planned |
| 8 | Authentication, user scoping, OAuth apps, spend caps, prod monitoring | Planned |
| 9 | Advanced multi-agent AgentOS | Planned |

Phase 5 is intentionally constrained to read-only research plus explicitly approved local notes. Sending email, booking, unrestricted browser control or external file mutation must not be represented as shipped.
