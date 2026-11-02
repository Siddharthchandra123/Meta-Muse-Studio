"""Offline regression: Phase 5 must not be rejected as an outdated Phase 3 backend."""
import importlib.util
import sys
from pathlib import Path


def load_diagnostic():
    path = Path(__file__).resolve().parents[1] / 'scripts' / 'diagnose-realtime.py'
    spec = importlib.util.spec_from_file_location('realtime_diagnostic', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_phase5_backend_passes_capability_based_diagnostic(monkeypatch):
    diag = load_diagnostic()
    def fake_get_json(path):
        if path == '/health':
            return {'status': 'ok', 'service': 'muse-nova-api', 'version': '0.5.0'}
        return {'route': '/v1/voice/realtime', 'key_configured': True,
                'websockets_installed': True,
                'allowed_origins': ['http://127.0.0.1:3000']}
    monkeypatch.setattr(diag, 'get_json', fake_get_json)
    monkeypatch.setattr(diag, 'print_free_network_checks', lambda: None)
    monkeypatch.setattr(sys, 'argv', ['diagnose-realtime.py'])
    assert diag.main() == 0


def test_readiness_rejects_missing_websocket_dependency(monkeypatch):
    diag = load_diagnostic()
    monkeypatch.setattr(diag, 'get_json', lambda path: (
        {'status': 'ok', 'version': '0.5.0'} if path == '/health'
        else {'route': '/v1/voice/realtime', 'key_configured': True,
              'websockets_installed': False,
              'allowed_origins': ['http://127.0.0.1:3000']}))
    monkeypatch.setattr(diag, 'print_free_network_checks', lambda: None)
    monkeypatch.setattr(sys, 'argv', ['diagnose-realtime.py'])
    assert diag.main() == 1
