import { backendUrl, providerUnavailable } from '@/lib/proxy';
import { explainBackendError, shouldRecoverConversation } from '@/lib/stream-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(request: Request) {
  // Local-dev boundary only. Authentication and CSRF protection are required before public use.
  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 10000) return Response.json({detail: 'Request too large'}, {status: 413});
    payload = JSON.parse(raw);
  } catch {
    return Response.json({detail: 'Invalid JSON'}, {status: 400});
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return Response.json({detail: 'Invalid request'}, {status: 400});
  }
  const record = payload as Record<string, unknown>;
  const message = record.message;
  const conversationId = record.conversation_id ?? null;
  if (typeof message !== 'string' || !message.trim() || message.length > 4000 ||
      (conversationId !== null && (typeof conversationId !== 'string' || !uuidPattern.test(conversationId)))) {
    return Response.json({detail: 'Invalid message or conversation ID'}, {status: 422});
  }
  try {
    const send = (useConversationId: boolean) => fetch(backendUrl('/v1/chat/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({message: message.trim(), conversation_id: useConversationId ? conversationId : null}),
      cache: 'no-store', signal: request.signal,
    });
    let upstream = await send(true);
    let recovered = false;
    if (!upstream.ok && conversationId && upstream.status === 404) {
      const firstError = await upstream.json().catch(() => ({})) as {detail?: unknown};
      if (shouldRecoverConversation(upstream.status, firstError.detail, true)) {
        upstream = await send(false);
        recovered = true;
      } else {
        return Response.json({detail: explainBackendError(firstError.detail, upstream.status)}, {status: upstream.status});
      }
    }
    if (!upstream.ok) {
      const error = await upstream.json().catch(() => ({})) as {detail?: unknown};
      return Response.json({detail: explainBackendError(error.detail, upstream.status)}, {status: upstream.status});
    }
    if (!upstream.body) return providerUnavailable();
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        ...(recovered ? {'X-MUSE-Session-Recovered': 'true'} : {}),
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') return new Response(null, {status: 499});
    return providerUnavailable();
  }
}
