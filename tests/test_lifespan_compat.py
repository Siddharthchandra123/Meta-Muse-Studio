"""ASGI lifespan regression: avoids removed Starlette event registration."""
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
import app.main as main


def test_lifespan_shutdown_closes_workflows(monkeypatch):
    close = AsyncMock()
    monkeypatch.setattr(main, 'close_workflows', close)
    with TestClient(main.app) as client:
        response = client.get('/health')
        assert response.status_code == 200
        assert response.json()['version'] == '0.8.1'
        close.assert_not_awaited()
    close.assert_awaited_once_with()


def test_no_legacy_event_handler_call_in_module():
    from pathlib import Path
    source = (Path(__file__).resolve().parents[1] / 'app' / 'main.py').read_text()
    assert 'app.add_event_handler(' not in source
    assert 'lifespan=lifespan' in source
