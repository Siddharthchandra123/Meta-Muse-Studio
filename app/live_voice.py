"""Local-only WebSocket bridge for Muse Voice Transcribe, with safe diagnostics.

The browser never receives the Meta credential. Connection errors are converted
into stable codes; sensitive upstream exception strings are never displayed.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import ssl
from contextlib import suppress
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)
META_REALTIME_URL = "wss://api.meta.ai/v1/asr/realtime"
DEFAULT_ORIGINS = (
    "http://127.0.0.1:3000", "http://localhost:3000",
    "http://127.0.0.1:3001", "http://localhost:3001",
)
ALLOWED_EVENTS = {"speechStart", "speechEnd", "speechComplete", "transcript", "error", "audioProgress"}
MAX_PCM_FRAME = 24_000 * 2
MAX_EVENT_CHARS = 6_000


class RealtimeSetupError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def allowed_origins() -> set[str]:
    """Explicit, local origins only; no wildcard or credential-bearing URLs."""
    configured = os.getenv("LIVE_VOICE_ALLOWED_ORIGINS", "").strip()
    values = configured.split(",") if configured else DEFAULT_ORIGINS
    return {value.strip().rstrip("/") for value in values if value.strip()}


def handshake(api_key: str) -> dict:
    return {
        "authorization": {"accessToken": f"Bearer {api_key}"},
        "audioEncoding": "PCM_24KHZ",
        "model": "muse-voice-transcribe-1.0",
        "mode": "ENDPOINTING",
        "partialMode": "CUMULATIVE",
    }


def safe_event(payload: object) -> dict | None:
    if not isinstance(payload, dict) or payload.get("type") not in ALLOWED_EVENTS:
        return None
    typ = payload["type"]
    result: dict = {"type": typ}
    if typ in {"transcript", "speechComplete"}:
        transcript = payload.get("transcript", "")
        if not isinstance(transcript, str):
            return None
        result["transcript"] = transcript[:4000]
    if typ == "transcript":
        result["final"] = payload.get("final") is True
    if typ in {"speechStart", "speechEnd", "speechComplete"}:
        if isinstance(payload.get("turnId"), int) and not isinstance(payload.get("turnId"), bool):
            result["turnId"] = payload["turnId"]
    if typ == "error":
        result["message"] = "Meta returned a transcription error. Check the FastAPI terminal."
        result["code"] = "META_STREAM_ERROR"
    return result


def classify_error(exc: Exception) -> str:
    # Never include raw exception text: remote text could contain private details.
    if isinstance(exc, RealtimeSetupError):
        return exc.code
    try:
        from websockets.exceptions import InvalidStatus, ConnectionClosedError, ProxyError
        if isinstance(exc, InvalidStatus):
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in {401, 403}: return "META_AUTH_OR_ACCESS"
            if status == 407: return "META_PROXY_ERROR"
            if status == 429: return "META_RATE_LIMIT"
            if status is not None: return "META_HTTP_" + str(status)
            return "META_HANDSHAKE_HTTP"
        if isinstance(exc, ProxyError): return "META_PROXY_ERROR"
        if isinstance(exc, ConnectionClosedError):
            code = getattr(getattr(exc, "rcvd", None), "code", None)
            if code == 1013: return "META_RATE_LIMIT"
            if code == 1008: return "META_AUDIO_POLICY"
            return "META_STREAM_DISCONNECTED"
    except ImportError:
        pass
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return "META_CONNECT_TIMEOUT"
    if isinstance(exc, socket.gaierror):
        return "META_DNS_ERROR"
    if isinstance(exc, ssl.SSLError):
        return "META_TLS_ERROR"
    if isinstance(exc, OSError):
        return "META_NETWORK_ERROR"
    if isinstance(exc, json.JSONDecodeError):
        return "META_BAD_HANDSHAKE"
    return "META_BRIDGE_ERROR"


ERROR_MESSAGES = {
    "MODEL_API_KEY_MISSING": "Meta API key is not loaded in this backend. Check the inner project's .env and restart FastAPI.",
    "WEBSOCKETS_MISSING": "Python websockets is missing. Run: python -m pip install 'websockets>=14,<17'.",
    "META_AUTH_OR_ACCESS": "Meta rejected the realtime WebSocket. Check Muse Voice Transcribe access and API credentials.",
    "META_RATE_LIMIT": "Meta realtime voice quota or concurrency limit reached. Retry later.",
    "META_CONNECT_TIMEOUT": "Meta realtime WebSocket timed out. Check your connection or corporate proxy.",
    "META_NETWORK_ERROR": "Cannot reach Meta's realtime WebSocket. Run the network diagnostic to check network and proxy settings.",
    "META_DNS_ERROR": "DNS lookup failed for Meta's realtime host. Check DNS, VPN and proxy settings.",
    "META_TLS_ERROR": "TLS certificate or handshake failed when connecting to Meta. Check trusted certificates and any intercepting corporate proxy.",
    "META_PROXY_ERROR": "Meta realtime WebSocket could not connect through the configured proxy. Check proxy authentication and WebSocket support.",
    "META_AUDIO_POLICY": "Meta rejected the stream or audio pacing. Use 24 kHz PCM16 and real-time frame pacing.",
    "META_BAD_HANDSHAKE": "Meta returned an unexpected handshake response.",
    "META_HANDSHAKE_REJECTED": "Meta did not acknowledge the realtime voice session. Check model access.",
    "META_STREAM_DISCONNECTED": "The upstream Meta WebSocket disconnected unexpectedly.",
    "META_STREAM_ENDED_EARLY": "The upstream voice stream ended before a full session completed.",
    "META_BRIDGE_ERROR": "Real-time voice failed on the server. Check the FastAPI terminal.",
}


def public_error(code: str) -> dict:
    return {"type": "error", "code": code,
            "message": ERROR_MESSAGES.get(code, "Meta realtime voice failed; check backend logs.")}


def local_voice_status() -> dict:
    try:
        from websockets.asyncio.client import connect  # noqa: F401
        installed = True
    except ImportError:
        installed = False
    return {"route": "/v1/voice/realtime", "key_configured": bool(os.getenv("MODEL_API_KEY", "").strip()),
            "websockets_installed": installed, "allowed_origins": sorted(allowed_origins()),
            "note": "Local startup readiness only; does not contact Meta or spend credits."}


async def relay_live_voice(ws: WebSocket) -> None:
    origin = ws.headers.get("origin", "")
    host = ws.headers.get("host", "").split(":")[0].lower()
    if origin not in allowed_origins() or host not in {"127.0.0.1", "localhost"}:
        logger.warning("Realtime voice rejected browser handshake: WS_ORIGIN_REJECTED")
        await ws.close(code=1008, reason="Local dashboard origin required")
        return

    # Accept legitimate browser connections before checking local runtime.
    # Otherwise FastAPI returns HTTP 403, rendered as opaque 1006 in browsers.
    await ws.accept()
    key = os.getenv("MODEL_API_KEY", "").strip()
    if not key:
        await ws.send_json(public_error("MODEL_API_KEY_MISSING"))
        await ws.close(code=1011)
        return
    try:
        from websockets.asyncio.client import connect
    except ImportError:
        await ws.send_json(public_error("WEBSOCKETS_MISSING"))
        await ws.close(code=1011)
        return

    client_id = str(uuid4())
    url = f"{META_REALTIME_URL}?sessionId={client_id}"
    close_code = 1000
    try:
        async with connect(url, open_timeout=30, max_size=MAX_EVENT_CHARS * 2, ping_interval=20) as upstream:
            await upstream.send(json.dumps(handshake(key)))
            first = json.loads(await asyncio.wait_for(upstream.recv(), timeout=15))
            if not isinstance(first, dict) or not first.get("sessionId"):
                raise RealtimeSetupError("META_HANDSHAKE_REJECTED")
            await ws.send_json({"type": "ready", "sessionId": client_id})
            logger.info("Realtime voice connected to Meta (session %s)", client_id[:8])

            async def mic_to_meta() -> bool:
                total_bytes = 0
                loop = asyncio.get_running_loop()
                start = loop.time()
                try:
                    while True:
                        incoming = await ws.receive()
                        if incoming["type"] == "websocket.disconnect":
                            return False
                        pcm = incoming.get("bytes")
                        if pcm is not None:
                            if not 0 < len(pcm) <= MAX_PCM_FRAME or len(pcm) % 2:
                                await ws.send_json({"type": "error", "code": "INVALID_PCM", "message": "Invalid PCM audio frame"})
                                return False
                            total_bytes += len(pcm)
                            if total_bytes > (loop.time() - start + 2) * 48_000 * 1.4:
                                await ws.send_json({"type": "error", "code": "AUDIO_PACING", "message": "Audio streamed too quickly"})
                                return False
                            await upstream.send(pcm)
                            continue
                        data = incoming.get("text")
                        try:
                            command = json.loads(data) if data else None
                        except json.JSONDecodeError:
                            command = None
                        if command == {"type": "endStream"}:
                            await upstream.send(json.dumps(command))
                            return True
                        await ws.send_json({"type": "error", "code": "INVALID_CONTROL", "message": "Unexpected control frame"})
                        return False
                except (WebSocketDisconnect, ConnectionError):
                    return False

            async def meta_to_mic() -> None:
                async for frame in upstream:
                    if not isinstance(frame, str):
                        continue
                    try:
                        incoming = json.loads(frame)
                    except json.JSONDecodeError:
                        continue
                    filtered = safe_event(incoming)
                    if filtered:
                        await ws.send_json(filtered)
                    if isinstance(incoming, dict) and incoming.get("type") == "error":
                        logger.warning("Meta realtime ASR returned an error event")

            reader = asyncio.create_task(meta_to_mic())
            writer = asyncio.create_task(mic_to_meta())
            try:
                done, _ = await asyncio.wait({reader, writer}, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    if task.exception() is not None:
                        raise task.exception()
                if reader in done and writer not in done:
                    raise RealtimeSetupError("META_STREAM_ENDED_EARLY")
                if writer in done and writer.result():
                    try:
                        await asyncio.wait_for(reader, timeout=15)
                    except asyncio.TimeoutError:
                        logger.warning("Meta realtime ASR did not close after endStream")
            finally:
                for task in (reader, writer):
                    if not task.done():
                        task.cancel()
                for task in (reader, writer):
                    with suppress(asyncio.CancelledError, Exception):
                        await task
    except Exception as exc:
        close_code = 1011
        code = classify_error(exc)
        logger.warning("Realtime voice bridge failure: %s (exception type %s)", code, type(exc).__name__)
        with suppress(Exception):
            await ws.send_json(public_error(code))
    finally:
        with suppress(Exception):
            await ws.close(code=close_code)
