'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import StudioThemeToggle from '@/components/StudioThemeToggle';
import {Activity,ArrowLeft,ArrowLeftRight,ArrowRight,CheckCircle2,Clock3,Copy,Download,Info,LoaderCircle,Play,RefreshCw,Send,ShieldAlert,SlidersHorizontal,Square,Sparkles,Timer,Hash} from 'lucide-react';
import {availabilityLabel,fetchStudioModels,formatNumber,isRunnableTextModel,supportsMaxReasoning,runStudioModel,type StudioModel,type Usage} from '@/lib/studio-models';
import '../lab.css';
import '../ui-refresh.css';

type Side='left'|'right';
type ComparisonResult={model:string;text:string;elapsed_ms:number|null;usage:Usage|null;state:'idle'|'running'|'completed'|'failed'|'stopped';error:string};
const SAMPLE_PROMPTS=[
  {label:'Reasoning',text:'A retailer offers a 20% discount and then applies 10% tax. Explain whether the final price is higher or lower than the original, with a numerical example.'},
  {label:'Coding',text:'Write a correct TypeScript function that parses newline-delimited JSON records from a stream. Include two edge-case tests.'},
  {label:'Research',text:'Explain the trade-offs between retrieval-augmented generation and fine-tuning for an internal knowledge assistant. Include a decision table.'},
];
const DEFAULT_MODELS:StudioModel[]=[
  {id:'muse-spark-1.3',name:'Muse Spark 1.3',family:'reasoning',mode:'api',api:true,availability:'unverified',description:'Fast reasoning and multimodal tasks'},
  {id:'muse-wonder-1.0',name:'Muse Wonder',family:'reasoning',mode:'api',api:true,availability:'unverified',description:'Long-running and complex tasks'},
];
const empty=(model:string):ComparisonResult=>({model,text:'',elapsed_ms:null,usage:null,state:'idle',error:''});
function duration(ms:number|null):string {return ms===null?'—':`${(ms/1000).toFixed(2)} s`;}
function modelName(id:string,models:StudioModel[]):string{return models.find(m=>m.id===id)?.name??id;}
export default function ComparePage(){
  const [models,setModels]=useState<StudioModel[]>(DEFAULT_MODELS);
  const [listingError,setListingError]=useState('');
  const [left,setLeft]=useState('muse-spark-1.3');
  const [right,setRight]=useState('muse-wonder-1.0');
  const [prompt,setPrompt]=useState(SAMPLE_PROMPTS[0].text);
  const [instructions,setInstructions]=useState('Answer accurately, show any assumptions, and format the answer clearly.');
  const [effort,setEffort]=useState('minimal');
  const [maxTokens,setMaxTokens]=useState(4096);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [results,setResults]=useState<Record<Side,ComparisonResult>>({left:empty('muse-spark-1.3'),right:empty('muse-wonder-1.0')});
  const abortRef=useRef<AbortController|null>(null);
  const mounted=useRef(true);
  const modelsAvailable=useMemo(()=>models.filter(isRunnableTextModel),[models]);
  const modelChoices=useMemo(()=>{
    const choices=modelsAvailable.slice();
    for(const id of [left,right]){
      const old=models.find(m=>m.id===id);
      if(old&&!choices.some(m=>m.id===id))choices.push(old);
    }
    return choices;
  },[models,modelsAvailable,left,right]);
  const maxSupported = supportsMaxReasoning(left) && supportsMaxReasoning(right);
  useEffect(()=>{if(effort==='max'&&!maxSupported)setEffort('xhigh');},[effort,maxSupported]);
  const validIds=left!==right&&modelsAvailable.some(m=>m.id===left)&&modelsAvailable.some(m=>m.id===right);
  const refresh=useCallback(async()=>{
    try{const data=await fetchStudioModels();setModels(data.models);setListingError(data.listing_error??'');}
    catch(err){setListingError(err instanceof Error?err.message:'Model catalog unavailable.');}
  },[]);
  useEffect(()=>{
    mounted.current=true;void refresh();
    const query=new URLSearchParams(window.location.search);
    const l=query.get('left'),r=query.get('right');
    // Use IDs only after cross-checking against the catalog selection controls.
    if(l&&/^[a-z0-9.-]{3,100}$/i.test(l))setLeft(l);
    if(r&&/^[a-z0-9.-]{3,100}$/i.test(r))setRight(r);
    return()=>{mounted.current=false;abortRef.current?.abort();};
  },[refresh]);
  const setSideResult=(side:Side,update:(old:ComparisonResult)=>ComparisonResult)=>setResults(old=>({...old,[side]:update(old[side])}));
  async function runComparison(){
    if(busy)return;
    if(!validIds){setError('Choose two different models that are available for hosted reasoning.');return;}
    if(!prompt.trim()){setError('Enter a prompt before comparing.');return;}
    setError('');setBusy(true);
    const controller=new AbortController();abortRef.current=controller;
    const ids={left,right};
    setResults({left:{...empty(left),state:'running'},right:{...empty(right),state:'running'}});
    // Independent requests: one failure must not hide the other result.
    const tasks=(['left','right'] as Side[]).map(async(side)=>{
      const began=performance.now();
      try{
        const response=await runStudioModel({model:ids[side],prompt:prompt.trim(),instructions,effort,max_output_tokens:maxTokens},controller.signal,chunk=>{
          if(!mounted.current)return;
          setSideResult(side,old=>({...old,text:old.text+chunk}));
        });
        if(mounted.current)setSideResult(side,old=>({...old,text:response.text,usage:response.usage??null,elapsed_ms:Math.round(performance.now()-began),state:'completed'}));
      }catch(err){
        if(mounted.current)setSideResult(side,old=>({...old,state:controller.signal.aborted?'stopped':'failed',error:controller.signal.aborted?'Cancelled by user':err instanceof Error?err.message:'Model request failed',elapsed_ms:Math.round(performance.now()-began)}));
      }
    });
    try{await Promise.all(tasks);}finally{if(mounted.current){setBusy(false);abortRef.current=null;}}
  }
  const stop=()=>abortRef.current?.abort();
  function downloadResults(){
    const data={schema:'muse-studio-comparison-v1',timestamp:new Date().toISOString(),prompt,instructions,reasoning_effort:effort,max_output_tokens:maxTokens,results};
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.download='muse-studio-comparison.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  async function copyResult(side:Side){await navigator.clipboard.writeText(results[side].text);}
  const complete=results.left.state==='completed'||results.right.state==='completed';
  const bothCompleted=results.left.state==='completed'&&results.right.state==='completed';
  const quicker=bothCompleted&&results.left.elapsed_ms!==null&&results.right.elapsed_ms!==null
    ?results.left.elapsed_ms===results.right.elapsed_ms?'Tie':results.left.elapsed_ms<results.right.elapsed_ms?'A':'B':null;
  const totalA=(results.left.usage?.input_tokens??0)+(results.left.usage?.output_tokens??0);
  const totalB=(results.right.usage?.input_tokens??0)+(results.right.usage?.output_tokens??0);
  const tokenTotal=(r:ComparisonResult)=>(r.usage?.input_tokens??0)+(r.usage?.output_tokens??0);
  return <div className="sc-root"><header className="sc-navbar"><Link className="sc-brand" href="/studio"><span className="sc-brand-icon"><Sparkles size={21}/></span><strong>MUSE <span>Nova</span></strong><small>STUDIO</small></Link><nav className="sc-nav"><Link href="/studio"><ArrowLeft size={15}/> Playground</Link><Link href="/studio/catalog"><RefreshCw size={15}/> Model catalog</Link><Link href="/studio/compare" className="current"><Activity size={15}/> Compare models</Link></nav><div className="sc-nav-actions"><StudioThemeToggle/><span className="sc-no-key"><CheckCircle2 size={15}/> Server-side Meta API</span></div></header>
    <div className="sc-compare-container"><div className="sc-heading sc-heading-compact"><div><span className="sc-eyebrow"><span className="sc-pulse"/> MUSE STUDIO · COMPARISON LAB</span><h1>Compare models</h1><p>Same prompt. Same instructions. Independent responses, usage and wall-clock times.</p></div><div className="sc-heading-buttons"><button onClick={()=>{const id=left;setLeft(right);setRight(id);}} disabled={busy}><ArrowLeftRight size={15}/> Swap</button><button onClick={downloadResults} disabled={!complete}><Download size={15}/> Export JSON</button></div></div>
      {listingError&&<div className="sc-notice"><Info size={16}/> Live model listing could not be confirmed: {listingError}. Models marked unverified may still be tested.</div>}
      <div className="sc-prompt-panel"><div className="sc-prompt-header"><h2><SlidersHorizontal size={18}/> Comparison setup</h2><span>Each run sends 2 billable API requests</span></div><div className="sc-two-pickers"><label>Model A<select aria-label="Model A" value={left} onChange={e=>setLeft(e.target.value)} disabled={busy}>{modelChoices.map(m=><option key={m.id} value={m.id}>{m.name} · {availabilityLabel(m.availability)}</option>)}</select></label><label>Model B<select aria-label="Model B" value={right} onChange={e=>setRight(e.target.value)} disabled={busy}>{modelChoices.map(m=><option key={m.id} value={m.id}>{m.name} · {availabilityLabel(m.availability)}</option>)}</select></label></div>
      <label className="sc-prompt-label">Prompt<textarea aria-label="Comparison prompt" rows={4} value={prompt} maxLength={12000} onChange={e=>setPrompt(e.target.value)} disabled={busy} placeholder="Write one prompt to run on both models"/></label><div className="sc-examples">{SAMPLE_PROMPTS.map(s=><button key={s.label} onClick={()=>setPrompt(s.text)} disabled={busy}>{s.label}</button>)}</div>
      <details className="sc-advanced"><summary>Advanced settings</summary><label>System instructions<textarea aria-label="System instructions" rows={2} maxLength={6000} value={instructions} onChange={e=>setInstructions(e.target.value)} disabled={busy}/></label><div className="sc-advanced-grid"><label>Reasoning effort<select value={effort} onChange={e=>setEffort(e.target.value)} disabled={busy}>{['minimal','low','medium','high','xhigh',...(maxSupported?['max']:[])].map(e=><option key={e} value={e}>{e}</option>)}</select></label><label>Maximum output tokens<input type="number" min={64} max={8192} step={64} value={maxTokens} onChange={e=>setMaxTokens(Math.min(8192,Math.max(64,Number(e.target.value)||64)))} disabled={busy}/></label></div></details>
      {error&&<div role="alert" className="sc-compare-error"><ShieldAlert size={17}/>{error}</div>}{!validIds&&<p className="sc-compare-caution"><Info size={15}/> Select two distinct runnable reasoning models. Image, speech, Contributor and self-hosted entries use different workflows and are excluded here.</p>}
      <div className="sc-run-row"><div><span className="sc-billing-dot"/> Comparison uses Meta credits. Actual credit balance is not available.</div><button className="sc-run-btn" disabled={!busy&&(!validIds||!prompt.trim())} onClick={busy?stop:()=>void runComparison()}>{busy?<><Square size={16}/> Stop both runs</>:<><Play size={16}/> Run comparison <ArrowRight size={16}/></>}</button></div></div>
      <div className="sc-comparison-grid">{(['left','right'] as Side[]).map((side,index)=>{const r=results[side],id=side==='left'?left:right;return <section className="sc-result-pane" key={side}><div className="sc-result-head"><div className="sc-side-label">MODEL {index===0?'A':'B'}</div><div className="sc-result-title"><span className="sc-result-icon"><Sparkles size={20}/></span><div><h3>{modelName(id,models)}</h3><code>{id}</code></div></div><span className={`sc-result-state ${r.state}`}>{r.state==='running'?<LoaderCircle className="sc-spin" size={13}/>:r.state==='completed'?<CheckCircle2 size={13}/>:<Clock3 size={13}/>} {r.state}</span></div><div className="sc-result-body">{r.error?<div role="alert" className="sc-result-error"><ShieldAlert size={18}/><p>{r.error}</p></div>:r.text?<div className="sc-result-text">{r.text}</div>:<div className="sc-result-placeholder"><Activity size={26}/><p>{r.state==='running'?'Model is generating a response…':'Run a comparison to see the model output.'}</p></div>}</div><div className="sc-result-metrics"><div><Timer size={15}/><span>Wall time</span><b>{duration(r.elapsed_ms)}</b></div><div><Hash size={15}/><span>Input tokens</span><b>{formatNumber(r.usage?.input_tokens)}</b></div><div><Hash size={15}/><span>Output tokens</span><b>{formatNumber(r.usage?.output_tokens)}</b></div><div><Activity size={15}/><span>Total tokens</span><b>{r.usage?formatNumber(tokenTotal(r)):'—'}</b></div></div><div className="sc-result-footer"><span>Per-request usage reported by Meta</span><button onClick={()=>void copyResult(side)} disabled={!r.text}><Copy size={14}/> Copy response</button></div></section>;})}</div>
      {bothCompleted&&<div className="sc-insight-strip" aria-live="polite"><div><span>Completed comparison</span><strong>2 model responses</strong><small>One prompt · two independent requests</small></div><div><span>Lower measured wall time</span><strong>{quicker==='Tie'?'Tie':quicker===null?'—':`Model ${quicker}`}</strong><small>Includes network overhead</small></div><div><span>Combined reported tokens</span><strong>{(totalA+totalB).toLocaleString()}</strong><small>Across both requests</small></div></div>}
      <div className="sc-footnote"><Info size={16}/><p>Wall time includes network transfer and any retries performed upstream. It is not an isolated benchmark of model inference speed. Compare both responses for factual correctness before choosing a model for production.</p></div>
    </div></div>;
}
