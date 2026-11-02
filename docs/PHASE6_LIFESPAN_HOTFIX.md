# Phase 6 FastAPI Startup Hotfix — v1.0.1

## Symptom

Starting Uvicorn fails on importing `app.main`:

```text
AttributeError: 'FastAPI' object has no attribute 'add_event_handler'
```

## Cause

The project previously called `app.add_event_handler('shutdown', close_workflows)` at module import. Starlette 1.0 removes this deprecated method. Current FastAPI recommends `lifespan` for application startup and shutdown.

## Change

`app/main.py` now defines:

```python
from contextlib import asynccontextmanager
from app.memory_api import close_workflows

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        await close_workflows()

app = FastAPI(title='MUSE Nova', version='0.7.1', lifespan=lifespan)
```

This does not trigger eager DB initialization on startup. The existing lazy memory initialization remains unchanged; the LangGraph saver and DB resources close cleanly on app shutdown.

## Windows upgrade

1. Back up the working folder. Extract this ZIP into a new directory, or replace **only** `app/main.py` if preserving your already-installed project.
2. Retain your existing `.env`, Kokoro model files, virtual environment and PostgreSQL data volume. These are not included in this source bundle.
3. Run tests from the inner `muse-nova` project folder:

```powershell
python -m pytest -q
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
Invoke-RestMethod http://127.0.0.1:8000/health
```

Expected backend version: `0.7.1`.

4. If `MEMORY_ENABLED=true`, start Docker Desktop first, then run `docker compose -f .\infra\memory\compose.yaml up -d`, and check `http://127.0.0.1:8000/v1/memory/status`.

## Verification

91 local Python tests passed; no live Docker/PostgreSQL/Meta integration or frontend production build was exercised in this environment.
