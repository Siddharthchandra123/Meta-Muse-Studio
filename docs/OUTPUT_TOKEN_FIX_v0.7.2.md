# Output-token budget fix (v0.7.2)

## Why v0.7.1 failed

`app/provider.py` had a hard ceiling of `min(2048, ...)`. Raising `.env` to 4096 did **not** actually send 4096 to Meta. Muse reasoning tokens count against the same `max_output_tokens` limit as visible output. Long PDFs and document comparisons can use the full 2048 before producing a complete text answer.

## Fix

The internal ceiling is now 8192 with a documented 4096 default. For typical summaries set in your private `.env`:

```dotenv
MAX_OUTPUT_TOKENS=4096
MUSE_REASONING_EFFORT=minimal
```

Restart uvicorn and run `powershell -ExecutionPolicy Bypass -File .\scripts\check-output-limit.ps1`. It prints the *effective* token limit without displaying the key or spending credits. Then retry the request.

For harder document analysis, consider `MAX_OUTPUT_TOKENS=8192`; this may cost more if consumed. Ask for concise answers; split very long documents into focused questions or sections. An incomplete response is not automatically retried (to avoid unintentional billing). Some API/model limits can still return HTTP 400; check current Meta Model API documentation.

**Safety and compatibility:** The text/voice and document pipeline is otherwise unchanged. Preserve the private `.env` and downloaded Kokoro weights outside the ZIP. Run the offline test suite and Windows Next.js build locally.
