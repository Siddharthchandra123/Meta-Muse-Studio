"""Voice adapters. Never forward the API key to the browser.

Phase 3.1 deliberately uses push-to-talk recordings rather than claiming
real-time microphone WebSocket streaming or low-latency speech chunks.
"""
from __future__ import annotations

import io
import json
import logging
import os
import wave
from functools import lru_cache
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_RECORDING_SECONDS = 90
KOKORO_DIR = Path(__file__).resolve().parent.parent / "models" / "kokoro"


class VoiceError(Exception):
    """Safe, developer-readable voice error (without secrets)."""


class VoiceUpstreamError(VoiceError):
    """Provider failure; distinguish from invalid user recordings."""


def validate_wav(data: bytes) -> float:
    """Accept only 16-bit PCM mono WAV 16k/24k, under 90s and 5 MiB."""
    if len(data) > MAX_AUDIO_BYTES:
        raise VoiceError("Recording exceeds the 5 MB local limit.")
    if len(data) < 44:
        raise VoiceError("Audio file is too short to be a WAV recording.")
    try:
        with wave.open(io.BytesIO(data), 'rb') as wav:
            if (wav.getnchannels() != 1 or wav.getsampwidth() != 2 or
                wav.getframerate() not in (16000, 24000) or
                wav.getcomptype() != 'NONE'):
                raise VoiceError("Send mono, 16-bit PCM WAV at 16 kHz or 24 kHz.")
            seconds = wav.getnframes() / wav.getframerate()
            if seconds < .1:
                raise VoiceError("Recording is too short; speak for at least a moment.")
            if seconds > MAX_RECORDING_SECONDS:
                raise VoiceError("Recording exceeds the 90-second local limit.")
            return seconds
    except (wave.Error, EOFError, ValueError) as exc:
        raise VoiceError("Invalid WAV file. Check microphone encoding.") from exc


async def transcribe_muse(data: bytes) -> dict:
    duration = validate_wav(data)
    key = os.getenv('MODEL_API_KEY', '').strip()
    if not key:
        raise VoiceError("MODEL_API_KEY is not configured in the backend .env.")
    request = {"mode": "PUSH_TO_TALK", "model": "muse-voice-transcribe-1.0", "audioEncoding": "WAV"}
    endpoint = 'https://api.meta.ai/v1/asr/transcribe'
    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=False) as client:
            response = await client.post(
                endpoint,
                headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
                files={
                    "request": (None, json.dumps(request), "application/json"),
                    "audio": ("recording.wav", data, "audio/wav"),
                },
            )
    except httpx.HTTPError as exc:
        logger.warning('Muse ASR transport failed: %s', type(exc).__name__)
        raise VoiceUpstreamError("Unable to reach Muse Voice Transcribe.") from exc
    if response.status_code != 200:
        # Never return response.text; it may contain provider internals.
        logger.warning('Muse ASR HTTP %d', response.status_code)
        raise VoiceUpstreamError(f"Muse transcription failed (HTTP {response.status_code}).")
    try:
        payload = response.json()
    except ValueError as exc:
        raise VoiceUpstreamError("Muse transcription returned malformed JSON.") from exc
    transcript = payload.get('transcript') if isinstance(payload, dict) else None
    if not isinstance(transcript, str) or not transcript.strip():
        raise VoiceError("No speech detected. Please try a shorter, clearer recording.")
    return {"transcript": transcript.strip(), "duration_seconds": round(duration, 2), "model": "muse-voice-transcribe-1.0"}


@lru_cache(maxsize=1)
def _kokoro():
    model_path = KOKORO_DIR / 'kokoro-v1.0.onnx'
    voices_path = KOKORO_DIR / 'voices-v1.0.bin'
    if not model_path.is_file() or not voices_path.is_file():
        raise VoiceError("Kokoro model files missing. Run scripts/setup-kokoro.ps1.")
    try:
        from kokoro_onnx import Kokoro
    except (ImportError, OSError) as exc:
        raise VoiceError("Kokoro is unavailable. Install requirements-voice.txt and check Windows Application Control.") from exc
    try:
        return Kokoro(str(model_path), str(voices_path))
    except Exception as exc:
        logger.exception('Kokoro initialization failed')
        raise VoiceError("Kokoro could not initialize its local ONNX model.") from exc


def synthesize_kokoro(text: str, voice: str = 'af_heart') -> bytes:
    if not 1 <= len(text.strip()) <= 600:
        raise VoiceError("Speech text must contain 1–600 characters.")
    if voice not in {'af_heart', 'af_sarah', 'am_adam', 'bf_emma'}:
        raise VoiceError("Unsupported Kokoro voice.")
    try:
        import numpy as np
        samples, rate = _kokoro().create(text.strip(), voice=voice, speed=1.0, lang='en-us')
        pcm = (np.clip(np.asarray(samples), -1.0, 1.0) * 32767).astype('<i2')
        output = io.BytesIO()
        with wave.open(output, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(int(rate))
            wav.writeframes(pcm.tobytes())
        return output.getvalue()
    except VoiceError:
        raise
    except Exception as exc:
        logger.exception('Kokoro synthesis failed')
        raise VoiceError("Kokoro speech synthesis failed. Check backend logs.") from exc
