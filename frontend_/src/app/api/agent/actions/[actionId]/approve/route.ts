import {isAllowedAgentOrigin} from '@/lib/agent-origin';
import {backendUrl,providerUnavailable} from '@/lib/proxy';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{actionId:string}>}){
  const origin=request.headers.get('origin');
  if(origin && !isAllowedAgentOrigin(origin, request.url)) return Response.json({detail:'Research action blocked: open the dashboard from the same local port (127.0.0.1 or localhost).'},{status:403});
  const {actionId}=await context.params;
  if(!/^[a-fA-F0-9-]{36}$/.test(actionId)) return Response.json({detail:'Invalid approval ID.'},{status:422});
  let body:unknown;
  try {body=await request.json();} catch{return Response.json({detail:'Invalid approval decision.'},{status:400});}
  if(!body || typeof body!=='object' || typeof (body as {approve?:unknown}).approve!=='boolean') return Response.json({detail:'Approval must be a boolean.'},{status:422});
  try {
    const res=await fetch(backendUrl(`/v1/agent/actions/${actionId}/approve`),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const result=await res.json().catch(()=>({detail:'Approval failed.'}));
    return Response.json(result,{status:res.status,headers:{'Cache-Control':'no-store'}});
  } catch{return providerUnavailable();}
}
