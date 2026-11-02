# Phase 6 — Persistent Intelligence (MUSE Nova v1.0.0)

## Overview

Phase 6 is **opt-in**. With `MEMORY_ENABLED=true`, MUSE Nova uses PostgreSQL/pgvector and LangGraph's `AsyncPostgresSaver` for durable conversation and research workflow checkpoints. The existing `/v1/chat`, `/v1/chat/stream`, `/v1/chat/vision/stream`, `/v1/chat/multimodal/stream`, and `/v1/agent/stream` APIs remain compatible. Live voice routes retain their current microphone / Meta Voice Transcribe path; completed voice turns sent to chat flow participate in persistent history.

**New UI**: `/memory` for inspecting persistent threads, saved preferences/facts, search, per-item deletion, thread deletion, and resuming conversations in the assistant.

## Architecture

```mermaid
flowchart TD
    User[User voice / text / image / PDF] --> Next[Next.js dashboard]
    Next --> Fast[FastAPI chat / multimodal / research]
    Fast --> Enabled{MEMORY_ENABLED?}
    Enabled -->|false| Legacy[Existing in-memory session handling]
    Enabled -->|true| Graph[LangGraph StateGraph]
    Graph --> Retrieve[Retrieve opted-in memories]
    Retrieve --> Muse[Meta Muse Spark API]
    Muse --> Checkpoint[AsyncPostgresSaver checkpoint]
    Checkpoint --> Thread[(PostgreSQL muse_threads)]
    MemoryUI[Memory Center] --> Api[Memory REST API]
    Api --> Vector[(pgvector memory items)]
    Vector --> Retrieve
    Fast --> Agent[Phase 5 approved tools]
    Agent --> ResearchGraph[LangGraph research run]
    ResearchGraph --> Checkpoint
```

### Durability model

- Chat graph: `retrieve_memories -> generate_with_muse`; `thread_id` is `chat:<UUID>`; `durability='sync'`.
- Research graph: `prepare -> run_research`, where Phase 5 Muse function-call loop operates inside the research node; `thread_id` is `research:<UUID>`.
- Each *completed* request updates the SQL thread index; the checkpoint contains bounded text history and model response ID. Research approvals are still **ephemeral**, and need a fresh explicit user decision; they are not replayed after restart.
- Uploaded image and document bytes, as well as API credentials, are kept in transient `runtime.context`; they are **not checkpointed**. Text descriptions and completed answers are stored.
- Original Meta `previous_response_id` is checkpointed. Continued use of old upstream IDs depends on Meta retaining the conversation server-side; older expired upstream IDs may require starting a new conversation. MUSE Nova does **not** replay all historical PDF/image content from PostgreSQL.
- Browser localStorage thread summaries remain for UI caching. A Memory Center **Resume in Assistant** control loads a saved transcript when the local sidebar does not have the thread.

### Long-term saved knowledge

Memories are explicitly created or deleted by the user in `/memory` or via `POST /v1/memory/items`. The app does *not* automatically turn messages into remembered facts. Categories: `fact`, `project`, `preference`, `instruction`.

Storage: `muse_memories` table with `vector(384)`; HNSW cosine index. **The default 384-dimensional embedding is a deterministic hashed word/character n-gram representation (lexical similarity, not a neural semantic embedding).** This is deliberate for a light local Windows installation with no additional model downloads or native ML wheels. Treat it as a useful baseline and do not claim neural semantic search quality. It uses local pgvector search and no additional Meta API calls to find memories.

Only saved memory **IDs** are checkpointed. Memory content is fetched fresh by ID just before generation. Removing a memory stops future retrieval. Historical answers may still contain previously used facts; deleting a memory does not rewrite old transcripts or delete provider-side data. Delete threads separately when necessary.

## Windows PowerShell quickstart

Run Docker Desktop and use the project root (inner `muse-nova` directory):

```powershell
# 1. PostgreSQL + pgvector on loopback only (separate from port 5432)
docker compose -f .\infra\memory\compose.yaml up -d
docker compose -f .\infra\memory\compose.yaml ps

# 2. Install into your existing Python virtual environment
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-memory.txt

# 3. Edit .env; preserve your existing MODEL_API_KEY
notepad .env
```

Set:

```dotenv
MEMORY_ENABLED=true
MEMORY_DATABASE_URL=postgresql://muse_nova:muse_local_dev@127.0.0.1:55432/muse_nova
LANGGRAPH_STRICT_MSGPACK=true
```

The password is a **development example**. Change both the Compose and `.env` values before any shared deployment. Docker's persistent named volume holds data; replacing application ZIPs does not remove it. Avoid `docker compose down -v` unless deliberately erasing memory.

```powershell
# Terminal 1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2, frontend/
npm install
npm run typecheck
npm run build
npm run dev

# Terminal 3, project root
powershell -ExecutionPolicy Bypass -File .\scripts\check-phase6.ps1
# Free: PostgreSQL memory save/search/edit/delete and cleanup
powershell -ExecutionPolicy Bypass -File .\scripts\check-phase6.ps1 -Crud
# Optional: 2 billable Muse calls and checks checkpoint history
powershell -ExecutionPolicy Bypass -File .\scripts\check-phase6.ps1 -Live
```

Visit `http://127.0.0.1:3000/memory`. Save an explicit preference, search for it, chat with MUSE Nova, restart FastAPI, then select the earlier thread and resume. The `/v1/memory/status` endpoint should report `ready`.

## REST API

| Path | Method | Description |
|---|---|---|
| `/v1/memory/status` | GET | Ready / disabled / unavailable |
| `/v1/memory/items` | GET, POST | List or explicitly save memory |
| `/v1/memory/search` | POST | Local lexical pgvector search |
| `/v1/memory/items/{uuid}` | PATCH, DELETE | Edit or forget one saved item |
| `/v1/memory/threads?category=chat` | GET | Persistent conversations |
| `/v1/memory/threads?category=research` | GET | Persistent research runs |
| `/v1/memory/threads/{uuid}?category=chat` | GET, DELETE | Inspect or permanently delete checkpointed thread |
| `/v1/memory/clear` | POST | Delete all saved *memory items* (not transcripts); requires `DELETE_ALL_SAVED_MEMORIES` |

## Security and limitations

- **Local, single-user prototype only.** No user authentication, tenant isolation, row-level security, encrypted-at-rest storage, or public deployment hardening exists. Never expose port 8000 or port 55432 to the internet.
- Old browser-only transcripts are **not automatically migrated** into PostgreSQL; persistence begins for newly completed requests after Phase 6 is enabled.
- `LANGGRAPH_STRICT_MSGPACK=true` is recommended to reduce risk from unsafe checkpoint deserialization.
- Postgres holds text history; it may include confidential chat content. Use only test/non-sensitive data until full encryption and account security are added.
- Browser / Meta-side conversation persistence are different. Local deletion does **not** delete information already transmitted to or retained by Meta.
- Phase 6 does not automatically approve web actions, send email, log in to accounts or generate hidden proactive tasks.
- `MEMORY_ENABLED=false` preserves the previous working in-memory behavior and avoids requiring PostgreSQL on startup.
- Real Postgres and Windows runtime verification is still needed. Offline tests cannot validate `AsyncPostgresSaver` against your local Docker service.

## Future enhancement

Optional high-quality semantic embeddings, consent-scoped document chunk indexing, memory provenance and expiry, multi-user auth, backup/restore, and strict data-retention controls belong to later production work.

## Sources

- [LangGraph Postgres checkpoint README](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint-postgres/README.md)
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph store](https://reference.langchain.com/python/langgraph.store.postgres/base/PostgresStore)
