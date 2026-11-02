import { backendUrl, providerUnavailable } from '@/lib/proxy';
import { explainBackendError, shouldRecoverConversation } from '@/lib/stream-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const MAX_REQUEST_BYTES = 37 * 1024 * 1024;
const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const allowedImages = new Set(['image/png','image/jpeg','image/webp']);
const allowedExtensions = new Set(['pdf','docx','txt','md','csv']);

export async function POST(request: Request) {
  const declaredSize = Number(request.headers.get('content-length') || '0');
  if (declaredSize > MAX_REQUEST_BYTES) return Response.json({detail:'Attachments exceed the request size limit.'}, {status:413});
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    return Response.json({detail:'Expected multipart upload.'}, {status:415});
  }
  let input: FormData;
  try { input = await request.formData(); }
  catch { return Response.json({detail:'Could not read attachments.'}, {status:400}); }
  const images = input.getAll('images');
  const documents = input.getAll('documents');
  const message = input.get('message');
  const conversationId = input.get('conversation_id');
  if (typeof message !== 'string' || !message.trim() || message.length > 4000 ||
      (conversationId !== null && (typeof conversationId !== 'string' || !uuidPattern.test(conversationId)))) {
    return Response.json({detail:'Invalid message or conversation ID.'}, {status:422});
  }
  if (images.length > 3 || documents.length > 2 || images.length + documents.length < 1 ||
      images.some(image => !(image instanceof File) || !allowedImages.has(image.type) || image.size < 1 || image.size > MAX_IMAGE_BYTES) ||
      documents.some(doc => !(doc instanceof File) || doc.size < 1 || doc.size > MAX_DOCUMENT_BYTES ||
        !allowedExtensions.has(doc.name.split('.').pop()?.toLowerCase() ?? ''))) {
    return Response.json({detail:'Attach up to 3 images (4 MiB each) and 2 PDF/DOCX/TXT/MD/CSV documents (12 MiB each).'}, {status:422});
  }
  // Capture validated primitives before creating the nested helper.
  // TypeScript cannot carry FormDataEntryValue narrowing into a closure.
  const validatedMessage: string = message.trim();
  const validatedConversationId: string | null = typeof conversationId === 'string' ? conversationId : null;

  function uploadBody(useConversationId: boolean): FormData {
    const outgoing = new FormData();
    outgoing.append('message', validatedMessage);
    if (useConversationId && validatedConversationId) outgoing.append('conversation_id', validatedConversationId);
    for (const image of images) {
      const file = image as File;
      outgoing.append('images', file, file.name.slice(0, 120));
    }
    for (const doc of documents) {
      const file = doc as File;
      outgoing.append('documents', file, file.name.slice(0, 120));
    }
    return outgoing;
  }
  try {
    const send = (useConversationId: boolean) => fetch(backendUrl('/v1/chat/multimodal/stream'), {
      method: 'POST', body: uploadBody(useConversationId), signal: request.signal,
      cache: 'no-store', headers: {Accept: 'text/event-stream'},
    });
    let upstream = await send(true);
    let recovered = false;
    if (!upstream.ok && conversationId && upstream.status === 404) {
      const firstError = await upstream.json().catch(() => ({})) as {detail?: unknown};
      if (shouldRecoverConversation(upstream.status, firstError.detail, true)) {
        // Safe: FastAPI rejects unknown IDs before calling Muse. Never retry a model failure.
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
    return new Response(upstream.body, {status: 200, headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      ...(recovered ? {'X-MUSE-Session-Recovered': 'true'} : {}),
    }});
  } catch (error) {
    if ((error as Error).name === 'AbortError') return new Response(null, {status:499});
    return providerUnavailable();
  }
}
