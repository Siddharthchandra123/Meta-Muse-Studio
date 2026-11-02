"""Offline HTTP adapter checks. No secrets, network calls, or native jiter needed."""
import json
import httpx
import pytest
from app.provider import MuseProvider, ModelDelta, ModelFinished, UpstreamResponseError


def test_provider_params_including_chain(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'fake-test-key')
    p = MuseProvider()
    first = p._params('Hello', None)
    second = p._params('How?', 'resp_1')
    assert first['model'] == 'muse-spark-1.3'
    assert first['store'] is True
    assert first['reasoning'] == {'effort': 'minimal'}
    assert 'previous_response_id' not in first
    assert second['previous_response_id'] == 'resp_1'
    assert second['instructions']


def _done(answer='hey there'):
    return {
        'id': 'resp_123', 'model': 'muse-spark-1.3',
        'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': answer}]}],
        'usage': {'input_tokens': 100, 'output_tokens': 22,
                  'input_tokens_details': {'cached_tokens': 3}},
    }


def _mock_client(handler):
    return httpx.AsyncClient(
        base_url='https://api.meta.ai/v1/',
        transport=httpx.MockTransport(handler),
    )


@pytest.mark.asyncio
async def test_adapter_generates_json_without_sdk(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'fake-test-key')
    p = MuseProvider()

    def handler(request):
        assert request.url.path == '/v1/responses'
        assert json.loads(request.content)['input'] == 'Hello'
        return httpx.Response(200, json=_done())

    monkeypatch.setattr(p, '_client', lambda: _mock_client(handler))
    reply = await p.generate('Hello', None)
    assert reply.answer == 'hey there'
    assert reply.response_id == 'resp_123'
    assert reply.cached_input_tokens == 3


@pytest.mark.asyncio
async def test_adapter_stream_completes_only_after_finished(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'fake-test-key')
    p = MuseProvider()
    events = [
        {'type': 'response.output_text.delta', 'delta': 'hey '},
        {'type': 'response.output_text.delta', 'delta': 'there'},
        {'type': 'response.completed', 'response': _done()},
    ]

    def handler(request):
        body = json.loads(request.content)
        assert body['stream'] is True
        content = ''.join(f'data: {json.dumps(e)}\n\n' for e in events)
        return httpx.Response(200, content=content,
                              headers={'content-type': 'text/event-stream'})

    monkeypatch.setattr(p, '_client', lambda: _mock_client(handler))
    out = [v async for v in p.stream('question', None)]
    assert [type(x) for x in out] == [ModelDelta, ModelDelta, ModelFinished]
    assert out[0].text + out[1].text == 'hey there'
    assert out[2].reply.response_id == 'resp_123'
    assert out[2].reply.cached_input_tokens == 3


@pytest.mark.asyncio
async def test_adapter_rejects_http_403_without_revealing_body(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'fake-test-key')
    p = MuseProvider()
    def handler(request):
        return httpx.Response(403, json={'error': 'Secret request metadata'})
    monkeypatch.setattr(p, '_client', lambda: _mock_client(handler))
    with pytest.raises(UpstreamResponseError, match='HTTP 403') as exc:
        await p.generate('hello', None)
    assert 'Secret request metadata' not in str(exc.value)


@pytest.mark.asyncio
async def test_adapter_reports_incomplete_token_budget(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'fake-test-key')
    p = MuseProvider()
    def handler(request):
        event = {'type': 'response.incomplete', 'response': {
            'status': 'incomplete',
            'incomplete_details': {'reason': 'max_output_tokens'}}}
        return httpx.Response(200, content=f'data: {json.dumps(event)}\n\n',
                              headers={'content-type': 'text/event-stream'})
    monkeypatch.setattr(p, '_client', lambda: _mock_client(handler))
    with pytest.raises(UpstreamResponseError, match='max_output_tokens'):
        _ = [item async for item in p.stream('Hi', None)]


def test_4096_budget_not_silently_clamped(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'fake-test-key')
    monkeypatch.setenv('MAX_OUTPUT_TOKENS', '4096')
    monkeypatch.setenv('MUSE_REASONING_EFFORT', 'minimal')
    p = MuseProvider()
    assert p._params('Summarize my PDF', None)['max_output_tokens'] == 4096
    assert p._params('Summarize my PDF', None)['reasoning'] == {'effort': 'minimal'}


def test_application_safety_limit_is_explicit(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'fake-test-key')
    monkeypatch.setenv('MAX_OUTPUT_TOKENS', '25000')
    p = MuseProvider()
    assert p.max_tokens == 8192
