import {backendUrl, providerUnavailable} from '@/lib/proxy';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const response = await fetch(backendUrl('/v1/voice/realtime/status'), {
      cache:'no-store', signal:AbortSignal.timeout(5000),
    });
    if (!response.ok) return Response.json({detail:'Your FastAPI backend does not expose the Phase 3.2 diagnostic endpoint. Check that the Phase 5 FastAPI backend is running.'}, {status:502});
    return Response.json(await response.json(), {headers:{'Cache-Control':'no-store'}});
  } catch { return providerUnavailable(); }
}
