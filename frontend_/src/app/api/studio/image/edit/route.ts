import {backendUrl, providerUnavailable} from '@/lib/proxy';
export const runtime='nodejs';
export const maxDuration=180;
export async function POST(request:Request) {
  try {
    const body=await request.formData();
    const image=body.get('image');
    if(!(image instanceof File) || image.size>4*1024*1024)return Response.json({detail:'Use a PNG, JPEG or WebP under 4 MiB.'},{status:413});
    const upstream=await fetch(backendUrl('/v1/studio/image/edit'),{method:'POST',body,cache:'no-store',signal:request.signal});
    return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return providerUnavailable();}
}
