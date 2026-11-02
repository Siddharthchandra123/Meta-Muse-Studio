"""Muse Studio: local-only model catalog and typed Meta Model API playground.

Do not expose this router on a public network. This is a single-developer prototype.
The Meta key is held solely by FastAPI; browser endpoints never accept a key.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import os
import re
import time
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Form, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator

from app.provider import MuseProvider, ModelDelta, ModelFinished, MissingApiKeyError, UpstreamResponseError
from app.vision import ImageData

router = APIRouter(prefix='/v1/studio', tags=['Muse Studio'])
logger = logging.getLogger(__name__)

# Curated capabilities, not claims about an individual account's entitlements.
MODELS = [
    dict(id='muse-wonder-1.0', name='Muse Wonder', family='reasoning', mode='api', api=True, description='Advanced reasoning, coding and long-horizon agents.'),
    dict(id='muse-spark-1.3', name='Muse Spark 1.3', family='reasoning', mode='api', api=True, description='Default multimodal and agentic reasoning.'),
    dict(id='muse-spark-1.2', name='Muse Spark 1.2', family='reasoning', mode='api', api=True, description='Previous coding and reasoning model.'),
    dict(id='muse-spark-1.1', name='Muse Spark 1.1', family='reasoning', mode='api', api=True, description='Earlier general multimodal reasoning model.'),
    dict(id='muse-spark-1.3-contributor', name='Spark 1.3 Contributor', family='reasoning', mode='contributor', api=True, description='Contributor service; supplied content may be used for model improvement.'),
    dict(id='muse-spark-1.2-contributor', name='Spark 1.2 Contributor', family='reasoning', mode='contributor', api=True, description='Contributor service; supplied content may be used for model improvement.'),
    dict(id='muse-image-1.0', name='Muse Image', family='image', mode='api', api=True, description='Generate or edit images from text and references.'),
    dict(id='muse-voice-transcribe-1.0', name='Muse Voice Transcribe', family='audio', mode='api', api=True, description='File and realtime speech recognition.'),
    dict(id='sam-3.1', name='SAM 3.1', family='segmentation', mode='api', api=True, description='Image segmentation and video object tracking.'),
    dict(id='muse-glimmer-30b', name='Muse Glimmer 30B', family='local', mode='self-hosted', api=False, description='Open-weight local model; requires a configured inference service.'),
    dict(id='muse-spark-open', name='Muse Spark Open', family='local', mode='self-hosted', api=False, description='Open-weight large model; requires external GPU infrastructure.'),
    dict(id='muse-wonder-full', name='Muse Wonder Full', family='reasoning', mode='muse-code-only', api=False, description='Muse Code subscription model, not in the Model API.'),
]
MODEL_MAP = {m['id']: m for m in MODELS}
TEXT_MODELS = {m['id'] for m in MODELS if m['family'] == 'reasoning' and m['api']}
MAX_REASONING_MODELS = {'muse-wonder-1.0', 'muse-spark-1.3'}

_catalog_cache: dict = {'expiry': 0.0, 'ids': None, 'error': None}


def _meta_base_url() -> str:
    base = os.getenv('MUSE_BASE_URL', 'https://api.meta.ai/v1').rstrip('/')
    # Enforce hosted Meta API for this Studio; never use arbitrary URLs supplied by browser.
    if base != 'https://api.meta.ai/v1':
        raise HTTPException(status_code=503, detail='Muse Studio requires MUSE_BASE_URL=https://api.meta.ai/v1')
    return base


def _key() -> str:
    key = os.getenv('MODEL_API_KEY', '').strip()
    if not key:
        raise HTTPException(status_code=503, detail='MODEL_API_KEY not configured in FastAPI .env')
    return key


async def _remote_models() -> tuple[set[str] | None, str | None]:
    # Cache one minute; model catalog doesn't require spending inference credits.
    now = time.monotonic()
    if _catalog_cache['expiry'] > now:
        return _catalog_cache['ids'], _catalog_cache['error']
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=5), follow_redirects=False) as client:
            r = await client.get(_meta_base_url()+'/models', headers={'Authorization': f'Bearer {_key()}'})
        if r.status_code != 200:
            raise ValueError(f'Meta model listing HTTP {r.status_code}')
        data = r.json()
        ids = {item['id'] for item in data.get('data', []) if isinstance(item, dict) and isinstance(item.get('id'), str)}
        if not ids: raise ValueError('Meta model listing was empty')
        error = None
    except Exception as exc:
        ids = None
        error = str(exc) if isinstance(exc, ValueError) else 'Unable to check models for this account'
    _catalog_cache.update(expiry=now+60, ids=ids, error=error)
    return ids, error


@router.get('/models')
async def list_studio_models():
    live_ids, error = await _remote_models()
    entries = [
        {**m, 'availability': ('requires-local-deployment' if m['mode']=='self-hosted'
                                    else 'muse-code-only' if not m['api']
                                    else 'unverified' if live_ids is None
                                    else 'listed' if m['id'] in live_ids
                                    else 'not-listed'),
         'capabilities': {
             'reasoning':['Text','Vision','Documents','Tool calling'],
             'image':['Image generation','Image editing'],
             'audio':['Speech transcription','Realtime speech'],
             'segmentation':['Image segmentation','Video tracking'],
             'local':['Open-weight deployment'],
         }.get(m['family'], []),
         'endpoint': {'reasoning':'Responses API','image':'Image API',
                      'audio':'Transcriptions API','segmentation':'Segmentation API',
                      'local':'Self-hosted'}.get(m['family'],'Unverified')}
        for m in MODELS
    ]
    # List every additional ID returned by the actual account, but never claim an
    # unknown model can be run through our curated text/image adapters.
    if live_ids is not None:
        for model_id in sorted(live_ids - set(MODEL_MAP)):
            entries.append({'id':model_id,'name':model_id,'family':'other',
                            'mode':'unconfigured','api':False,
                            'description':'Reported by Meta /models; no local adapter configured.',
                            'availability':'listed','capabilities':[],
                            'endpoint':'Unverified'})
    return {'models': entries, 'listing_error': error,
            'catalog_status': 'live' if live_ids is not None else 'unverified',
            'disclaimer': 'The catalog is refreshed from Meta /models and does not prove model-level permissions. Unrecognized models are listed without a Run action. No API credits balance is available.'}


def decode_image(data_url: str | None) -> tuple[ImageData, ...]:
    if not data_url: return ()
    if len(data_url) > 7_200_000: raise ValueError('Image too large; maximum 5 MiB.')
    try:
        head, encoded = data_url.split(',', 1)
        if head not in ('data:image/png;base64', 'data:image/jpeg;base64', 'data:image/webp;base64'):
            raise ValueError('Only PNG, JPEG and WebP images are accepted.')
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > 4 * 1024 * 1024: raise ValueError('Image must be under 5 MiB.')
        if (head.endswith('png;base64') and not (raw.startswith(b'\x89PNG\r\n\x1a\n') and b'IEND' in raw[-24:])) or (head.endswith('jpeg;base64') and not (raw.startswith(b'\xff\xd8\xff') and raw.endswith(b'\xff\xd9'))) or (head.endswith('webp;base64') and not (raw[0:4] == b'RIFF' and raw[8:12]==b'WEBP')):
            raise ValueError('Image does not match its declared media type.')
        return (ImageData(mime=head.removeprefix('data:').removesuffix(';base64'), data=raw),)
    except (binascii.Error, TypeError) as exc:
        raise ValueError('Invalid base64 image.') from exc


class TextRun(BaseModel):
    model: str
    prompt: str = Field(min_length=1, max_length=12000)
    instructions: str = Field(default='You are a helpful and accurate AI assistant.', max_length=6000)
    effort: Literal['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] = 'minimal'
    max_output_tokens: int = Field(default=2048, ge=64, le=8192)
    previous_response_id: str | None = Field(default=None, max_length=200)
    image_data_url: str | None = None
    contributor_acknowledged: bool = False

    @model_validator(mode='after')
    def valid_model(self):
        if self.model not in TEXT_MODELS and self.model != 'sam-3.1':
            raise ValueError('Model does not support this playground mode.')
        if self.effort == 'max' and self.model not in MAX_REASONING_MODELS:
            raise ValueError('Reasoning effort max is only supported for Muse Spark 1.3 Standard and Muse Wonder; select xhigh or lower.')
        if self.model.endswith('-contributor') and not self.contributor_acknowledged:
            raise ValueError('Confirm Contributor data-use terms before running.')
        if self.model == 'sam-3.1' and not self.image_data_url:
            raise ValueError('SAM requires an attached image and a short object name.')
        if self.model == 'sam-3.1' and self.previous_response_id:
            raise ValueError('SAM runs are independent; remove previous_response_id.')
        return self


class StudioProvider(MuseProvider):
    def __init__(self, run: TextRun):
        super().__init__()
        self.model=run.model
        self.max_tokens=run.max_output_tokens
        self.reasoning_effort=run.effort
        self.studio_instructions=run.instructions

    @staticmethod
    def _check_status(response: httpx.Response) -> None:
        if not response.is_error:
            return
        status = response.status_code
        error = {}
        try:
            payload = response.json()
            error = payload.get('error', {}) if isinstance(payload, dict) else {}
        except (ValueError, TypeError):
            pass
        if not isinstance(error, dict):
            error = {}
        # Meta may echo user input in an error message. Never forward arbitrary
        # upstream text into the browser or server log. Keep only short safe IDs.
        param = error.get('param')
        param = param if isinstance(param, str) and re.fullmatch(r'[a-zA-Z0-9_.\[\]-]{1,64}', param) else 'unspecified'
        raw_message = error.get('message')
        words = (param + ' ' + (raw_message if isinstance(raw_message, str) else '')).lower()
        if 'reasoning' in words or 'effort' in words:
            hint = 'Reasoning setting unsupported for this model; use minimal or low.'
        elif 'max_output_tokens' in words or 'max_tokens' in words:
            hint = 'Output token budget invalid or too large; try 512.'
        elif 'context' in words or 'token limit' in words:
            hint = 'The prompt plus output allowance may exceed the model context; shorten the prompt.'
        elif 'model' in words:
            hint = 'Check model ID and availability in the Studio catalog.'
        elif 'previous_response_id' in words:
            hint = 'The stored conversation may be unavailable; start a new Studio conversation.'
        elif 'temperature' in words or 'top_p' in words:
            hint = 'Sampling parameters are invalid; restore their defaults.'
        else:
            hint = 'Meta rejected request parameters; see local direct diagnostic for details.'
        raise UpstreamResponseError(f'Meta API HTTP {status} (param: {param}). {hint}')

    def _params(self, message, previous_response_id, images=(), documents=()):
        params=super()._params(message, previous_response_id, images, documents)
        if self.model == 'sam-3.1':
            # SAM is a segmentation response, not a reasoning conversation.
            return {k:v for k,v in params.items() if k in ('model','input','store')}
        params['instructions'] = self.studio_instructions
        return params


def _sse(event: str, data: dict) -> str:
    return f'event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n'


@router.post('/run/stream')
async def run_studio_stream(run: TextRun):
    try:
        imgs=decode_image(run.image_data_url)
        _meta_base_url()
        provider=StudioProvider(run)
    except (ValueError, MissingApiKeyError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    async def events():
        try:
            async for item in provider.stream(run.prompt, run.previous_response_id, imgs):
                if isinstance(item, ModelDelta):
                    yield _sse('delta', {'text':item.text})
                elif isinstance(item, ModelFinished):
                    reply=item.reply
                    yield _sse('done', {'answer':reply.answer,'model':reply.model,'response_id':reply.response_id,
                                         'usage':{'input_tokens':reply.input_tokens,'output_tokens':reply.output_tokens,'cached_input_tokens':reply.cached_input_tokens}})
        except asyncio.CancelledError: raise
        except Exception as exc:
            safe = str(exc) if isinstance(exc,UpstreamResponseError) else type(exc).__name__
            logger.warning('Studio model failed: %s', safe)
            msg = safe if safe.startswith('Meta API HTTP ') or safe.startswith('Meta stream incomplete') else 'Studio request failed; inspect backend logs.'
            yield _sse('error', {'message':msg})
    return StreamingResponse(events(),media_type='text/event-stream',headers={'Cache-Control':'no-store','X-Accel-Buffering':'no'})


class ImageRun(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    size: Literal['1024x1024','1536x1024','1024x1536'] = '1024x1024'
    output_format: Literal['png','webp','jpeg'] = 'png'


@router.post('/image/generate')
async def studio_image_generate(run: ImageRun):
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=12), follow_redirects=False) as client:
        try:
            res = await client.post(_meta_base_url()+'/images/generations',
                headers={'Authorization':f'Bearer {_key()}'},
                json={'model':'muse-image-1.0','prompt':run.prompt,'size':run.size,'n':1,'response_format':'b64_json','output_format':run.output_format})
        except httpx.HTTPError as exc:
            logger.warning('Studio image transport: %s',type(exc).__name__)
            raise HTTPException(status_code=502,detail='Unable to reach Muse Image.') from exc
    if res.status_code!=200:
        raise HTTPException(status_code=502,detail=f'Muse Image HTTP {res.status_code}')
    data = res.json().get('data') or []
    if not data or not isinstance(data[0].get('b64_json'),str):
        raise HTTPException(status_code=502,detail='Muse Image returned no encoded image.')
    return {'model':'muse-image-1.0','image_data_url':f"data:image/{'jpeg' if run.output_format=='jpeg' else run.output_format};base64,{data[0]['b64_json']}"}

@router.post('/image/edit')
async def studio_image_edit(prompt: str = Form(...), image: UploadFile = File(...)):
    """One-shot Muse Image edit. Reuse the existing local-only, validated upload contract."""
    from app.vision import receive_images, VisionInputError
    if not 3 <= len(prompt.strip()) <= 4000:
        raise HTTPException(status_code=422, detail='Prompt must contain 3–4000 characters.')
    try:
        images = await receive_images([image])
    except VisionInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    img=images[0]
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=12), follow_redirects=False) as client:
        try:
            response=await client.post(_meta_base_url()+'/images/edits',
                headers={'Authorization':f'Bearer {_key()}'},
                data={'model':'muse-image-1.0','prompt':prompt.strip(),'n':'1','response_format':'b64_json','output_format':'png'},
                files={'image':('upload.png' if img.mime=='image/png' else 'upload.jpg' if img.mime=='image/jpeg' else 'upload.webp',img.data,img.mime)})
        except httpx.HTTPError as exc:
            logger.warning('Studio image edit transport: %s',type(exc).__name__)
            raise HTTPException(status_code=502,detail='Unable to reach Muse Image editing.') from exc
    if response.status_code!=200:
        raise HTTPException(status_code=502,detail=f'Muse Image edit HTTP {response.status_code}')
    data=response.json().get('data') or []
    if not data or not isinstance(data[0].get('b64_json'),str):
        raise HTTPException(status_code=502,detail='Muse Image returned no encoded edit.')
    return {'model':'muse-image-1.0','image_data_url':f"data:image/png;base64,{data[0]['b64_json']}"}
