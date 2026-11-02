# Phase 6.5 — MUSE Nova Knowledge Hub / RAG as a Service

**Release:** 1.1.0 candidate (FastAPI backend 0.8.0)

## Goal

Make each user-approved upload a reusable knowledge collection. Search locally without sending a document to Meta; optionally send **only the retrieved excerpts** with a question to Muse Spark after an explicit UI checkbox or API boolean. Memory of personal preferences is separate from uploaded knowledge. This prototype is **local-only and single-user**: do not expose to networks or multiple accounts without adding authentication, access policy enforcement, quotas, rate limiting, audit logs, encryption-at-rest, and tenant isolation.

## Working implementation

- `app/rag_service.py`: SQLite FTS5, collection/document/chunk persistence, idempotent SHA256 uploads, versioned replacements, PDF-page extraction, metadata, deletes, optional local embedding model, ranking.
- `app/rag_api.py`: FastAPI RAG-as-a-Service endpoints; invokes `MuseProvider.generate()` only when the caller explicitly consents and matching evidence exists.
- `/knowledge`: Next.js Knowledge Hub with collection management, uploads, retrieval-only preview and grounded Muse Q&A.
- `/api/rag/...`: strict same-origin Next.js proxy; only known RAG endpoints, request-size checks, backend confined to local host.
- Docker-independent default: `./data/rag.sqlite3` is persisted on disk. Existing PostgreSQL/LangGraph Phase 6 remains separate and can be enabled later.

### Supported patterns

| Pattern | Status | Actual behavior |
| --- | --- | --- |
| Keyword/full-text | Available by default | SQLite FTS5 BM25 ranking |
| Semantic | Available when embedding dependencies and config enabled | Real `sentence-transformers` neural embeddings; brute-force normalized cosine on local stored vectors |
| Hybrid | Available when embedding dependencies and config enabled | Rank fusion using 1/(60+rank), over keyword and semantic retrieval |
| Auto | Available | Uses hybrid only when the collection's chunks are fully embedded under the configured model; otherwise keyword |
| Multi-query | Planned | Muse generates alternative queries, retrieves independently, merges and deduplicates |
| Parent-child | Planned | Retrieve small child spans but expand to larger parent paragraphs/pages before generation |
| Agentic | Planned | LangGraph planner/tool routing, source verification and retrieval retries |
| Graph | Planned | Entity/relationship index and graph traversals |
| Multimodal RAG | Planned | Page-image/diagram embeddings and OCR with citation coordinates |

These names are not interchangeable. Keyword retrieval is **not** semantic retrieval. If neural embeddings are disabled, the API returns an explicit 503 for semantic/hybrid mode instead of mislabeling keyword results.

## Ingestion

1. User creates/selects a knowledge collection.
2. User uploads PDF, DOCX, TXT, Markdown or CSV through `/knowledge` or RAG API.
3. File bytes are bounded to 12 MiB; PDFs to 100 pages; extracted text to 320,000 characters; collection to 4,000 chunks.
4. PDF page text is extracted with `pypdf`. Scanned/image-only PDF pages are not OCR'd (explicit error if no text). DOCX/text can be indexed but have no trustworthy page number.
5. Page text is divided into ~1,100 character overlapping chunks with page, document ID, version, index and original filename metadata.
6. Optional local neural embeddings are computed before writing; `sentence-transformers` model downloads must be approved and separately installed. Vector data is stored in SQLite; production should migrate to `pgvector`/HNSW for scale.
7. A SHA256 repeat upload is a no-op. Replacing the same filename with changed contents reindexes it and increments its version. Deletion purges extracted chunks and FTS entries.

**Important:** The service stores extracted text. Not storing original bytes does not make it ephemeral: users must delete a collection/document to remove indexed knowledge. Temporary files, database backups, WAL files and provider retention policies need their own lifecycle controls.

## Query and answer

`POST /v1/rag/search` is **fully local**. Modes: `keyword`, `semantic`, `hybrid`, `auto`. Response includes snippets, file name, PDF page when known, chunk index and scores. The local RRF score is relative, not a probability or semantic-confidence score.

`POST /v1/rag/ask` requires `consent_to_external_model: true`. It retrieves up to 12 chunks (default 5), caps context length, prepends source reference IDs and sends the query plus selected passages to Meta Muse Spark. It tells Muse not to follow instructions embedded in retrieved content and to cite evidence as `[1]`, `[2]`, etc. Model-generated citations still require checking; the API returns source objects so the UI can show original excerpts. No matches → no LLM call.

### API contract

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/v1/rag/status` | Local database, mode and model status |
| GET/POST | `/v1/rag/collections` | List / create knowledge collections |
| DELETE | `/v1/rag/collections/{id}` | Delete collection, documents, chunks and FTS entries |
| GET | `/v1/rag/collections/{id}/documents` | List document metadata |
| POST (multipart) | `/v1/rag/collections/{id}/documents` | Index file under form part `file` |
| DELETE | `/v1/rag/collections/{id}/documents/{document_id}` | Remove a source and its chunks |
| POST | `/v1/rag/search` | Local retrieval and citations |
| POST | `/v1/rag/ask` | Consent-gated grounded response with source list |

Example search request:

```json
{"collection_id":"<uuid>","query":"What are the main risks?","mode":"auto","top_k":5}
```

Example answer request adds `"consent_to_external_model":true`. Never log or share user data and API keys in debug traces.

## Windows setup without Docker

From the folder containing `app/` and `frontend/`:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-rag.txt
# Phase 6 PostgreSQL/LangGraph remains optional while Docker is unavailable:
# Set MEMORY_ENABLED=false in .env, preserving Meta API configuration.
# Optional only: python -m pip install -r requirements-rag-embeddings.txt
# Optional only: RAG_ENABLE_EMBEDDINGS=true in .env
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Launch the existing Next.js frontend using `npm install && npm run dev` in `frontend/`, then open `http://127.0.0.1:3000/knowledge`.

Run the no-credit smoke check from project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-rag.ps1
```

Local query is free. Asking Muse consumes API tokens and exposes only the selected excerpts and query to your Meta API account.

### Integrating RAG across MUSE Nova

- Assistant upload UX: keep chat attachments transient by default; offer **Save to Knowledge Hub** and require a user-selected collection rather than silently indexing private chat attachments.
- Research Agent: add `search_knowledge` tool that takes `collection_id`, query and retrieval mode; no web search needed.
- Muse Studio: add `knowledge_collection_id` and optional retrieval strategy to experiments; compare with/without RAG under the same evaluation questions.
- LangGraph: make `retrieve_knowledge` a conditional graph node before synthesis; checkpoint only retrieval IDs and user-owned text excerpts under configured retention limits.
- Future: migration from SQLite to Postgres pgvector with a tenant-ID scope on **every read and delete**; enforce RLS plus application-level authorization before multi-tenant use.

## Evaluation

Before public release measure Recall@k, MRR, citation precision, faithfulness/groundedness, ingestion throughput, retrieval p50/p95, answer latency, token costs and deletion integrity. Include negative tests for prompt-injection payloads in documents. Avoid claiming accuracy without benchmark evidence.

## Unverified / limitations

- Local SQLite keyword, metadata and deletion operations have offline tests. Neural models have optional dependencies and have not been downloaded or benchmarked in this build.
- Actual Meta RAG-answer request, browser UI, full Next.js production build and Windows installation need user verification.
- Does not provide automatic OCR, spreadsheet formulas, graph indexing, multi-user accounts, cryptographic storage encryption, or production vector-search scalability.
- FTS5 and neural vectors are persisted only in the local data path. No Docker required for this RAG module, but Phase 6 memory and SearXNG still depend on their own services.


### v1.1.1 Windows 404 / deletion dialog compatibility

- Browser environments may not implement `window.prompt` or `window.confirm`. Delete documents and collections with the new inline approval panels in `/knowledge`.
- When `/api/rag/collections/<id>/documents` returns 404, check whether FastAPI responds `Knowledge collection not found.` (stale ID or different SQLite DB) or `Not Found` (old backend / missing route). The Next.js proxy is an independent hop.
- Relative `RAG_SQLITE_PATH` now points into the extracted project regardless of your working directory. You can set an **absolute** SQLite path to your existing file if you moved project versions and wish to keep collections across releases. Copy or back up existing SQLite files before moving them. Never delete the database as an error fix.
- Run `powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-rag-404.ps1 -CollectionId <UUID>` from the project root. The script only reads status, collections and document lists, without calling Meta or modifying data.
