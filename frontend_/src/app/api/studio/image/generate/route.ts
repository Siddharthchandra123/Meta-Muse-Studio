import {backendUrl, providerUnavailable} from '@/lib/proxy';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(request:Request) {
  try {
    const payload=await request.text();
    if(payload.length>16000)return Response.json({detail:'Prompt is too large.'},{status:413});
    const upstream=await fetch(backendUrl('/v1/studio/image/generate'),{method:'POST',headers:{'Content-Type':'application/json'},body:payload,cache:'no-store',signal:request.signal});
    return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return providerUnavailable();}
}
