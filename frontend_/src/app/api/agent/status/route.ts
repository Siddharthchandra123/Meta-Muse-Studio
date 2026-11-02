import {backendUrl,providerUnavailable} from '@/lib/proxy';
export const runtime='nodejs';
export async function GET(){
  try {const res=await fetch(backendUrl('/v1/agent/status'),{cache:'no-store'}); if(!res.ok) return providerUnavailable();
    return Response.json(await res.json(),{headers:{'Cache-Control':'no-store'}});
  } catch {return providerUnavailable();}
}
