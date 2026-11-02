"""Offline tests for Muse Studio. All external requests are mocked."""
import asyncio
import base64
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.main import app
from app import studio
from app.provider import ModelDelta, ModelFinished, ModelReply


def setup_key(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY','fake-local-only-test-key')
    monkeypatch.setenv('MUSE_BASE_URL','https://api.meta.ai/v1')


def test_catalog_contains_hosted_and_not_hosted(monkeypatch):
    setup_key(monkeypatch)
    assert studio.MODEL_MAP['muse-spark-1.3']['api']
    assert not studio.MODEL_MAP['muse-glimmer-30b']['api']
    assert not studio.MODEL_MAP['muse-wonder-full']['api']
    assert studio.MODEL_MAP['muse-voice-transcribe-1.0']['family']=='audio'


def test_muse_studio_request_guards(monkeypatch):
    setup_key(monkeypatch)
    with pytest.raises(ValidationError, match='Model does not support'):
        studio.TextRun(model='muse-glimmer-30b',prompt='Hello')
    with pytest.raises(ValidationError, match='Contributor data-use'):
        studio.TextRun(model='muse-spark-1.3-contributor',prompt='Hello')
    with pytest.raises(ValidationError, match='SAM requires'):
        studio.TextRun(model='sam-3.1',prompt='glasses')
    with pytest.raises(ValidationError):
        studio.TextRun(model='muse-spark-1.3',prompt='Hello',max_output_tokens=50000)
    good=studio.TextRun(model='muse-spark-1.3-contributor',prompt='Hi',contributor_acknowledged=True)
    assert good.model.endswith('contributor')


def test_studio_provider_changes_only_its_own_model_config(monkeypatch):
    setup_key(monkeypatch)
    run=studio.TextRun(model='muse-wonder-1.0',prompt='Hi',instructions='Give concise answers.',max_output_tokens=2048,effort='high')
    p=studio.StudioProvider(run)
    request=p._params('Hi',None)
    assert request['model']=='muse-wonder-1.0'
    assert request['instructions']=='Give concise answers.'
    assert request['reasoning']=={'effort':'high'}
    assert request['max_output_tokens']==2048
    assert request['store'] is True


def test_sam_provider_has_no_reasoning(monkeypatch):
    setup_key(monkeypatch)
    run=studio.TextRun(model='sam-3.1',prompt='glasses',image_data_url='data:image/png;base64,abcd')
    p=studio.StudioProvider(run)
    params=p._params('glasses',None)
    assert 'reasoning' not in params and 'instructions' not in params


def test_decode_image_bad_type_or_invalid_payload():
    with pytest.raises(ValueError,match='Only PNG'):
        studio.decode_image('data:image/svg+xml;base64,YWJj')
    with pytest.raises(ValueError,match='base64'):
        studio.decode_image('data:image/png;base64,not-a-base64:::')
    png=b'\x89PNG\r\n\x1a\n' + b'0000000000IEND' # illustrative signature only
    decoded=studio.decode_image('data:image/png;base64,'+base64.b64encode(png).decode())
    assert decoded[0].mime=='image/png'
    assert decoded[0].data==png


def test_studio_api_validation_does_not_call_model(monkeypatch):
    setup_key(monkeypatch)
    client=TestClient(app)
    bad=client.post('/v1/studio/run/stream',json={'model':'muse-glimmer-30b','prompt':'hello'})
    assert bad.status_code==422
    assert 'Model' in str(bad.json())
    bad=client.post('/v1/studio/run/stream',json={'model':'sam-3.1','prompt':'glasses'})
    assert bad.status_code==422


def test_studio_api_staging_stream(monkeypatch):
    setup_key(monkeypatch)
    async def fake_stream(self,*args,**kwargs):
        assert self.model=='muse-spark-1.3'
        yield ModelDelta('Hello ')
        yield ModelFinished(ModelReply(answer='Hello world',model=self.model,response_id='resp_123',input_tokens=13,output_tokens=19))
    monkeypatch.setattr(studio.StudioProvider,'stream',fake_stream)
    with TestClient(app) as client:
        result=client.post('/v1/studio/run/stream',json={'model':'muse-spark-1.3','prompt':'Hello'})
    assert result.status_code==200
    assert 'event: delta' in result.text
    assert 'Hello world' in result.text
    assert 'resp_123' in result.text


@pytest.mark.asyncio
async def test_catalog_availability_no_credit_inference(monkeypatch):
    setup_key(monkeypatch)
    studio._catalog_cache.update(expiry=0,ids=None,error=None)
    original=httpx.AsyncClient
    class FakeClient:
        async def __aenter__(self):return self
        async def __aexit__(self,*exc):pass
        async def get(self,url,headers):
            assert url.endswith('/models')
            assert headers['Authorization']=='Bearer fake-local-only-test-key'
            return httpx.Response(200,json={'data':[{'id':'muse-spark-1.3'},{'id':'muse-image-1.0'}]})
    monkeypatch.setattr(studio.httpx,'AsyncClient',lambda **kwargs:FakeClient())
    payload=await studio.list_studio_models()
    assert next(x for x in payload['models'] if x['id']=='muse-spark-1.3')['availability']=='listed'
    assert next(x for x in payload['models'] if x['id']=='muse-wonder-1.0')['availability']=='not-listed'
    assert next(x for x in payload['models'] if x['id']=='muse-glimmer-30b')['availability']=='requires-local-deployment'
    studio._catalog_cache['expiry']=0


@pytest.mark.asyncio
async def test_image_generate_mock(monkeypatch):
    setup_key(monkeypatch)
    class Fake:
        async def __aenter__(self):return self
        async def __aexit__(self,*e):pass
        async def post(self,url,headers,json):
            assert url.endswith('/images/generations')
            assert json['model']=='muse-image-1.0'
            assert json['n']==1
            return httpx.Response(200,json={'data':[{'b64_json':'YWJj'}]})
    monkeypatch.setattr(studio.httpx,'AsyncClient',lambda **kwargs:Fake())
    out=await studio.studio_image_generate(studio.ImageRun(prompt='A colorful fox'))
    assert out['image_data_url'].endswith('YWJj')


def test_meta_base_disallows_unexpected_hosts(monkeypatch):
    monkeypatch.setenv('MUSE_BASE_URL','http://attacker.test')
    from fastapi import HTTPException
    with pytest.raises(HTTPException):studio._meta_base_url()


@pytest.mark.asyncio
async def test_catalog_includes_new_meta_models_without_allowing_unconfigured_execution(monkeypatch):
    setup_key(monkeypatch)
    studio._catalog_cache.update(expiry=999999999999,ids={'muse-spark-1.3','future-model-7'},error=None)
    payload=await studio.list_studio_models()
    assert payload['catalog_status']=='live'
    new=next(m for m in payload['models'] if m['id']=='future-model-7')
    assert new['availability']=='listed' and new['api'] is False
    assert new['family']=='other' and new['mode']=='unconfigured'
    known=next(m for m in payload['models'] if m['id']=='muse-spark-1.3')
    assert known['endpoint']=='Responses API'
    assert 'Vision' in known['capabilities']
    with pytest.raises(ValidationError,match='Model does not support'):
        studio.TextRun(model='future-model-7',prompt='Hi')
    studio._catalog_cache['expiry']=0


@pytest.mark.asyncio
async def test_catalog_without_meta_entitlement_is_explicitly_unverified(monkeypatch):
    setup_key(monkeypatch)
    studio._catalog_cache.update(expiry=999999999999,ids=None,error='Meta model listing HTTP 401')
    payload=await studio.list_studio_models()
    assert payload['catalog_status']=='unverified'
    assert payload['listing_error']=='Meta model listing HTTP 401'
    known=next(m for m in payload['models'] if m['id']=='muse-spark-1.3')
    assert known['availability']=='unverified'
    studio._catalog_cache['expiry']=0
