# Memory architecture — Phase 6 implementation

See [PHASE6_MEMORY_LANGGRAPH.md](PHASE6_MEMORY_LANGGRAPH.md) for the implemented architecture, startup instructions, security and API contracts.

Phase 6 uses PostgreSQL `muse_memories` + `muse_threads`, an actual `vector(384)` HNSW index, and LangGraph PostgreSQL checkpoints. Long-term memories are saved explicitly, never extracted from conversations without user action. The vectorizer is a local lexical baseline, not a trained neural embedding. Image and PDF raw bytes are not stored in checkpoints. Local data deletion does not affect provider-side data already sent.
