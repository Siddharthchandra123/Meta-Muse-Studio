"""Phase 4.1: image validation, no-disk-storage payload and SSE session continuity."""
import base64
import json
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.vision import ImageData, VisionInputError, receive_images, MAX_IMAGE_BYTES
from app.provider import ModelDelta, ModelFinished, ModelReply, MuseProvider
from starlette.datastructures import UploadFile, Headers
import io

PNG = b'\x89PNG\r\n\x1a\n' + b'test-IEND\xaeB`\x82'
JPEG = b'\xff\xd8\xff\xe0fake content\xff\xd9'
WEBP = b'RIFF' + b'\x10\x00\x00\x00' + b'WEBP' + b'VP8X'+b'abcde'


def uploaded(name, mime, data):
    return UploadFile(filename=name, file=io.BytesIO(data), headers=Headers({'content-type':mime}))


@pytest.mark.asyncio
async def test_validate_image_signatures():
    result = await receive_images([
        uploaded('a.png', 'image/png', PNG),
        uploaded('b.jpeg', 'image/jpeg', JPEG),
        uploaded('c.webp', 'image/webp', WEBP),
    ])
    assert [(item.mime,len(item.data)) for item in result] == [
        ('image/png', len(PNG)), ('image/jpeg',len(JPEG)), ('image/webp',len(WEBP))]


@pytest.mark.asyncio
async def test_reject_wrong_types_or_bad_bytes():
    for mime,data in [('image/png',b'not a png'),('image/svg+xml', b'<svg/>'),
                      ('image/jpeg', PNG), ('image/webp', b'bad')]:
        with pytest.raises(VisionInputError):
            await receive_images([uploaded('x',mime,data)])


@pytest.mark.asyncio
async def test_reject_too_many_and_too_large():
    with pytest.raises(VisionInputError):
        await receive_images([uploaded(str(i), 'image/png', PNG) for i in range(4)])
    with pytest.raises(VisionInputError):
        await receive_images([uploaded('large.png', 'image/png', PNG + b'0' * MAX_IMAGE_BYTES)])


def test_muse_payload_uses_responses_image_blocks_without_sdk(monkeypatch):
    monkeypatch.setenv('MODEL_API_KEY', 'fake-test-only')
    provider = MuseProvider()
    params = provider._params('What is shown?', None, (ImageData('image/png',PNG),))
    assert params['input'][0]['role'] == 'user'
    parts = params['input'][0]['content']
    assert parts[0] == {'type':'input_text','text':'What is shown?'}
    assert parts[1]['type'] == 'input_image'
    assert parts[1]['image_url'] == 'data:image/png;base64,' + base64.b64encode(PNG).decode()
    assert 'previous_response_id' not in params
    followup = provider._params('What color?', 'resp-first')
    assert followup['input'] == 'What color?'
    assert followup['previous_response_id'] == 'resp-first'


class VisionProvider:
    def __init__(self):
        self.images = None
    async def stream(self, message, previous_response_id, images=()):
        self.images = images
        assert previous_response_id is None
        assert message == 'Analyze the image'
        yield ModelDelta('A chart')
        yield ModelFinished(ModelReply('A chart','muse-spark-1.3','vision-response-1',100,30,0))
    async def generate(self, message, previous_response_id):
        assert previous_response_id == 'vision-response-1'
        return ModelReply('Followup works', 'muse-spark-1.3','vision-response-2',80,22,0)


def test_multipart_vision_stream_and_followup():
    fake = VisionProvider()
    main.app.dependency_overrides[main.get_provider] = lambda: fake
    try:
        with TestClient(main.app) as client:
            r = client.post('/v1/chat/vision/stream', data={'message':'Analyze the image'},
                            files=[('images',('figure.png', PNG,'image/png'))])
            assert r.status_code == 200
            assert 'event: delta' in r.text
            assert 'event: done' in r.text
            assert len(fake.images) == 1
            assert fake.images[0].data == PNG
            session = json.loads(r.text.split('data: ')[1].split('\n')[0])['conversation_id']
            follow = client.post('/v1/chat', json={'message':'Followup','conversation_id':session})
            assert follow.status_code == 200
            assert follow.json()['answer'] == 'Followup works'
    finally:
        main.app.dependency_overrides.clear()


def test_image_invalid_returns_422_before_provider_request():
    fake = VisionProvider()
    main.app.dependency_overrides[main.get_provider] = lambda: fake
    try:
        with TestClient(main.app) as client:
            r=client.post('/v1/chat/vision/stream', data={'message':'Analyze'},
                          files=[('images',('bad.png',b'hello','image/png'))])
            assert r.status_code==422
            assert fake.images is None
            r=client.post('/v1/chat/vision/stream', data={'message':'Analyze'},
                          files=[('images',('evil.svg',b'<svg/>','image/svg+xml'))])
            assert r.status_code==422
    finally:
        main.app.dependency_overrides.clear()


def test_unknown_vision_conversation_returns_404():
    fake = VisionProvider()
    main.app.dependency_overrides[main.get_provider] = lambda: fake
    try:
        with TestClient(main.app) as client:
            r=client.post('/v1/chat/vision/stream', data={'message':'Analyze','conversation_id':str(uuid4())},
                          files=[('images',('figure.png',PNG,'image/png'))])
            assert r.status_code==404
    finally:
        main.app.dependency_overrides.clear()
