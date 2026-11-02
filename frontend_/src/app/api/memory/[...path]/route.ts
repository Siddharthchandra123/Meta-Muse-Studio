import {backendUrl,providerUnavailable} from '@/lib/proxy';
import {isAllowedAgentOrigin} from '@/lib/agent-origin';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{path:string[]}>};
const endpoints=new Set(['status','items','search','threads','clear']);
const uuid=/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function validatedPath(parts:string[]):string|null{
  if(parts.length===1 && endpoints.has(parts[0]))return '/v1/memory/'+parts[0];
  if(parts.length===2 && parts[0]==='items' && uuid.test(parts[1]))return '/v1/memory/items/'+parts[1];
  if(parts.length===2 && parts[0]==='threads' && uuid.test(parts[1]))return '/v1/memory/threads/'+parts[1];
  return null;
}
async function proxy(request:Request,ctx:Ctx,method:'GET'|'POST'|'DELETE'|'PATCH'){
  const {path}=await ctx.params;
  const dest=validatedPath(path);
  if(!dest)return Response.json({detail:'Unknown memory route'}, {status:404});
  if(method!=='GET' && !isAllowedAgentOrigin(request.headers.get('origin'),request.url))
    return Response.json({detail:'Cross-origin memory action blocked.'},{status:403});
  let body:string|undefined;
  if(method==='POST'||method==='PATCH'){
    body=await request.text();
    if(body.length>6000)return Response.json({detail:'Memory request too large'}, {status:413});
  }
  try{
    const url=new URL(backendUrl(dest));
    if(method==='GET'){
      const requested=new URL(request.url);
      if(dest.endsWith('/threads') || /\/threads\/[0-9a-f-]+$/i.test(dest)){
        const category=requested.searchParams.get('category');
        if(category && ['chat','research'].includes(category))url.searchParams.set('category',category);
      }
    }
    const upstream=await fetch(url,{method,cache:'no-store',signal:request.signal,
      ...(body===undefined?{}:{body,headers:{'Content-Type':'application/json'}})});
    const data=await upstream.text();
    return new Response(data,{status:upstream.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }catch{return providerUnavailable();}
}
export const GET=(request:Request,ctx:Ctx)=>proxy(request,ctx,'GET');
export const POST=(request:Request,ctx:Ctx)=>proxy(request,ctx,'POST');
export const DELETE=(request:Request,ctx:Ctx)=>proxy(request,ctx,'DELETE');

export const PATCH=(request:Request,ctx:Ctx)=>proxy(request,ctx,'PATCH');
