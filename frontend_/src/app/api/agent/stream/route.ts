import {isAllowedAgentOrigin} from '@/lib/agent-origin';
import {backendUrl, providerUnavailable} from '@/lib/proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request:Request){
  const origin = request.headers.get('origin');
  if (origin && !isAllowedAgentOrigin(origin, request.url)) return Response.json({detail:'Research action blocked: open the dashboard from the same local port (127.0.0.1 or localhost).'},{status:403});
  let payload:unknown;
  try {const raw=await request.text(); if(raw.length>9000) return Response.json({detail:'Request too large.'},{status:413}); payload=JSON.parse(raw);}
  catch {return Response.json({detail:'Invalid JSON.'},{status:400});}
  const prompt=typeof payload==='object' && payload && !Array.isArray(payload) ? (payload as Record<string,unknown>).prompt : null;
  if (typeof prompt !== 'string' || prompt.trim().length<3 || prompt.length>4000) return Response.json({detail:'Invalid research request.'},{status:422});
  try {
    const upstream=await fetch(backendUrl('/v1/agent/stream'),{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:JSON.stringify({prompt:prompt.trim()}),signal:request.signal,cache:'no-store'});
    if(!upstream.ok) return Response.json({detail:'Research backend rejected the request.'},{status:upstream.status});
    if(!upstream.body) return providerUnavailable();
    return new Response(upstream.body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
  } catch {return providerUnavailable();}
}
