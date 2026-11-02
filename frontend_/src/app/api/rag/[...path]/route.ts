import {backendUrl,providerUnavailable} from '@/lib/proxy';
import {isAllowedAgentOrigin} from '@/lib/agent-origin';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{path:string[]}>};
const uuid=/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function allowed(parts:string[]):string|null{
  if(parts.length===1 && ['status','collections','search','ask'].includes(parts[0]))return '/v1/rag/'+parts[0];
  if(parts.length===2 && parts[0]==='collections' && uuid.test(parts[1]))return `/v1/rag/collections/${parts[1]}`;
  if(parts.length===3 && parts[0]==='collections' && uuid.test(parts[1]) && parts[2]==='documents')return `/v1/rag/collections/${parts[1]}/documents`;
  if(parts.length===4 && parts[0]==='collections' && uuid.test(parts[1]) && parts[2]==='documents' && uuid.test(parts[3]))return `/v1/rag/collections/${parts[1]}/documents/${parts[3]}`;
  return null;
}
async function proxy(request:Request,ctx:Ctx,method:'GET'|'POST'|'DELETE'){
  const {path}=await ctx.params;
  const target=allowed(path);
  if(!target)return Response.json({detail:'Unknown RAG route'},{status:404});
  if(method!=='GET' && !isAllowedAgentOrigin(request.headers.get('origin'),request.url))
    return Response.json({detail:'Cross-origin RAG action blocked.'},{status:403});
  // Keep RAG file uploads bounded; never proxy arbitrary endpoints or upstream hosts.
  let body:Blob|undefined;
  if(method==='POST'){
    const size=Number(request.headers.get('content-length')||'0');
    if(size>13*1024*1024)return Response.json({detail:'Upload too large'},{status:413});
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength>13*1024*1024)return Response.json({detail:'Upload too large'},{status:413});
    body=new Blob([bytes]);
  }
  try{
    const backend=backendUrl(target as '/v1/rag/status');
    const upstream=await fetch(backend,{
      method,cache:'no-store',signal:request.signal,
      ...(body===undefined?{}:{body,headers:{'Content-Type':request.headers.get('content-type')||'application/json'}}),
    });
    return new Response(await upstream.text(),{status:upstream.status,
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return providerUnavailable();}
}
export const GET=(r:Request,c:Ctx)=>proxy(r,c,'GET');
export const POST=(r:Request,c:Ctx)=>proxy(r,c,'POST');
export const DELETE=(r:Request,c:Ctx)=>proxy(r,c,'DELETE');
