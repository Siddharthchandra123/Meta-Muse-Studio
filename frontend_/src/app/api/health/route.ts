import { backendUrl, providerUnavailable } from '@/lib/proxy';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const response = await fetch(backendUrl('/health'), {cache:'no-store', signal: AbortSignal.timeout(5000)});
    if (!response.ok) return providerUnavailable();
    const data = await response.json();
    return Response.json(data, {headers:{'Cache-Control':'no-store'}});
  } catch { return providerUnavailable(); }
}
