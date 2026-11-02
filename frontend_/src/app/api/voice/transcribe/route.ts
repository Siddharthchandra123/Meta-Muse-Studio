import { backendUrl, providerUnavailable } from '@/lib/proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const LIMIT = 5 * 1024 * 1024;
export async function POST(request: Request) {
  const header = request.headers.get('content-length');
  if (header && Number(header) > LIMIT + 10000) return Response.json({detail:'Audio upload too large.'}, {status:413});
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) return Response.json({detail:'Expected multipart audio.'}, {status:415});
  try {
    const form = await request.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size > LIMIT || audio.size < 44 || audio.type !== 'audio/wav') {
      return Response.json({detail:'Expected a WAV file under 5 MB.'}, {status:422});
    }
    const outgoing = new FormData();
    outgoing.append('audio', audio, 'recording.wav');
    const upstream = await fetch(backendUrl('/v1/voice/transcribe'), {
      method:'POST', body:outgoing, cache:'no-store', signal:AbortSignal.timeout(125000),
    });
    const data = await upstream.json().catch(()=>({detail:`ASR upstream HTTP ${upstream.status}`}));
    return Response.json(data, {status:upstream.status, headers:{'Cache-Control':'no-store'}});
  } catch {
    return providerUnavailable();
  }
}
