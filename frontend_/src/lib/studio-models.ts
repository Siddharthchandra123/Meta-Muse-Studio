/** Model metadata is descriptive, never proof of account entitlement. */
import {parseSseFrames} from '@/lib/sse';

export type StudioFamily = 'reasoning' | 'image' | 'audio' | 'segmentation' | 'local' | 'other';
export type StudioModel = {
  id: string; name: string; family: StudioFamily; mode: string;
  api: boolean; description: string; availability: string;
  capabilities?: string[]; endpoint?: string;
};
export type Usage = {input_tokens?: number | null; output_tokens?: number | null; cached_input_tokens?: number | null};
export type StudioResult = {text:string; response_id:string|null; usage?:Usage};
export const MODEL_FAMILIES:Record<StudioFamily,string> = {
  reasoning:'Reasoning & text',image:'Image generation',audio:'Speech',segmentation:'Segmentation',local:'Self-hosted',other:'Other API listings'
};
export const FAMILY_CAPABILITIES:Record<StudioFamily,string[]> = {
  reasoning:['Text','Reasoning','Images','Documents','Tool calling'],
  image:['Text to image','Image editing'],
  audio:['Speech recognition','Transcription'],
  segmentation:['Object segmentation','Image & video'],
  local:['Self-hosted inference'],
  other:['Capabilities unverified']
};
export const supportsMaxReasoning = (modelId:string):boolean => modelId==='muse-spark-1.3'||modelId==='muse-wonder-1.0';
export const isRunnableTextModel = (m:StudioModel):boolean => m.family==='reasoning' && m.api && m.mode==='api' && m.availability!=='not-listed';
export const canRunModel = (m:StudioModel):boolean => m.api && m.availability!=='not-listed';
export const availabilityLabel = (availability:string):string => ({listed:'Listed by Meta', 'not-listed':'Not listed for key',unverified:'Access unverified','requires-local-deployment':'Self-hosting required','muse-code-only':'Muse Code only'} as Record<string,string>)[availability]??'Availability unknown';
export function prettyStudioError(raw:unknown):string {
  if(typeof raw==='string')return raw;
  if(raw && typeof raw==='object' && 'detail' in raw){const d=(raw as {detail:unknown}).detail;return typeof d==='string'?d:JSON.stringify(d);}
  return 'Request failed. Check the FastAPI terminal.';
}
export async function fetchStudioModels(signal?:AbortSignal):Promise<{models:StudioModel[];listing_error?:string;catalog_status?:string}> {
  const r=await fetch('/api/studio/models',{cache:'no-store',signal});
  if(!r.ok)throw new Error(prettyStudioError(await r.json().catch(()=>({detail:`Catalog HTTP ${r.status}`}))));
  const result=await r.json();
  if(!Array.isArray(result.models))throw new Error('Invalid model catalog response.');
  return result;
}
/** Streams one independent Responses API run. The browser never receives the Meta key. */
export async function runStudioModel(
  input:{model:string;prompt:string;instructions:string;effort:string;max_output_tokens:number;contributor_acknowledged?:boolean},
  signal:AbortSignal,
  onDelta:(text:string)=>void,
):Promise<StudioResult>{
  const r=await fetch('/api/studio/run/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
  if(!r.ok)throw new Error(prettyStudioError(await r.json().catch(()=>({detail:`Model HTTP ${r.status}`}))));
  if(!r.body)throw new Error('Model response did not contain a stream.');
  const reader=r.body.getReader(); const decoder=new TextDecoder();
  let pending=''; let completed:StudioResult|null=null;
  const consume=(chunk:string)=>{
    pending+=chunk;
    const batch=parseSseFrames(pending); pending=batch.pending;
    for(const event of batch.events){
      if(event.event==='delta' && typeof event.data.text==='string')onDelta(event.data.text);
      if(event.event==='done')completed={text:String(event.data.answer??''),response_id:typeof event.data.response_id==='string'?event.data.response_id:null,usage:event.data.usage as Usage|undefined};
      if(event.event==='error')throw new Error(String(event.data.message??'Model streaming failed.'));
    }
  };
  try{
    while(true){const {value,done}=await reader.read();if(done)break;consume(decoder.decode(value,{stream:true}));}
    consume(decoder.decode()+'\n\n');
    if(!completed)throw new Error('Model stream ended without a completed response.');
    return completed;
  }finally{reader.releaseLock();}
}
export function formatNumber(n:number|null|undefined):string {return typeof n==='number'?n.toLocaleString():'—';}
