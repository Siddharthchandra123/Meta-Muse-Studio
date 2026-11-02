from uuid import uuid4

from fastapi.testclient import TestClient

import app.main as main
from app.provider import ModelDelta, ModelFinished, ModelReply


class FakeProvider:
    def __init__(self):
        self.calls = []
        self.responses = 0

    async def generate(self, message, previous_response_id):
        self.calls.append((message, previous_response_id))
        self.responses += 1
        return ModelReply(
            answer="Mock reply", model="muse-spark-1.3",
            response_id=f"resp_{self.responses}", input_tokens=200,
            output_tokens=50, cached_input_tokens=0,
        )

    async def stream(self, message, previous_response_id):
        self.calls.append((message, previous_response_id))
        self.responses += 1
        yield ModelDelta("Hello ")
        yield ModelDelta("stream")
        yield ModelFinished(ModelReply(
            answer="Hello stream", model="muse-spark-1.3",
            response_id=f"stream_{self.responses}", input_tokens=150,
            output_tokens=35, cached_input_tokens=0,
        ))


def _with_fake(fake):
    main.app.dependency_overrides[main.get_provider] = lambda: fake
    return TestClient(main.app)


def test_health_is_free():
    with TestClient(main.app) as client:
        r = client.get('/health')
        assert r.status_code == 200
        assert r.json()["version"] == "0.8.1"


def test_demo_html():
    with TestClient(main.app) as client:
        r = client.get('/')
        assert r.status_code == 200
        assert 'MUSE Nova' in r.text
        assert '/v1/chat/stream' in r.text


def test_chat_and_response_id_context():
    provider = FakeProvider()
    try:
        with _with_fake(provider) as client:
            first = client.post('/v1/chat', json={'message': 'Hello'})
            assert first.status_code == 200
            first_id = first.json()['conversation_id']
            assert first.json()['provider_response_id'] == 'resp_1'
            second = client.post('/v1/chat', json={
                'message': 'What did I say?', 'conversation_id': first_id
            })
            assert second.status_code == 200
            assert provider.calls == [('Hello', None), ('What did I say?', 'resp_1')]
            assert second.json()['usage']['estimated_cost_usd'] > 0
    finally:
        main.app.dependency_overrides.clear()


def test_stream_tokens_and_followup():
    provider = FakeProvider()
    try:
        with _with_fake(provider) as client:
            first = client.post('/v1/chat/stream', json={'message': 'One'})
            assert first.status_code == 200
            assert 'event: delta' in first.text
            assert 'Hello ' in first.text
            assert 'event: done' in first.text
            assert 'answer' in first.text and 'Hello stream' in first.text
            # Extract session ID from first SSE event.
            import json
            id_line = first.text.split('data: ')[1].split('\n')[0]
            conv_id = json.loads(id_line)['conversation_id']
            second = client.post('/v1/chat', json={
                'message': 'Two', 'conversation_id': conv_id,
            })
            assert second.status_code == 200
            assert provider.calls == [('One', None), ('Two', 'stream_1')]
    finally:
        main.app.dependency_overrides.clear()


def test_stream_failure_does_not_change_response_id():
    class Broken(FakeProvider):
        async def stream(self, message, previous_response_id):
            yield ModelDelta('partial text')
            raise RuntimeError('Secret token: do not show')
    provider = Broken()
    try:
        with _with_fake(provider) as client:
            response = client.post('/v1/chat/stream', json={'message': 'Hello'})
            assert 'event: error' in response.text
            assert 'event: done' not in response.text
            assert 'Secret token' not in response.text
    finally:
        main.app.dependency_overrides.clear()


def test_unknown_session_returns_404():
    try:
        with _with_fake(FakeProvider()) as client:
            r = client.post('/v1/chat', json={
                'message': 'hello', 'conversation_id': str(uuid4())})
            assert r.status_code == 404
    finally:
        main.app.dependency_overrides.clear()


def test_empty_message_rejected_without_model():
    provider = FakeProvider()
    try:
        with _with_fake(provider) as client:
            r = client.post('/v1/chat/stream', json={'message': ''})
            assert r.status_code == 422
            assert provider.calls == []
    finally:
        main.app.dependency_overrides.clear()


def test_usage_is_only_an_estimate():
    with TestClient(main.app) as client:
        r = client.get('/v1/usage')
        assert r.status_code == 200
        assert 'not a balance' in r.json()['disclaimer']


def test_missing_api_key_yields_503_without_network(monkeypatch):
    monkeypatch.delenv('MODEL_API_KEY', raising=False)
    main.app.dependency_overrides.clear()
    with TestClient(main.app) as client:
        response = client.post('/v1/chat/stream', json={'message': 'hello'})
        assert response.status_code == 503
        assert 'not configured' in response.text


def test_stream_incomplete_shows_actionable_error_without_secrets():
    from app.provider import UpstreamResponseError

    class Limited(FakeProvider):
        async def stream(self, message, previous_response_id):
            raise UpstreamResponseError('Meta stream incomplete: max_output_tokens')
            yield  # make an async generator

    try:
        with _with_fake(Limited()) as client:
            response = client.post('/v1/chat/stream', json={'message': 'hello'})
            assert response.status_code == 200
            assert 'event: error' in response.text
            assert 'MAX_OUTPUT_TOKENS' in response.text
            assert 'event: done' not in response.text
    finally:
        main.app.dependency_overrides.clear()


def test_stream_terminal_event_always_includes_answer_without_deltas():
    class TerminalOnly(FakeProvider):
        async def stream(self, message, previous_response_id):
            yield ModelFinished(ModelReply(
                answer='A complete answer without partial deltas',
                model='muse-spark-1.3', response_id='resp_final',
                input_tokens=10, output_tokens=15,
            ))
    try:
        with _with_fake(TerminalOnly()) as client:
            response = client.post('/v1/chat/stream', json={'message': 'hello'})
            assert response.status_code == 200
            assert 'event: done' in response.text
            assert 'A complete answer without partial deltas' in response.text
    finally:
        main.app.dependency_overrides.clear()
