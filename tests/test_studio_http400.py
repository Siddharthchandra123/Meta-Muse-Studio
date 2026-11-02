"""Guard against unsupported model settings and opaque Meta HTTP 400 errors."""
import httpx
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.main import app
from app.studio import StudioProvider, TextRun
from app.provider import UpstreamResponseError


def test_max_effort_rejects_contributor_and_older_spark():
    for model in ['muse-spark-1.3-contributor', 'muse-spark-1.2', 'muse-spark-1.1']:
        with pytest.raises(ValidationError, match='Reasoning effort max'):
            TextRun(model=model, prompt='Hi', effort='max', contributor_acknowledged=True)


def test_max_effort_allowed_for_supported_models():
    for model in ['muse-spark-1.3', 'muse-wonder-1.0']:
        assert TextRun(model=model, prompt='Hi', effort='max').effort == 'max'


def test_error_reports_parameter_and_hint_but_never_upstream_message():
    req = httpx.Request('POST', 'https://api.meta.ai/v1/responses')
    response = httpx.Response(400, request=req, json={'error': {
        'type': 'invalid_request_error', 'param': 'reasoning.effort',
        'message': 'Unsupported effort plus PRIVATE_INPUT_SHOULD_NOT_LEAK'}})
    with pytest.raises(UpstreamResponseError) as ex:
        StudioProvider._check_status(response)
    assert 'Meta API HTTP 400' in str(ex.value)
    assert 'reasoning.effort' in str(ex.value)
    assert 'PRIVATE_INPUT' not in str(ex.value)
    assert 'minimal' in str(ex.value)


def test_error_falls_back_without_leaking_unknown_param():
    response = httpx.Response(400, request=httpx.Request('POST','https://api.meta.ai/v1/responses'),
        json={'error': {'param':'sk-SECRET VALUE >>>', 'message':'private request content'}})
    with pytest.raises(UpstreamResponseError) as ex:
        StudioProvider._check_status(response)
    assert 'unspecified' in str(ex.value)
    assert 'SECRET' not in str(ex.value)
    assert 'private request' not in str(ex.value)


def test_error_429_and_403_remain_distinguishable():
    req = httpx.Request('POST','https://api.meta.ai/v1/responses')
    for code in [403, 429]:
        response = httpx.Response(code, request=req, json={'error':{'message':'no access','param':None}})
        with pytest.raises(UpstreamResponseError, match=f'Meta API HTTP {code}'):
            StudioProvider._check_status(response)


def test_unsupported_max_is_client_validation_not_billable(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'test-only')
    with TestClient(app) as client:
        response = client.post('/v1/studio/run/stream', json={'model':'muse-spark-1.2','prompt':'Hi','effort':'max'})
    assert response.status_code == 422
    assert 'Reasoning effort max' in response.text
