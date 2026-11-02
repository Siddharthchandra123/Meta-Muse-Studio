import { backendUrl, providerUnavailable } from '@/lib/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 3;
const MAX_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES + 100000;
const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function POST(request: Request) {
  // Local-dev only. Do not expose without authentication, CSRF and request-size limits at the reverse proxy.
  const declaredSize = Number(request.headers.get('content-length') || '0');
  if (declaredSize > MAX_BODY_BYTES) return Response.json({detail: 'Images exceed the 12 MiB request limit.'}, {status: 413});
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    return Response.json({detail:'Expected multipart image upload.'}, {status:415});
  }
  let input: FormData;
  try { input = await request.formData(); }
  catch { return Response.json({detail:'Could not read image upload.'}, {status:400}); }
  const images = input.getAll('images');
  const message = input.get('message');
  const conversationId = input.get('conversation_id');
  if (typeof message !== 'string' || message.trim().length < 1 || message.length > 4000 ||
      (conversationId !== null && (typeof conversationId !== 'string' || !uuidPattern.test(conversationId)))) {
    return Response.json({detail:'Invalid question or conversation ID.'}, {status:422});
  }
  if (images.length < 1 || images.length > MAX_IMAGES || images.some(image =>
    !(image instanceof File) || !allowed.has(image.type) || image.size < 1 || image.size > MAX_IMAGE_BYTES)) {
    return Response.json({detail:'Attach 1–3 JPEG, PNG or WebP images, up to 4 MiB each.'}, {status:422});
  }
  const outgoing = new FormData();
  outgoing.append('message', message.trim());
  if (conversationId) outgoing.append('conversation_id', conversationId);
  for (const image of images) {
    const file = image as File;
    outgoing.append('images', file, file.name.slice(0, 120));
  }
  try {
    const upstream = await fetch(backendUrl('/v1/chat/vision/stream'), {
      method: 'POST', body: outgoing, signal:request.signal, cache:'no-store',
      headers: {Accept:'text/event-stream'},
    });
    if (!upstream.ok) {
      let reason = `Vision backend returned HTTP ${upstream.status}.`;
      try {
        const payload = await upstream.json() as {detail?: string};
        if (typeof payload.detail === 'string' && upstream.status < 500) reason = payload.detail;
      } catch { /* Keep safe fallback. */ }
      return Response.json({detail:reason}, {status:upstream.status});
    }
    if (!upstream.body) return providerUnavailable();
    return new Response(upstream.body, {
      status:200,
      headers:{'Content-Type':'text/event-stream; charset=utf-8',
        'Cache-Control':'no-cache, no-transform', 'X-Accel-Buffering':'no'},
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') return new Response(null, {status:499});
    return providerUnavailable();
  }
}
