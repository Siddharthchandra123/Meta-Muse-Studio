'use client';

import StudioThemeToggle from '@/components/StudioThemeToggle';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,AudioLines,BookOpen,Check,CheckCircle2,ChevronDown,Code2,Copy,Download,FileAudio,Image as ImageIcon,Layers3,LoaderCircle,MessageSquare,Play,Plus,RefreshCw,Search,Send,Settings2,ShieldAlert,SlidersHorizontal,Sparkles,Square,Split,UploadCloud,WandSparkles,X} from 'lucide-react';
import {parseSseFrames} from '@/lib/sse';
import './studio.css';
import './ui-refresh.css';

type Family='reasoning'|'image'|'audio'|'segmentation'|'local';
type Model={id:string;name:string;family:Family;mode:string;api:boolean;description:string;availability:string};
type ChatMessage={role:'user'|'assistant';text:string;image?:string;usage?:Usage};
type Usage={input_tokens?:number|null;output_tokens?:number|null;cached_input_tokens?:number|null};
type RunResult={text:string;response_id:string|null;usage?:Usage};
const SUGGESTIONS=['Explain how multimodal agents process images and text.','Write a Python function to parse Server-Sent Events.','Compare retrieval-augmented generation and fine-tuning.'];
const FALLBACK:Model[]=[
  {id:'muse-wonder-1.0',name:'Muse Wonder',family:'reasoning',mode:'api',api:true,description:'Advanced agentic reasoning and coding.',availability:'unverified'},
  ...(['1.3','1.2','1.1'] as const).map(v=>({id:`muse-spark-${v}`,name:`Muse Spark ${v}`,family:'reasoning' as Family,mode:'api',api:true,description:'Multimodal reasoning and agent workflows.',availability:'unverified'})),
  ...(['1.3','1.2'] as const).map(v=>({id:`muse-spark-${v}-contributor`,name:`Spark ${v} Contributor`,family:'reasoning' as Family,mode:'contributor',api:true,description:'Contributor mode: prompts may be used for model improvement.',availability:'unverified'})),
  {id:'muse-image-1.0',name:'Muse Image',family:'image',mode:'api',api:true,description:'Generate and edit images.',availability:'unverified'},
  {id:'muse-voice-transcribe-1.0',name:'Muse Voice Transcribe',family:'audio',mode:'api',api:true,description:'Speech to text and realtime transcription.',availability:'unverified'},
  {id:'sam-3.1',name:'SAM 3.1',family:'segmentation',mode:'api',api:true,description:'Object segmentation and tracking.',availability:'unverified'},
  {id:'muse-glimmer-30b',name:'Muse Glimmer 30B',family:'local',mode:'self-hosted',api:false,description:'Open-weight model; needs a local inference server.',availability:'requires-local-deployment'},
  {id:'muse-spark-open',name:'Muse Spark Open',family:'local',mode:'self-hosted',api:false,description:'Large open-weight model; dedicated GPUs required.',availability:'requires-local-deployment'},
  {id:'muse-wonder-full',name:'Muse Wonder Full',family:'reasoning',mode:'muse-code-only',api:false,description:'Muse Code subscription only; not callable through the Model API.',availability:'muse-code-only'},
];
const FAMILY_NAMES:Record<Family,string>={reasoning:'Language & reasoning',image:'Image generation',audio:'Speech',segmentation:'Vision segmentation',local:'Open-weight / other'};
const FAMILY_ICONS:Record<Family,typeof Sparkles>={reasoning:Sparkles,image:ImageIcon,audio:AudioLines,segmentation:Layers3,local:Code2};

function supportsMaxReasoning(model:string):boolean {return model==='muse-spark-1.3'||model==='muse-wonder-1.0';}
function prettyError(raw:unknown):string {
  if(typeof raw==='string')return raw;
  if(raw&&typeof raw==='object'&&'detail'in raw){const detail=(raw as {detail:unknown}).detail;return typeof detail==='string'?detail:JSON.stringify(detail);}
  return 'Request failed. Check FastAPI logs.';
}
async function dataURL(file:File):Promise<string>{
  if(file.size>4*1024*1024)throw new Error('Choose an image under 4 MiB.');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use PNG, JPEG or WebP.');
  return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Cannot read image.'));reader.readAsDataURL(file);});
}
async function streamMuse(input:Record<string,unknown>,signal:AbortSignal,onDelta:(text:string)=>void):Promise<RunResult>{
  const r=await fetch('/api/studio/run/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
  if(!r.ok)throw new Error(prettyError(await r.json().catch(()=>({detail:`HTTP ${r.status}`}))));
  const reader=r.body?.getReader();if(!reader)throw new Error('No response stream.');
  const decoder=new TextDecoder();let pending='';let done:RunResult|null=null;
  const consume=(piece:string)=>{pending+=piece;const frames=parseSseFrames(pending);pending=frames.pending;
    for(const f of frames.events){if(f.event==='delta')onDelta(String(f.data.text||''));
      if(f.event==='done')done={text:String(f.data.answer||''),response_id:typeof f.data.response_id==='string'?f.data.response_id:null,usage:f.data.usage as Usage};
      if(f.event==='error')throw new Error(String(f.data.message||'Model request failed.'));}
  };
  while(true){const {done:finished,value}=await reader.read();if(finished)break;consume(decoder.decode(value,{stream:true}));}
  consume(decoder.decode()+'\n\n');
  if(!done)throw new Error('The model stream ended without a completed answer.');
  return done;
}

export default function StudioPage(){
  const [models,setModels]=useState<Model[]>(FALLBACK);
  const [listingError,setListingError]=useState('');
  const [selected,setSelected]=useState('muse-spark-1.3');
  const [filter,setFilter]=useState('');
  const [tab,setTab]=useState<'playground'|'compare'>('playground');
  const [prompt,setPrompt]=useState('');
  const [instructions,setInstructions]=useState('You are a helpful, accurate and concise personal AI assistant.');
  const [effort,setEffort]=useState('minimal');
  const [maxTokens,setMaxTokens]=useState(4096);
  const [contributorAck,setContributorAck]=useState(false);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [responseId,setResponseId]=useState<string|null>(null);
  const [image,setImage]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [streamText,setStreamText]=useState('');
  const [error,setError]=useState('');
  const [lastUsage,setLastUsage]=useState<Usage|null>(null);
  const [imageResult,setImageResult]=useState<string|null>(null);
  const [imgSize,setImgSize]=useState('1024x1024');
  const [audioFile,setAudioFile]=useState<File|null>(null);
  const [transcript,setTranscript]=useState('');
  const [leftCompare,setLeftCompare]=useState('muse-spark-1.3');
  const [rightCompare,setRightCompare]=useState('muse-wonder-1.0');
  const [compareResults,setCompareResults]=useState<Record<string,string>>({});
  const [showSettings,setShowSettings]=useState(true);
  const controller=useRef<AbortController|null>(null);
  const selectedModel=models.find(x=>x.id===selected)??FALLBACK[1];
  const isContributor=selectedModel.mode==='contributor';
  const grouped=useMemo(()=>Object.entries(FAMILY_NAMES).map(([key,title])=>({key:key as Family,title,models:models.filter(m=>m.family===key&&(m.name.toLowerCase().includes(filter.toLowerCase())||m.id.includes(filter.toLowerCase())))})).filter(x=>x.models.length),[models,filter]);
  const refresh=useCallback(async()=>{
    try{const res=await fetch('/api/studio/models',{cache:'no-store'});if(!res.ok)throw new Error('Cannot connect to the model catalog');
      const json=await res.json();if(Array.isArray(json.models))setModels(json.models);setListingError(json.listing_error||'');}
    catch(e){setListingError(e instanceof Error?e.message:'Catalog could not be refreshed');}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const modelQueryApplied=useRef(false);
  useEffect(()=>{if(effort==='max'&&!supportsMaxReasoning(selected))setEffort('xhigh');},[effort,selected]);
  useEffect(()=>{if(modelQueryApplied.current)return;const id=new URLSearchParams(window.location.search).get('model');if(!id){modelQueryApplied.current=true;return;}if(models.some(m=>m.id===id)){modelQueryApplied.current=true;setSelected(id);setMessages([]);setResponseId(null);}},[models]);
  const chooseModel=(id:string)=>{if(busy)return;if(effort==='max'&&!supportsMaxReasoning(id))setEffort('xhigh');setSelected(id);setTab('playground');setMessages([]);setResponseId(null);setStreamText('');setLastUsage(null);setError('');setImage(null);setImageResult(null);setContributorAck(false);};
  const stop=()=>controller.current?.abort();
  async function runText(){
    if(busy||!prompt.trim()||!selectedModel.api)return;
    if(isContributor&&!contributorAck){setError('Confirm Contributor data-use terms in the settings panel.');return;}
    const current=prompt.trim(),imageCopy=image;setPrompt('');setBusy(true);setError('');setStreamText('');
    const c=new AbortController();controller.current=c;
    let encoded:string|undefined;
    try{
      if(imageCopy)encoded=await dataURL(imageCopy);
      setMessages(old=>[...old,{role:'user',text:current,image:imageCopy?.name}]);
      const result=await streamMuse({model:selected,prompt:current,instructions,effort,max_output_tokens:maxTokens,previous_response_id:responseId,image_data_url:encoded,contributor_acknowledged:contributorAck},c.signal,chunk=>setStreamText(old=>old+chunk));
      setMessages(old=>[...old,{role:'assistant',text:result.text,usage:result.usage}]);setResponseId(result.response_id);setLastUsage(result.usage??null);setImage(null);setStreamText('');
    }catch(e){setError((e as Error).name==='AbortError'?'Generation stopped.':e instanceof Error?e.message:'Generation failed.');setStreamText('');}
    finally{setBusy(false);controller.current=null;}
  }
  async function runCompare(){
    if(busy||!prompt.trim())return;setBusy(true);setError('');setCompareResults({});const c=new AbortController();controller.current=c;
    try{
      // Compare calls are independently billable; a distinct session is created for each model.
      await Promise.all([leftCompare,rightCompare].map(async(model,index)=>{
        let part='';setCompareResults(old=>({...old,[String(index)]:''}));
        const result=await streamMuse({model,prompt:prompt.trim(),instructions,effort,max_output_tokens:maxTokens,contributor_acknowledged:contributorAck},c.signal,chunk=>{part+=chunk;setCompareResults(old=>({...old,[String(index)]:part}));});
        setCompareResults(old=>({...old,[String(index)]:result.text}));
      }));
    }catch(e){c.abort();setError(e instanceof Error?e.message:'Comparison failed.');}
    finally{setBusy(false);controller.current=null;}
  }
  async function generateImage(){
    if(busy||!prompt.trim())return;setError('');setBusy(true);setImageResult(null);const c=new AbortController();controller.current=c;
    try{
      let r:Response;
      if(image){const form=new FormData();form.append('prompt',prompt.trim());form.append('image',image);r=await fetch('/api/studio/image/edit',{method:'POST',body:form,signal:c.signal});}
      else{r=await fetch('/api/studio/image/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:prompt.trim(),size:imgSize,output_format:'png'}),signal:c.signal});}
      const json=await r.json();if(!r.ok)throw new Error(prettyError(json));
      if(typeof json.image_data_url!=='string')throw new Error('No image returned by Muse Image.');setImageResult(json.image_data_url);
    }catch(e){setError(e instanceof Error?e.message:'Image generation failed.');}finally{setBusy(false);controller.current=null;}
  }
  async function transcribe(){
    if(busy||!audioFile)return;setError('');setBusy(true);setTranscript('');const c=new AbortController();controller.current=c;
    try{const fd=new FormData();fd.append('audio',audioFile);const res=await fetch('/api/voice/transcribe',{method:'POST',body:fd,signal:c.signal});const data=await res.json();if(!res.ok)throw new Error(prettyError(data));setTranscript(String(data.transcript||''));}
    catch(e){setError(e instanceof Error?e.message:'Transcription failed.');}finally{setBusy(false);controller.current=null;}
  }
  function exportSession(){
    const data={model:selected,created_at:new Date().toISOString(),instructions,effort,max_output_tokens:maxTokens,messages};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='muse-studio-session.json';a.click();URL.revokeObjectURL(url);
  }
  async function copyCode(){
    const code=`import os, requests\n\nurl = 'https://api.meta.ai/v1/responses'\nheaders = {'Authorization': 'Bearer ' + os.environ['MODEL_API_KEY']}\npayload = ${JSON.stringify({model:selected,input:prompt||'Hello from Muse Studio',instructions,reasoning:{effort},max_output_tokens:maxTokens},null,2)}\nresponse = requests.post(url, headers=headers, json=payload, timeout=120)\nresponse.raise_for_status()\nprint(response.json())`;
    await navigator.clipboard.writeText(code);
  }
  const canRun=selectedModel.api && selectedModel.availability!=='not-listed';
  const modeTitle=selectedModel.family==='image'?'Image generation & editing':selectedModel.family==='audio'?'Voice transcription':selectedModel.family==='segmentation'?'Image segmentation':selectedModel.family==='local'?'Self-hosted models':'Chat playground';
  const familyIcon=FAMILY_ICONS[selectedModel.family];const FamilyIcon=familyIcon;

  return <div className="ms-root">
    <header className="ms-topbar"><div className="ms-brand"><div className="ms-brand-mark"><Sparkles size={21}/></div><strong>MUSE <span>Nova</span></strong><em>STUDIO</em></div>
      <div className="ms-top-center"><a href="/" className="ms-top-link"><ArrowLeft size={15}/> Workspace</a><span className="ms-top-separator"/><span>Model Playground</span><a href="/studio/catalog" className="ms-top-link" style={{marginLeft:15}}>Model catalog</a><a href="/studio/compare" className="ms-top-link" style={{marginLeft:10}}>Compare models</a></div>
      <div className="ms-top-right"><span className="ms-live-dot"/> LOCAL DEV <StudioThemeToggle/> <button onClick={refresh} className="ms-ghost" title="Refresh model availability"><RefreshCw size={15}/></button><a href="/agents" className="ms-ghost ms-ghost-link"><Layers3 size={16}/> Agents</a></div>
    </header>
    <nav className="ms-mobile-nav" aria-label="Studio sections"><a href="/studio">Playground</a><a href="/studio/catalog">Model catalog</a><a href="/studio/compare">Compare models</a><a href="/agents">Agents</a></nav>
    <div className="ms-workspace">
      <aside className="ms-sidebar"><div className="ms-sidebar-head"><p className="ms-section-label">MODELS</p><span>{models.length} catalog entries</span></div><div className="ms-search"><Search size={16}/><input aria-label="Search Muse models" placeholder="Search models..." value={filter} onChange={e=>setFilter(e.target.value)}/></div>
        <div className="ms-model-list">{grouped.map(group=><section key={group.key}><h3>{group.title}</h3>{group.models.map(m=>{const Icon=FAMILY_ICONS[m.family];return <button key={m.id} className={`ms-model ${selected===m.id?'active':''}`} onClick={()=>chooseModel(m.id)} disabled={busy}><span className="ms-model-icon"><Icon size={17}/></span><span className="ms-model-copy"><strong>{m.name}</strong><small>{m.id}</small></span><span className={`ms-state ${m.availability==='listed'?'listed':m.api?'unverified':'disabled'}`} title={m.availability}/></button>;})}</section>)}</div>
        <div className="ms-side-foot"><div className="ms-status-title"><CheckCircle2 size={15}/> Connected model catalog</div><p>{listingError?`Availability check: ${listingError}`:'Availability shown from Meta /models; individual requests still depend on account access.'}</p><a href="https://dev.meta.ai/docs/models" target="_blank" rel="noreferrer">View official model documentation <ArrowRight size={12}/></a></div>
      </aside>
      <main className="ms-main">
        <div className="ms-main-head"><div><div className="ms-overline"><Sparkles size={14}/> MODEL WORKSPACE <span className="ms-breadcrumb">/ {modeTitle}</span></div><h1>{selectedModel.name}</h1><p>{selectedModel.description}</p></div><div className="ms-head-actions"><button className="ms-outline" onClick={exportSession}><Download size={15}/> Export</button><button className="ms-outline" onClick={copyCode} disabled={!selectedModel.api}><Code2 size={15}/> Copy API code</button></div></div>
        <div className="ms-model-banner"><span className={`ms-availability ${selectedModel.availability}`}>{selectedModel.availability==='listed'?'Listed for key':selectedModel.availability==='unverified'?'API access unverified':selectedModel.availability==='not-listed'?'Not listed for key':selectedModel.availability==='muse-code-only'?'Muse Code only':'Self-host required'}</span><code>{selected}</code>{selectedModel.mode==='contributor'&&<span className="ms-contributor"><ShieldAlert size={13}/> Contributor data-use mode</span>}</div>
        {selectedModel.family==='reasoning'&&selectedModel.api&&<div className="ms-tabs"><button className={tab==='playground'?'selected':''} onClick={()=>setTab('playground')}><MessageSquare size={15}/> Playground</button><button className={tab==='compare'?'selected':''} onClick={()=>setTab('compare')}><Split size={15}/> Compare models</button></div>}
        {!canRun?<div className="ms-disabled-panel"><Layers3 size={33}/><h2>{selectedModel.mode==='self-hosted'?'Connect a local inference server':'This model is not runnable with your current Meta API catalog'}</h2><p>{selectedModel.mode==='self-hosted'?'This is an open-weight model. It needs local or remote GPU hosting, plus a separate endpoint adapter. Selecting it here does not deploy the model.':selectedModel.mode==='muse-code-only'?'Muse Wonder Full is a Muse Code subscription variant, not a Model API endpoint.':'This ID was not returned by Meta /models for the configured key. Check account access and refresh.'}</p></div>
        :selectedModel.family==='reasoning'&&tab==='compare'?<>
          <div className="ms-compare-settings"><label>Left model<select value={leftCompare} onChange={e=>setLeftCompare(e.target.value)}>{models.filter(m=>m.family==='reasoning'&&m.api&&m.mode==='api'&&m.availability!=='not-listed').map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Right model<select value={rightCompare} onChange={e=>setRightCompare(e.target.value)}>{models.filter(m=>m.family==='reasoning'&&m.api&&m.mode==='api'&&m.availability!=='not-listed').map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><button className="ms-primary" onClick={runCompare} disabled={busy||!prompt.trim()}><Split size={15}/> Compare (2 requests)</button></div>
          <div className="ms-compare-results">{[leftCompare,rightCompare].map((id,index)=><div key={index} className="ms-compare-col"><h3>{models.find(m=>m.id===id)?.name||id}</h3><pre>{compareResults[String(index)]||'The independent model response will appear here.'}</pre></div>)}</div>
        </>:selectedModel.family==='reasoning'||selectedModel.family==='segmentation'?<section className="ms-chat-panel"><div className="ms-chat-scroll">{!messages.length&&!streamText?<div className="ms-empty"><span className="ms-empty-icon"><FamilyIcon size={29}/></span><h2>{selectedModel.family==='segmentation'?'Segment anything':'Create with '+selectedModel.name}</h2><p>{selectedModel.family==='segmentation'?'Upload an image and enter a short object label. Raw SAM geometry output appears here.':'Edit the system instructions and generation settings, then run a prompt.'}</p>{selectedModel.family==='reasoning'&&<div className="ms-prompt-suggest">{SUGGESTIONS.map(s=><button key={s} onClick={()=>setPrompt(s)}>{s}<ArrowRight size={14}/></button>)}</div>}</div>:messages.map((m,i)=><article className={`ms-chat-item ${m.role}`} key={i}><div className="ms-avatar">{m.role==='user'?'U':'✦'}</div><div><b>{m.role==='user'?'You':selectedModel.name}</b><p>{m.text}</p>{m.image&&<small>Attached: {m.image}</small>}</div></article>)}{streamText&&<article className="ms-chat-item assistant"><div className="ms-avatar">✦</div><div><b>{selectedModel.name} • Streaming</b><p>{streamText}<span className="ms-cursor">▍</span></p></div></article>}</div>
          <div className="ms-composer"><textarea aria-label="Prompt" value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={12000} rows={3} placeholder={selectedModel.family==='segmentation'?'Name an object, such as glasses or a red bicycle...':'Enter a prompt. Shift + Enter for a new line.'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void runText();}}}/><div className="ms-compose-bottom"><label className="ms-file"><UploadCloud size={16}/>{image?image.name:'Attach image'}<input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={e=>setImage(e.target.files?.[0]??null)}/></label>{image&&<button className="ms-remove" onClick={()=>setImage(null)} title="Remove image"><X size={15}/></button>}<span className="ms-compose-fill"/><span className="ms-shortcut">↵ send · ⇧↵ new line</span><button className="ms-primary" onClick={busy?stop:runText} disabled={!busy&&(!prompt.trim()||(selectedModel.family==='segmentation'&&!image))}>{busy?<><Square size={15}/> Stop</>:<><Send size={15}/> Run</>}</button></div></div>
        </section>:selectedModel.family==='image'?<section className="ms-feature-panel"><div className="ms-feature-heading"><WandSparkles size={23}/><div><h2>Generate or edit an image</h2><p>One image per request. Add a reference image to switch into editing mode.</p></div></div><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the image you want to create or how to edit your image..." rows={5} maxLength={4000}/><div className="ms-feature-controls"><label>Aspect ratio<select value={imgSize} disabled={!!image} onChange={e=>setImgSize(e.target.value)}><option value="1024x1024">Square (1:1)</option><option value="1536x1024">Landscape (3:2)</option><option value="1024x1536">Portrait (2:3)</option></select></label><label className="ms-file"><UploadCloud size={16}/>{image?image.name:'Reference image (optional)'}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImage(e.target.files?.[0]??null)}/></label>{image&&<button className="ms-outline" onClick={()=>setImage(null)}>Clear reference</button>}<button className="ms-primary" disabled={busy||prompt.trim().length<3} onClick={generateImage}>{busy?<LoaderCircle size={15} className="ms-spin"/>:<WandSparkles size={15}/>} {image?'Edit image':'Generate image'}</button></div>{imageResult?<div className="ms-image-result"><img src={imageResult} alt="Generated by Muse Image"/><a download="muse-nova-generated.png" href={imageResult}><Download size={15}/> Save image</a></div>:<div className="ms-placeholder-art"><ImageIcon size={28}/><span>Generated images appear here</span></div>}</section>
        :selectedModel.family==='audio'?<section className="ms-feature-panel"><div className="ms-feature-heading"><FileAudio size={25}/><div><h2>Muse Voice Transcribe</h2><p>Upload a mono 16-bit PCM WAV (16 or 24 kHz, up to 90 seconds) to use your existing verified voice service.</p></div></div><label className="ms-big-upload"><UploadCloud size={29}/><strong>{audioFile?audioFile.name:'Choose a WAV recording'}</strong><span>Audio is sent to the Meta API only when you click Transcribe.</span><input hidden type="file" accept=".wav,audio/wav" onChange={e=>setAudioFile(e.target.files?.[0]??null)}/></label><button className="ms-primary" disabled={!audioFile||busy} onClick={transcribe}>{busy?<LoaderCircle className="ms-spin" size={15}/>:<AudioLines size={16}/>} Transcribe audio</button>{transcript&&<div className="ms-transcript"><h3>Transcript</h3><p>{transcript}</p><button onClick={()=>navigator.clipboard.writeText(transcript)} className="ms-outline"><Copy size={14}/> Copy</button></div>}<a className="ms-text-link" href="/">Continuous voice conversations are also available in the main assistant.</a></section>
        :null}
        {error&&<div className="ms-error"><ShieldAlert size={17}/><span>{error}</span><button onClick={()=>setError('')}><X size={15}/></button></div>}
        <footer className="ms-footer"><span><Check size={13}/> Your API key stays on the FastAPI server</span><span>Live model calls may use your Meta credits · No hard spending cap yet</span></footer>
      </main>
      <aside className={`ms-inspector ${showSettings?'':'collapsed'}`}><div className="ms-inspector-title"><h2><SlidersHorizontal size={18}/> Run settings</h2><button onClick={()=>setShowSettings(s=>!s)} aria-label="Toggle settings"><Settings2 size={16}/></button></div>{showSettings&&<div className="ms-inspector-body"><div className="ms-model-summary"><span><FamilyIcon size={20}/></span><div><b>{selectedModel.name}</b><small>{selectedModel.id}</small></div></div>
        {selectedModel.family==='reasoning'&&<><label className="ms-setting"><span>System instructions</span><textarea value={instructions} onChange={e=>setInstructions(e.target.value)} rows={6} maxLength={6000}/></label><label className="ms-setting"><span>Reasoning effort</span><select value={effort} onChange={e=>setEffort(e.target.value)}>{['minimal','low','medium','high','xhigh',...(supportsMaxReasoning(selected)?['max']:[])].map(x=><option key={x} value={x}>{x}</option>)}</select></label><label className="ms-setting"><span>Max output tokens <b>{maxTokens.toLocaleString()}</b></span><input type="range" min={128} max={8192} step={128} value={maxTokens} onChange={e=>setMaxTokens(Number(e.target.value))}/></label>{isContributor&&<label className="ms-contrib-confirm"><input type="checkbox" checked={contributorAck} onChange={e=>setContributorAck(e.target.checked)}/><span>I understand Contributor mode may use submitted data for model training.</span></label>}</>}
        <div className="ms-divider"/><h3 className="ms-inspector-subtitle">Session</h3><div className="ms-info-row"><span>Model endpoint</span><b>{selectedModel.mode==='self-hosted'?'Not connected':selectedModel.mode==='muse-code-only'?'Muse Code':'Meta API'}</b></div><div className="ms-info-row"><span>Availability</span><b>{selectedModel.availability.replaceAll('-',' ')}</b></div><div className="ms-info-row"><span>Conversation turns</span><b>{Math.floor(messages.length/2)}</b></div>{lastUsage&&<><div className="ms-divider"/><h3 className="ms-inspector-subtitle">Last request usage</h3><div className="ms-info-row"><span>Input tokens</span><b>{lastUsage.input_tokens??'—'}</b></div><div className="ms-info-row"><span>Output tokens</span><b>{lastUsage.output_tokens??'—'}</b></div><div className="ms-info-row"><span>Cached input</span><b>{lastUsage.cached_input_tokens??'—'}</b></div></>}
        <div className="ms-divider"/><div className="ms-warning"><ShieldAlert size={15}/><span>Local development only. Do not expose this application to the internet or paste API keys into prompts. Your $150 credit balance cannot be retrieved from this page.</span></div>
        <button className="ms-reset" onClick={()=>{if(!busy){setMessages([]);setResponseId(null);setStreamText('');setLastUsage(null);setError('');}}}><Plus size={15}/> New session</button>
      </div>}</aside>
    </div>
  </div>;
}
