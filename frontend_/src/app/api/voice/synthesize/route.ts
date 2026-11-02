import { backendUrl, providerUnavailable } from '@/lib/proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 2500) return Response.json({detail:'Text too long.'}, {status:413});
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('invalid');
    const {text, voice} = payload as {text?: unknown;voice?: unknown};
    if (typeof text !== 'string' || text.trim().length < 1 || text.length > 600 ||
        (voice !== undefined && !['af_heart','af_sarah','am_adam','bf_emma'].includes(String(voice)))) {
      return Response.json({detail:'Invalid speech text or voice.'}, {status:422});
    }
    const upstream = await fetch(backendUrl('/v1/voice/synthesize'), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text, voice:voice ?? 'af_heart'}), cache:'no-store', signal:AbortSignal.timeout(60000),
    });
    if (!upstream.ok) return Response.json(await upstream.json().catch(()=>({detail:'Kokoro unavailable.'})), {status:upstream.status});
    return new Response(upstream.body, {status:200, headers:{'Content-Type':'audio/wav','Cache-Control':'no-store'}});
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'invalid')) {
      return Response.json({detail:'Invalid JSON.'}, {status:400});
    }
    return providerUnavailable();
  }
}
