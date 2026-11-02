import {backendUrl, providerUnavailable} from '@/lib/proxy';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(request:Request) {
  try {
    const payload=await request.text();
    if(payload.length>7_200_000)return Response.json({detail:'Request is too large.'},{status:413});
    const upstream=await fetch(backendUrl('/v1/studio/run/stream'),{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:payload,cache:'no-store',signal:request.signal});
    return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
  }catch{return providerUnavailable();}
}
