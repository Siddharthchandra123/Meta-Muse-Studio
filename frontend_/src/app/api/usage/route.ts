import { backendUrl, providerUnavailable } from '@/lib/proxy';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const response = await fetch(backendUrl('/v1/usage'), {cache:'no-store', signal: AbortSignal.timeout(5000)});
    if (!response.ok) return providerUnavailable();
    return Response.json(await response.json(), {headers:{'Cache-Control':'no-store'}});
  } catch { return providerUnavailable(); }
}
