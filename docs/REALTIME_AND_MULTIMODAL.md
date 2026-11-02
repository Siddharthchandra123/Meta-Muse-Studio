# Real-time multimodal plan

**Phase 3.1 user verified:** push-to-talk browser WAV capture, Meta HTTP transcription, local Kokoro WAV synthesis and playback. **Phase 3.2 source implemented/offline tested:** direct loopback WebSocket from browser to FastAPI, Meta realtime ASR via server-only credentials, partial transcripts, model-detected turn endpoints, browser playback interruption, in-flight SSE cancellation and 20-minute session timeout. Live Windows acceptance and chunked Kokoro TTS remain pending. See [VOICE_PHASE3_2.md](VOICE_PHASE3_2.md).

## Voice pipeline
Browser microphone -> audio transport -> authenticated server relay -> Muse Voice Transcribe -> utterance finalization -> task/router -> Muse Spark -> streaming text response -> Kokoro TTS -> playback.

### ASR details (verified from Meta docs)
- Realtime WS endpoint: `wss://api.meta.ai/v1/asr/realtime`.
- Key must be included in the **handshake frame** for realtime; HTTP Authorization header is ignored on this endpoint. Never put it in frontend JS.
- Modes: `PUSH_TO_TALK` (initial MVP), `ENDPOINTING` (always-listening conversational mode), `DIARIZATION` (speaker labels).
- Events: `speechStart`, partial `transcript`, `speechEnd`, `speechComplete`.
- A speech segment is complete only at `speechComplete`; do not send an intermediate partial as a finished user instruction.
- Use `turnId` for simultaneous/overlapping turns; partials do not carry `turnId`.
- Turn-level timestamps are supported; word-level timestamps are not.
- On voice-first MVP, never assume Spark 1.3 is an audio-generation model. It returns text; use ASR and TTS as distinct components.

### Audio output design
- Initial synth: Kokoro ONNX running on the backend or a separate local worker.
- Buffer short text segments, enqueue for speech in order, cancel queue on barge-in.
- Surface generated text independently so TTS failures do not block task completion.
- Add timeouts, jitter buffering, reconnect logic and end-to-end trace timestamps.

### Vision / document input
- Use Muse Spark 1.3 image/PDF understanding through the supported content blocks.
- Validate MIME type, input size and image dimensions, strip irrelevant EXIF and avoid persisting uploads without opt-in.
- Treat OCR and visual parsing as fallible; request confirmation before acting on extracted addresses, payment amounts or commands.
- Video input later; no claims that it is implemented.

### Latency budget (proposed engineering target, not observed)
| Stage | Target for short voice turn |
|---|---|
| Endpoint detection/transcription finish | P50 < 500 ms after user stops speaking |
| Model first useful text | P50 < 900 ms after transcript finish |
| Kokoro first audio playable | P50 < 300 ms after first speakable text |
| Network/render budget | P50 < 300 ms total |
| End of user speech -> audible reply | P50 < 2s, P95 < 5s (benchmark later) |

No performance numbers have been collected for this project yet.
