'use client';

import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,CheckCircle2,Clock3,ExternalLink,FilePlus2,Globe2,LockKeyhole,Search,ShieldCheck,Square,TerminalSquare, XCircle} from 'lucide-react';
import {parseSseFrames} from '@/lib/sse';
import './agents.css';

type ResearchEvent={kind:string; message:string; name?:string; status?:string; number?:number};
type Source={title:string;url:string};
type Approval={action_id:string;title:string;preview:string;status?:string};
type AgentStatus={status:string;configured_search:boolean;allowlisted_domains:string[];max_rounds:number;max_tool_calls:number};
const prompts=[
  'Research the latest approaches to efficient multimodal agents and give me cited sources.',
  'Compare two public technical explanations of retrieval augmented generation.',
  'Research open-source developer tools for voice agents, then propose a Markdown note with findings.',
];

export default function AgentsPage(){
  const [prompt,setPrompt]=useState('');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<AgentStatus|null>(null);
  const [events,setEvents]=useState<ResearchEvent[]>([]);
  const [sources,setSources]=useState<Source[]>([]);
  const [approvals,setApprovals]=useState<Approval[]>([]);
  const [answer,setAnswer]=useState('');
  const [error,setError]=useState('');
  const [researchId,setResearchId]=useState<string|null>(null);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{setResearchId(localStorage.getItem('muse-research-thread-v1'));},[]);
  useEffect(()=>{fetch('/api/agent/status').then(r=>r.ok?r.json():Promise.reject()).then(setStatus).catch(()=>setStatus(null));},[]);

  async function runAgent(){
    if(busy || prompt.trim().length<3) return;
    const abort=new AbortController();controller.current=abort;
    setBusy(true);setAnswer('');setSources([]);setApprovals([]);setError('');setEvents([]);
    let pending='';let completed=false;
    const onFrame=(event:string,data:Record<string,unknown>)=>{
      if(event==='session' && typeof data.research_id==='string'){setResearchId(data.research_id);localStorage.setItem('muse-research-thread-v1',data.research_id);}
      if(event==='start'||event==='status'||event==='tool') setEvents(prev=>[...prev,{kind:event,message:String(data.message||''),name:typeof data.name==='string'?data.name:undefined,status:typeof data.status==='string'?data.status:undefined,number:typeof data.number==='number'?data.number:undefined}]);
      if(event==='approval') setApprovals(prev=>[...prev,{action_id:String(data.action_id||''),title:String(data.title||''),preview:String(data.preview||''),status:'pending'}]);
      if(event==='done'){
        completed=true;setAnswer(String(data.answer||''));
        if(Array.isArray(data.sources)) setSources(data.sources.filter((x):x is Source=>x && typeof x==='object' && typeof x.url==='string' && typeof x.title==='string'));
      }
      if(event==='error') throw new Error(String(data.message||'Research agent failed.'));
    };
    try{
      const res=await fetch('/api/agent/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:prompt.trim(),...(researchId?{research_id:researchId}:{})}),signal:abort.signal});
      if(!res.ok) {
        const problem:unknown = await res.json().catch(()=>null);
        const detail = problem && typeof problem==='object' && 'detail' in problem &&
          typeof (problem as {detail:unknown}).detail==='string' ? (problem as {detail:string}).detail : '';
        throw new Error(detail || `Agent service unavailable (HTTP ${res.status}).`);
      }
      const reader=res.body?.getReader();if(!reader) throw new Error('Server returned no event stream.');
      const decoder=new TextDecoder();
      while(true){const {done,value}=await reader.read();if(done)break;
        pending+=decoder.decode(value,{stream:true});const batch=parseSseFrames(pending);pending=batch.pending;
        for(const frame of batch.events) onFrame(frame.event,frame.data);
      }
      pending+=decoder.decode();if(pending.trim()){
        const batch=parseSseFrames(pending+'\n\n');for(const frame of batch.events)onFrame(frame.event,frame.data);
      }
      if(!completed) throw new Error('The agent stopped without a completed answer.');
    }catch(e){if((e as Error).name==='AbortError')setError('Research stopped by user.');else setError(e instanceof Error?e.message:'Research failed.');}
    finally{setBusy(false);controller.current=null;}
  }
  async function decide(a:Approval,approve:boolean){
    try{
      const r=await fetch(`/api/agent/actions/${encodeURIComponent(a.action_id)}/approve`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approve})});
      const result=await r.json();if(!r.ok)throw new Error(result.detail||'Approval failed.');
      setApprovals(old=>old.map(x=>x.action_id===a.action_id?{...x,status:approve?'saved':'rejected'}:x));
    }catch(e){setError(e instanceof Error?e.message:'Could not resolve approval.');}
  }
  return <main className="agent-shell">
    <header className="agent-top"><a href="/" className="agent-home"><ArrowLeft size={17}/> Back to MUSE Nova</a><span className="agent-version">Phase 5 · v0.8.0</span></header>
    <section className="agent-hero"><div className="agent-eyebrow"><span className="agent-dot"/> RESEARCH & TASK WORKSPACE</div><h1>Your AI research agent.</h1><p>Ask Muse to research public sources, inspect approved websites, calculate, and prepare notes for your approval. Every tool action is visible.</p>
      <div className="agent-flag"><ShieldCheck size={17}/> Local-only prototype · No shell, no email sending, no automatic file writes</div><div className="agent-flag"><BookOpen size={16}/> <a href="/memory" style={{color:'inherit'}}>Memory &amp; durable research history</a> · <button type="button" style={{background:'transparent',color:'inherit',border:'none',textDecoration:'underline'}} onClick={()=>{localStorage.removeItem('muse-research-thread-v1');setResearchId(null);setEvents([]);setAnswer('');setSources([]);}}>New research thread</button></div>
    </section>
    <section className="agent-composer"><label htmlFor="agent-prompt">Research task</label><textarea id="agent-prompt" value={prompt} disabled={busy} onChange={e=>setPrompt(e.target.value)} maxLength={4000} rows={4} placeholder="Investigate a topic and cite what you find..."/>
      <div className="agent-actions"><span>{prompt.length}/4000 characters</span><button disabled={!busy&&prompt.trim().length<3} onClick={()=>{if(busy){controller.current?.abort();}else void runAgent();}}>{busy?<><Square size={15}/> Stop</>:<><Search size={16}/> Start research <ArrowRight size={16}/></>}</button></div>
    </section>
    {!answer && !events.length && !busy && <section className="agent-suggest"><h2>Try a workflow</h2>{prompts.map(x=><button key={x} onClick={()=>setPrompt(x)}><BookOpen size={16}/>{x}<ArrowRight size={15}/></button>)}</section>}
    <div className="agent-grid"><section className="agent-panel"><div className="agent-panel-title"><Clock3 size={17}/> Task activity <span>{events.length} events</span></div>{!events.length?<p className="agent-empty">Tool actions and status updates will appear here.</p>:<ul className="agent-timeline">{events.map((e,i)=><li key={i}><span className="agent-timeline-dot"/><div><strong>{e.kind==='tool'?e.name||'Tool':e.kind==='start'?'Started':'Reasoning request'}</strong><small>{e.message||e.status||'Working'}</small></div></li>)}</ul>}</section>
    <section className="agent-panel"><div className="agent-panel-title"><Globe2 size={17}/> Research tools</div>
      <div className="agent-info"><span>Meta Muse Spark 1.3</span><strong>{status?'Connected':'Check backend'}</strong></div>
      <div className="agent-info"><span>Web search</span><strong>{status?.configured_search?'Configured':'Requires SearXNG'}</strong></div>
      <div className="agent-info"><span>Approved domains</span><strong>{status?.allowlisted_domains?.length??0}</strong></div>
      <div className="agent-info"><span>Safety</span><strong>Read-only + approval</strong></div>
      <p className="agent-note"><LockKeyhole size={14}/> Use only a local server. Search needs SearXNG and a domain allowlist.</p>
    </section></div>
    {error && <div className="agent-error"><XCircle size={18}/>{error}</div>}
    {answer && <section className="agent-result"><h2><CheckCircle2 size={21}/> Agent result</h2><div className="agent-answer">{answer}</div></section>}
    {!!sources.length && <section className="agent-result"><h2><ExternalLink size={20}/> Sources ({sources.length})</h2><div className="agent-sources">{sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"><strong>{s.title||new URL(s.url).hostname}</strong><span>{s.url}</span><ExternalLink size={15}/></a>)}</div></section>}
    {!!approvals.length && <section className="agent-result"><h2><FilePlus2 size={21}/> Actions awaiting your approval</h2>{approvals.map(a=><div className="agent-approval" key={a.action_id}><div><strong>{a.title}</strong><p>{a.preview}</p><small>Only a local Markdown note is supported. Approve to write one file.</small></div><div className="agent-approval-buttons">{a.status==='pending'?<><button className="agent-decline" onClick={()=>void decide(a,false)}>Reject</button><button onClick={()=>void decide(a,true)}>Approve save</button></>:<span>{a.status==='saved'?'Saved locally':'Rejected'}</span>}</div></div>)}</section>}
    <footer className="agent-foot"><TerminalSquare size={15}/> No personal login, persistent agent memory, or unrestricted browser actions yet. Do not expose the prototype publicly.</footer>
  </main>;
}
