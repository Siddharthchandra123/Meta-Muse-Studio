"""All tests use synthetic PCM and a fake Meta WebSocket, with no API charge."""
import asyncio
import json
import socket
import ssl

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.live_voice import handshake, safe_event, local_voice_status, allowed_origins, classify_error, RealtimeSetupError


def test_muse_handshake_shape_and_secret_only_here():
    data = handshake("TEST_SECRET")
    assert data['authorization']['accessToken'] == 'Bearer TEST_SECRET'
    assert data['audioEncoding'] == 'PCM_24KHZ'
    assert data['mode'] == 'ENDPOINTING'
    assert data['partialMode'] == 'CUMULATIVE'


def test_sanitized_events_and_cumulative_transcripts():
    assert safe_event({'type':'transcript','transcript':'hello', 'final':False, 'authorization':'SECRET'}) == {
        'type':'transcript', 'transcript':'hello', 'final':False
    }
    assert safe_event({'type':'speechComplete','turnId':2,'transcript':'Hello.'}) == {
        'type':'speechComplete','turnId':2,'transcript':'Hello.'
    }
    assert safe_event({'type':'unknown','key':'secret'}) is None
    assert safe_event({'type':'error','message':'API KEY SECRET'}) == {
        'type':'error','code':'META_STREAM_ERROR',
        'message':'Meta returned a transcription error. Check the FastAPI terminal.'
    }


def test_origin_and_host_restricted(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'TEST_KEY')
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect('/v1/voice/realtime', headers={'origin':'http://evil.site'}):
                pass
        assert exc.value.code == 1008


def test_requires_configured_key(monkeypatch):
    monkeypatch.delenv('MODEL_API_KEY', raising=False)
    with TestClient(app) as client:
        with client.websocket_connect('/v1/voice/realtime',headers={'origin':'http://127.0.0.1:3000','host':'127.0.0.1:8000'}) as socket:
            error = socket.receive_json()
            assert error['code'] == 'MODEL_API_KEY_MISSING'
            assert 'TEST_KEY' not in str(error)
            with pytest.raises(WebSocketDisconnect) as exc:
                socket.receive_json()
            assert exc.value.code == 1011


class FakeMetaSocket:
    def __init__(self):
        self.sent=[]
        self.received=asyncio.Queue()
        self.received.put_nowait(json.dumps({'sessionId':'fake-session'}))

    async def send(self, data):
        self.sent.append(data)
        if isinstance(data, bytes):
            self.received.put_nowait(json.dumps({'type':'speechStart','turnId':1,'audioProcessedMs':80}))
            self.received.put_nowait(json.dumps({'type':'transcript','transcript':'Hello','final':False}))
            self.received.put_nowait(json.dumps({'type':'speechComplete','turnId':1,'transcript':'Hello there.'}))
        if data == '{"type": "endStream"}':
            self.received.put_nowait(None)

    async def recv(self):
        return await self.received.get()

    async def __aiter__(self):
        while True:
            v = await self.received.get()
            if v is None: return
            yield v


class FakeMetaContext:
    def __init__(self, fake): self.fake=fake
    async def __aenter__(self): return self.fake
    async def __aexit__(self, *args): return None


def test_live_pcm_relay_and_speech_complete(monkeypatch):
    fake=FakeMetaSocket()
    monkeypatch.setenv('MODEL_API_KEY', 'FAKE_KEY')
    import websockets.asyncio.client
    monkeypatch.setattr(websockets.asyncio.client, 'connect', lambda *a,**k:FakeMetaContext(fake))
    with TestClient(app) as client:
        with client.websocket_connect('/v1/voice/realtime',headers={'origin':'http://127.0.0.1:3000','host':'127.0.0.1:8000'}) as socket:
            assert socket.receive_json()['type']=='ready'
            socket.send_bytes(bytes(3840))
            assert socket.receive_json()['type']=='speechStart'
            assert socket.receive_json()['transcript']=='Hello'
            completed=socket.receive_json()
            assert completed['type']=='speechComplete'
            assert completed['transcript']=='Hello there.'
            socket.send_json({'type':'endStream'})
    assert any(isinstance(s,bytes) and len(s)==3840 for s in fake.sent)
    assert 'FAKE_KEY' not in json.dumps(completed)


def test_local_readiness_no_credentials(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'THIS_KEY_MUST_NOT_APPEAR')
    with TestClient(app) as client:
        response = client.get('/v1/voice/realtime/status')
    assert response.status_code == 200
    data = response.json()
    assert data['key_configured'] is True
    assert data['websockets_installed'] is True
    assert 'THIS_KEY_MUST_NOT_APPEAR' not in response.text
    assert 'http://127.0.0.1:3001' in data['allowed_origins']


def test_only_explicit_origins_allowed(monkeypatch):
    monkeypatch.setenv('LIVE_VOICE_ALLOWED_ORIGINS', 'http://127.0.0.1:3000')
    assert allowed_origins() == {'http://127.0.0.1:3000'}


def test_error_classification_never_exposes_exception_text():
    assert classify_error(RealtimeSetupError('META_HANDSHAKE_REJECTED')) == 'META_HANDSHAKE_REJECTED'
    assert classify_error(TimeoutError('SECRET FROM UPSTREAM')) == 'META_CONNECT_TIMEOUT'
    assert classify_error(OSError('SECRET FROM UPSTREAM')) == 'META_NETWORK_ERROR'
    assert classify_error(socket.gaierror('SECRET FROM UPSTREAM')) == 'META_DNS_ERROR'
    assert classify_error(ssl.SSLError('SECRET FROM UPSTREAM')) == 'META_TLS_ERROR'
    from websockets.exceptions import ProxyError
    assert classify_error(ProxyError('SECRET FROM UPSTREAM')) == 'META_PROXY_ERROR' 


def test_failed_upstream_connection_has_safe_error(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'THIS_KEY_MUST_NOT_APPEAR')
    import websockets.asyncio.client
    class BrokenContext:
        async def __aenter__(self): raise TimeoutError('THIS_KEY_MUST_NOT_APPEAR')
        async def __aexit__(self, *args): pass
    monkeypatch.setattr(websockets.asyncio.client, 'connect', lambda *a, **kw: BrokenContext())
    with TestClient(app) as client:
        with client.websocket_connect('/v1/voice/realtime',headers={'origin':'http://127.0.0.1:3000','host':'127.0.0.1:8000'}) as socket:
            error = socket.receive_json()
            assert error['code'] == 'META_CONNECT_TIMEOUT'
            assert 'THIS_KEY_MUST_NOT_APPEAR' not in str(error)
            with pytest.raises(WebSocketDisconnect) as exc:
                socket.receive_json()
            assert exc.value.code == 1011
