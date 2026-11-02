/** Server-only upstream configuration; never import from client components. */
export function backendUrl(path: '/health' | '/v1/usage' | '/v1/chat/stream' | '/v1/voice/transcribe' | '/v1/voice/synthesize' | '/v1/voice/realtime/status' | '/v1/chat/vision/stream' | '/v1/chat/multimodal/stream' | '/v1/agent/stream' | '/v1/agent/status' | `/v1/agent/actions/${string}/approve` | '/v1/studio/models' | '/v1/studio/run/stream' | '/v1/studio/image/generate' | '/v1/studio/image/edit' | '/v1/rag/status' | `/v1/rag/${string}`): string {
  const source = process.env.MUSE_BACKEND_URL || 'http://127.0.0.1:8000';
  const url = new URL(source);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password) {
    throw new Error('MUSE_BACKEND_URL must be an unauthenticated local HTTP address.');
  }
  // Only static paths supplied by trusted routes can reach the backend.
  return new URL(path, url.origin).toString();
}

export function providerUnavailable() {
  return Response.json({ detail: 'MUSE Nova backend is unavailable. Start FastAPI on port 8000.' }, {status: 503});
}
