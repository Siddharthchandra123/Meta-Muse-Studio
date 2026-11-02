"""MUSE Nova local-only API. Do not bind to 0.0.0.0 or expose publicly."""
import asyncio
import json
import logging
from dataclasses import dataclass, field
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID, uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, File, Form, UploadFile, WebSocket
from fastapi.responses import HTMLResponse, StreamingResponse, Response

from app.costs import usage_from_reply
from app.provider import (
    MissingApiKeyError, ModelDelta, ModelFinished, MuseProvider, UpstreamResponseError,
)
from app.schemas import ChatRequest, ChatResponse, UsageSummary
from app.live_voice import relay_live_voice, local_voice_status
from app.voice import VoiceError, VoiceUpstreamError, MAX_AUDIO_BYTES, transcribe_muse, synthesize_kokoro
from app.vision import VisionInputError, receive_images
from app.documents import DocumentInputError, receive_documents
from app.memory_api import close_workflows

load_dotenv()
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Release the persistent checkpoint connection when the ASGI app shuts down.

    Avoid deprecated Starlette add_event_handler which was removed in 1.0.
    Workflows remain lazy-initialized on first memory request.
    """
    try:
        yield
    finally:
        await close_workflows()

app = FastAPI(title="MUSE Nova", version="0.8.1", lifespan=lifespan)
from app.agent_api import router as agent_router
app.include_router(agent_router)
from app.studio import router as studio_router
app.include_router(studio_router)
from app.memory_api import router as memory_router, enabled as memory_enabled, workflows as memory_workflows
app.include_router(memory_router)
from app.rag_api import router as rag_router
app.include_router(rag_router)



@dataclass
class Conversation:
    previous_response_id: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


# Deliberately in-memory, single-process, and unauthenticated: local-only.
_sessions: dict[UUID, Conversation] = {}
_completed_calls = 0
_estimated_total_usd = 0.0
_unpriced_calls = 0


def get_provider() -> MuseProvider:
    try:
        return MuseProvider()
    except MissingApiKeyError:
        raise HTTPException(status_code=503, detail="MODEL_API_KEY is not configured")


def _session(conversation_id: UUID | None) -> tuple[UUID, Conversation]:
    if conversation_id is None:
        new_id = uuid4()
        _sessions[new_id] = Conversation()
        return new_id, _sessions[new_id]
    if conversation_id not in _sessions:
        raise HTTPException(status_code=404, detail="Unknown conversation_id")
    return conversation_id, _sessions[conversation_id]


def _account(reply):
    global _completed_calls, _estimated_total_usd, _unpriced_calls
    estimate = usage_from_reply(reply)
    _completed_calls += 1
    if estimate.estimated_cost_usd is None:
        _unpriced_calls += 1
    else:
        _estimated_total_usd += estimate.estimated_cost_usd
    return estimate


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.get("/", response_class=HTMLResponse)
async def demo():
    return (Path(__file__).parent / "static" / "index.html").read_text(encoding="utf-8")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "muse-nova-api", "version": "0.8.1"}


@app.get("/v1/usage", response_model=UsageSummary)
async def usage():
    return UsageSummary(
        completed_calls=_completed_calls,
        estimated_total_usd=round(_estimated_total_usd, 8),
        calls_without_pricing=_unpriced_calls,
        disclaimer="In-memory estimates only; not a balance, invoice, or spending limit.",
    )


async def _persistent_preflight(conversation_id: UUID | None):
    wf = await memory_workflows()
    if conversation_id and not await wf.db.thread_exists(conversation_id, 'chat'):
        raise HTTPException(status_code=404, detail='Unknown conversation_id')
    return wf


async def _persistent_events(wf, message, conversation_id, provider, images=(), documents=()):
    try:
        async for event, payload in wf.stream_chat(message, conversation_id, provider, images, documents):
            if event == 'done':
                # The global usage counter remains best effort; no fake "credit balance".
                from app.provider import ModelReply
                u = payload['usage']
                estimate = _account(ModelReply(
                    answer=payload['answer'], model=payload['model'],
                    response_id=payload['provider_response_id'],
                    input_tokens=u.get('input_tokens'), output_tokens=u.get('output_tokens'),
                    cached_input_tokens=u.get('cached_input_tokens')))
                payload['usage'] = estimate.model_dump()
            yield event, payload
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning('Persistent chat failed: %s', type(exc).__name__)
        message = 'Persistent chat failed. Check PostgreSQL and FastAPI logs.'
        if isinstance(exc, UpstreamResponseError) and str(exc) == 'Meta stream incomplete: max_output_tokens':
            message = 'Muse output limit reached. Increase MAX_OUTPUT_TOKENS and retry.'
        yield 'error', {'message':message}


def _persistent_sse(events):
    async def encode():
        async for name, data in events:
            yield _sse(name, data)
    return StreamingResponse(encode(), media_type='text/event-stream',
        headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, provider: MuseProvider = Depends(get_provider)):
    if memory_enabled():
        wf = await _persistent_preflight(payload.conversation_id)
        completed = None
        async for event, data in _persistent_events(wf, payload.message, payload.conversation_id, provider):
            if event == 'done':
                completed = data
            if event == 'error':
                raise HTTPException(status_code=502, detail=data['message'])
        if not completed:
            raise HTTPException(status_code=502, detail='Persistent chat produced no completed response')
        return ChatResponse(conversation_id=UUID(completed['conversation_id']),
            answer=completed['answer'], model=completed['model'],
            provider_response_id=completed['provider_response_id'],usage=completed['usage'])
    conversation_id, session = _session(payload.conversation_id)
    async with session.lock:
        try:
            reply = await provider.generate(payload.message, session.previous_response_id)
        except Exception as exc:
            logger.warning("Model provider error: %s", str(exc) if isinstance(exc, UpstreamResponseError) else type(exc).__name__)
            raise HTTPException(status_code=502, detail="Model provider request failed")
        if not reply.response_id:
            raise HTTPException(status_code=502, detail="Provider returned no conversation state")
        session.previous_response_id = reply.response_id
        return ChatResponse(
            conversation_id=conversation_id,
            answer=reply.answer,
            model=reply.model,
            provider_response_id=reply.response_id,
            usage=_account(reply),
        )


@app.post("/v1/chat/stream")
async def chat_stream(payload: ChatRequest, provider: MuseProvider = Depends(get_provider)):
    if memory_enabled():
        wf = await _persistent_preflight(payload.conversation_id)
        return _persistent_sse(_persistent_events(wf, payload.message, payload.conversation_id, provider))
    conversation_id, session = _session(payload.conversation_id)

    async def events():
        async with session.lock:
            yield _sse("session", {"conversation_id": str(conversation_id)})
            try:
                async for item in provider.stream(payload.message, session.previous_response_id):
                    if isinstance(item, ModelDelta):
                        yield _sse("delta", {"text": item.text})
                    elif isinstance(item, ModelFinished):
                        reply = item.reply
                        if not reply.response_id:
                            raise ValueError("Provider returned no conversation state")
                        # Commit only after successful terminal event, not partial text.
                        session.previous_response_id = reply.response_id
                        estimate = _account(reply)
                        yield _sse("done", {
                            "answer": reply.answer,
                            "conversation_id": str(conversation_id),
                            "provider_response_id": reply.response_id,
                            "model": reply.model,
                            "usage": estimate.model_dump(),
                        })
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Streaming provider error: %s", str(exc) if isinstance(exc, UpstreamResponseError) else type(exc).__name__)
                message = "Model stream failed. Check the FastAPI terminal."
                if isinstance(exc, UpstreamResponseError):
                    safe_reason = str(exc)
                    if safe_reason == "Meta stream incomplete: max_output_tokens":
                        message = ("Muse reached the output token limit. Increase MAX_OUTPUT_TOKENS "
                                   "to 4096 and use MUSE_REASONING_EFFORT=minimal in backend .env; "
                                   "restart FastAPI.")
                    elif safe_reason.startswith("Meta API HTTP "):
                        message = safe_reason + ". Check API permissions, quota, and backend settings."
                yield _sse("error", {"message": message})

    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post('/v1/chat/vision/stream')
async def vision_stream(
    message: str = Form(..., min_length=1, max_length=4000),
    conversation_id: UUID | None = Form(default=None),
    images: list[UploadFile] = File(...),
    provider: MuseProvider = Depends(get_provider),
):
    """One or more images plus text in the same provider session; SSE contract unchanged."""
    try:
        safe_images = await receive_images(images)
    except VisionInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if memory_enabled():
        wf = await _persistent_preflight(conversation_id)
        return _persistent_sse(_persistent_events(wf, message.strip(), conversation_id, provider, safe_images))
    conversation_id, session = _session(conversation_id)

    async def events():
        async with session.lock:
            yield _sse('session', {'conversation_id': str(conversation_id)})
            try:
                async for item in provider.stream(message.strip(), session.previous_response_id, safe_images):
                    if isinstance(item, ModelDelta):
                        yield _sse('delta', {'text': item.text})
                    elif isinstance(item, ModelFinished):
                        reply = item.reply
                        if not reply.response_id:
                            raise ValueError('Provider returned no conversation state')
                        session.previous_response_id = reply.response_id
                        estimate = _account(reply)
                        yield _sse('done', {
                            'answer': reply.answer,
                            'conversation_id': str(conversation_id),
                            'provider_response_id': reply.response_id,
                            'model': reply.model,
                            'usage': estimate.model_dump(),
                        })
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning('Vision provider error: %s', str(exc) if isinstance(exc, UpstreamResponseError) else type(exc).__name__)
                error_message = 'Vision model stream failed. Check the FastAPI terminal.'
                if isinstance(exc, UpstreamResponseError):
                    if str(exc).startswith('Meta API HTTP '):
                        error_message = str(exc) + '. Check model access and limits.'
                    elif str(exc) == 'Meta stream incomplete: max_output_tokens':
                        error_message = 'Muse reached its output limit. Set MAX_OUTPUT_TOKENS=4096 and MUSE_REASONING_EFFORT=minimal in .env; restart FastAPI and retry.'
                yield _sse('error', {'message': error_message})

    return StreamingResponse(events(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.post('/v1/chat/multimodal/stream')
async def multimodal_stream(
    message: str = Form(..., min_length=1, max_length=4000),
    conversation_id: UUID | None = Form(default=None),
    images: list[UploadFile] | None = File(default=None),
    documents: list[UploadFile] | None = File(default=None),
    provider: MuseProvider = Depends(get_provider),
):
    """Unified text + images + PDFs/DOCX/TXT/MD/CSV, same SSE and conversation semantics."""
    if not images and not documents:
        raise HTTPException(status_code=422, detail='Attach at least one image or document.')
    try:
        safe_images = await receive_images(images) if images else ()
        safe_docs = await receive_documents(documents)
    except (VisionInputError, DocumentInputError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if memory_enabled():
        wf = await _persistent_preflight(conversation_id)
        return _persistent_sse(_persistent_events(wf, message.strip(), conversation_id, provider, safe_images, safe_docs))
    conversation_id, session = _session(conversation_id)

    async def events():
        async with session.lock:
            yield _sse('session', {'conversation_id': str(conversation_id)})
            try:
                async for item in provider.stream(message.strip(), session.previous_response_id,
                                                  safe_images, safe_docs):
                    if isinstance(item, ModelDelta):
                        yield _sse('delta', {'text': item.text})
                    elif isinstance(item, ModelFinished):
                        reply = item.reply
                        if not reply.response_id:
                            raise ValueError('Provider returned no conversation state')
                        session.previous_response_id = reply.response_id
                        yield _sse('done', {
                            'answer': reply.answer,
                            'conversation_id': str(conversation_id),
                            'provider_response_id': reply.response_id,
                            'model': reply.model,
                            'usage': _account(reply).model_dump(),
                        })
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning('Multimodal provider error: %s',
                               str(exc) if isinstance(exc, UpstreamResponseError) else type(exc).__name__)
                error_message = 'Multimodal request failed. Check FastAPI terminal.'
                if isinstance(exc, UpstreamResponseError):
                    if str(exc).startswith('Meta API HTTP '):
                        error_message = str(exc) + '. Check model access and document support.'
                    elif str(exc) == 'Meta stream incomplete: max_output_tokens':
                        error_message = 'Muse output limit reached. Set MAX_OUTPUT_TOKENS=4096 and MUSE_REASONING_EFFORT=minimal in .env; restart FastAPI and retry.'
                yield _sse('error', {'message': error_message})

    return StreamingResponse(events(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.post("/v1/voice/transcribe")
async def voice_transcribe(audio: UploadFile = File(...)):
    """Local-only, explicit push-to-talk upload; audio is never persisted here."""
    try:
        audio_data = await audio.read(MAX_AUDIO_BYTES + 1)
        return await transcribe_muse(audio_data)
    except VoiceUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except VoiceError as exc:
        raise HTTPException(status_code=413 if len(audio_data) > MAX_AUDIO_BYTES else 422,
                            detail=str(exc)) from exc
    finally:
        await audio.close()


from pydantic import BaseModel, Field

class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    voice: str = 'af_heart'


_speech_lock = asyncio.Lock()

@app.post("/v1/voice/synthesize")
async def voice_synthesize(request: SpeechRequest):
    async with _speech_lock:
        try:
            data = await asyncio.to_thread(synthesize_kokoro, request.text, request.voice)
        except VoiceError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(data, media_type="audio/wav", headers={"Cache-Control":"no-store"})


@app.websocket("/v1/voice/realtime")
async def voice_realtime(socket: WebSocket):
    """Local WS -> Meta ASR relay; browser never sees the API key."""
    await relay_live_voice(socket)


@app.get("/v1/voice/realtime/status")
async def realtime_status():
    """Safe localhost diagnostic: no Meta request or token disclosure."""
    return local_voice_status()
