import io
import json
import wave

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.voice import VoiceError, VoiceUpstreamError, transcribe_muse, validate_wav


def sample_wav(seconds=0.5, rate=24000):
    out = io.BytesIO()
    with wave.open(out, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(b'\x00\x00' * int(seconds * rate))
    return out.getvalue()


def test_pcm_validation():
    assert validate_wav(sample_wav()) == 0.5
    assert validate_wav(sample_wav(rate=16000)) == 0.5
    with pytest.raises(VoiceError):
        validate_wav(b'not a wav')
    with pytest.raises(VoiceError):
        validate_wav(sample_wav(seconds=91))
    with pytest.raises(VoiceError):
        validate_wav(sample_wav(rate=44100))


def test_transcribe_route_rejects_non_wav_without_network():
    with TestClient(app) as client:
        res = client.post('/v1/voice/transcribe', files={'audio':('bad.wav',b'x','audio/wav')})
        assert res.status_code == 422
        assert 'WAV' in res.json()['detail']


def test_transcribe_route_uses_adapter(monkeypatch):
    async def mocked(data):
        assert validate_wav(data) == 0.5
        return {'transcript':'Hello MUSE Nova', 'duration_seconds':0.5, 'model':'muse-voice-transcribe-1.0'}
    monkeypatch.setattr('app.main.transcribe_muse', mocked)
    with TestClient(app) as client:
        res = client.post('/v1/voice/transcribe',files={'audio':('mic.wav',sample_wav(),'audio/wav')})
        assert res.status_code == 200
        assert res.json()['transcript'] == 'Hello MUSE Nova'


def test_transcribe_muse_sends_multipart_auth_correctly(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY','EXAMPLE_NOT_REAL')
    def handler(req):
        assert req.url.path == '/v1/asr/transcribe'
        assert req.headers['authorization'] == 'Bearer EXAMPLE_NOT_REAL'
        assert b'muse-voice-transcribe-1.0' in req.content
        assert b'PUSH_TO_TALK' in req.content
        assert b'"audioEncoding": "WAV"' in req.content
        return httpx.Response(200, json={'transcript':'Test successful','turns':[]})
    orig=httpx.AsyncClient
    def mocked_client(*args,**kwargs):
        return orig(transport=httpx.MockTransport(handler), *args, **kwargs)
    monkeypatch.setattr(httpx,'AsyncClient',mocked_client)
    import asyncio
    reply=asyncio.run(transcribe_muse(sample_wav()))
    assert reply['transcript'] == 'Test successful'


def test_asr_auth_error_does_not_expose_provider_body(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY','EXAMPLE_NOT_REAL')
    orig=httpx.AsyncClient
    def mocked_client(*args,**kwargs):
        return orig(transport=httpx.MockTransport(lambda r: httpx.Response(401,text='PRIVATE SERVER DETAILS')), *args, **kwargs)
    monkeypatch.setattr(httpx,'AsyncClient',mocked_client)
    import asyncio
    with pytest.raises(VoiceUpstreamError) as exc:
        asyncio.run(transcribe_muse(sample_wav()))
    assert 'HTTP 401' in str(exc.value)
    assert 'PRIVATE' not in str(exc.value)


def test_synthesis_missing_weights_gives_actionable_response(monkeypatch):
    from app import voice
    monkeypatch.setattr(voice, 'KOKORO_DIR',__import__('pathlib').Path('/nonexistent/test/kokoro'))
    voice._kokoro.cache_clear()
    with TestClient(app) as client:
        res = client.post('/v1/voice/synthesize',json={'text':'Hello'})
        assert res.status_code == 503
        assert 'scripts/setup-kokoro.ps1' in res.json()['detail']


def test_synthesis_uses_mock_and_returns_wav(monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, 'synthesize_kokoro', lambda text,voice: sample_wav())
    with TestClient(app) as client:
        res=client.post('/v1/voice/synthesize',json={'text':'Hello','voice':'af_heart'})
        assert res.status_code==200
        assert res.headers['content-type']=='audio/wav'
        assert res.content.startswith(b'RIFF')


def test_synthesis_rejects_overlong_text():
    with TestClient(app) as client:
        res=client.post('/v1/voice/synthesize',json={'text':'a'*601})
        assert res.status_code==422
