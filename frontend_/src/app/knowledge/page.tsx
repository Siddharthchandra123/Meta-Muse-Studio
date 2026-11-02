'use client';
import {useCallback,useEffect,useState,type ChangeEvent} from 'react';
import {ArrowLeft,BookOpen,Database,FileText,Plus,Search,ShieldCheck,Trash2,UploadCloud} from 'lucide-react';
import './knowledge.css';

type Collection={id:string;name:string;documents:number;chunks:number};
type Document={id:string;name:string;pages:number;chunks:number;version:number};
type Result={id:number;citation:string;content:string;page:number;name:string;score:number};
type SearchResult={mode:string;results:Result[]};
type Answer={answer:string;model:string|null;retrieval_mode:string;no_evidence:boolean;sources:{reference:string;citation:string;excerpt:string}[];usage?:{input_tokens:number;output_tokens:number}};
type Status={status:string;backend:string;embeddings_enabled:boolean;available_modes:string[];collections:number;documents:number;chunks:number};

class RagHttpError extends Error {
  constructor(public readonly status:number, detail:string){super(detail);this.name='RagHttpError';}
}
function isMissingCollection(error:unknown):error is RagHttpError{
  return error instanceof RagHttpError && error.status===404 && /knowledge collection not found/i.test(error.message);
}
function explainFailure(status:number,detail:string):string{
  if(status===404 && (/^not found$/i.test(detail)||/unknown rag route/i.test(detail))){
    return 'RAG endpoint not available on the running server. Start the v1.1.1 FastAPI backend and restart Next.js; check /v1/rag/status.';
  }
  if(status===404 && /knowledge collection not found/i.test(detail)){
    return 'Knowledge collection not found in the active SQLite database. It may have been deleted or the backend may be using a different RAG_SQLITE_PATH.';
  }
  return detail || `HTTP ${status}`;
}

async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch('/api/rag/'+path,{cache:'no-store',...init});
  const data=await response.json().catch(()=>({detail:'Invalid response from backend'}));
  if(!response.ok){
    const detail=typeof data.detail==='string'?data.detail:`HTTP ${response.status}`;
    throw new RagHttpError(response.status,explainFailure(response.status,detail));
  }
  return data as T;
}
export default function KnowledgeHub(){
  const [status,setStatus]=useState<Status|null>(null);
  const [collections,setCollections]=useState<Collection[]>([]);
  const [collectionId,setCollectionId]=useState('');
  const [documents,setDocuments]=useState<Document[]>([]);
  const [name,setName]=useState('');
  const [question,setQuestion]=useState('');
  const [mode,setMode]=useState('auto');
  const [consent,setConsent]=useState(false);
  const [answer,setAnswer]=useState<Answer|null>(null);
  const [searchResults,setSearchResults]=useState<SearchResult|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirmCollectionDelete,setConfirmCollectionDelete]=useState(false);
  const [deletePhrase,setDeletePhrase]=useState('');
  const [documentToDelete,setDocumentToDelete]=useState<Document|null>(null);

  const refresh=useCallback(async()=>{
    const [s,c]=await Promise.all([api<Status>('status'),api<{items:Collection[]}>('collections')]);
    setStatus(s);setCollections(c.items);
    setCollectionId(prev=>c.items.some(i=>i.id===prev)?prev:(c.items[0]?.id||''));
  },[]);
  useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[refresh]);
  useEffect(()=>{
    if(!collectionId){setDocuments([]);return;}
    let active=true;
    void api<{items:Document[]}>(`collections/${collectionId}/documents`)
      .then(d=>{if(active)setDocuments(d.items);})
      .catch(e=>{
        if(!active)return;
        setDocuments([]);
        if(isMissingCollection(e)){
          // Never retry the deleted/stale ID in a loop; show the cause.
          setCollectionId(prev=>prev===collectionId?'':prev);
          setAnswer(null);setSearchResults(null);
        }
        setError(e instanceof Error?e.message:String(e));
      });
    return ()=>{active=false;};
  },[collectionId]);

  async function createCollection(){
    if(!name.trim())return;
    setBusy(true);setError('');
    try{const c=await api<Collection>('collections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})});
      await refresh();setCollectionId(c.id);setName('');setAnswer(null);setSearchResults(null);setNotice('Collection created.');}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function upload(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value='';
    if(!file||!collectionId)return;
    setBusy(true);setError('');setNotice('Extracting and indexing '+file.name+'...');
    try{const data=new FormData();data.append('file',file);
      const res=await api<{status:string;chunks:number;pages:number}>(`collections/${collectionId}/documents`,{method:'POST',body:data});
      setNotice(`${res.status}: ${file.name} · ${res.pages} page(s) · ${res.chunks} chunks`);
      setDocuments((await api<{items:Document[]}>(`collections/${collectionId}/documents`)).items);
      await refresh();}
    catch(e){if(isMissingCollection(e)){setCollectionId('');setDocuments([]);}setError(e instanceof Error?e.message:String(e));setNotice('');}finally{setBusy(false);}
  }
  async function run(ask:boolean){
    if(!collectionId||!question.trim())return;
    setBusy(true);setError('');setAnswer(null);setSearchResults(null);
    try{
      const payload={collection_id:collectionId,query:question.trim(),mode,top_k:5};
      if(ask){const out=await api<Answer>('ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,consent_to_external_model:consent})});setAnswer(out);}
      else{const out=await api<SearchResult>('search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});setSearchResults(out);}
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function removeDocument(doc:Document){
    setBusy(true);setError('');
    try{
      await api(`collections/${collectionId}/documents/${doc.id}`,{method:'DELETE'});
      setDocuments(x=>x.filter(d=>d.id!==doc.id));await refresh();
      setNotice('Document removed from local index.');setDocumentToDelete(null);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function removeCollection(){
    if(!collectionId || !confirmCollectionDelete || deletePhrase!=='DELETE_COLLECTION')return;
    setBusy(true);setError('');
    try{
      await api(`collections/${collectionId}`,{method:'DELETE'});
      setConfirmCollectionDelete(false);setDeletePhrase('');setCollectionId('');
      setDocuments([]);setAnswer(null);setSearchResults(null);
      await refresh();setNotice('Collection deleted.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }

  return <main className="rag-shell">
    <header className="rag-top"><a href="/"><ArrowLeft size={16}/> MUSE Nova</a><span><BookOpen size={16}/> KNOWLEDGE HUB</span><a href="/studio">Muse Studio</a></header>
    <section className="rag-hero"><div><small>PHASE 6.5 • RAG AS A SERVICE</small><h1>Ask your own knowledge.</h1><p>Upload once. Index locally. Retrieve exact sources and optionally ask Muse Spark to explain them.</p></div><div className="rag-status"><Database size={20}/><strong>{status?.backend??'Connecting...'}</strong><span>{status?.documents??0} documents · {status?.chunks??0} chunks</span></div></section>
    {error&&<div className="rag-error" role="alert">{error}</div>}{notice&&<div className="rag-notice">{notice}</div>}
    <div className="rag-grid"><section className="rag-panel">
      <div className="rag-section-title rag-collection-header"><h2>Knowledge collections</h2><button type="button" disabled={busy} onClick={()=>void refresh().then(()=>{setError('');setNotice('Collections reloaded.');}).catch(e=>setError(String(e)))}>Refresh collections</button></div><div className="rag-inline"><input aria-label="New collection name" placeholder="New collection name" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/><button disabled={busy||!name.trim()} onClick={()=>void createCollection()}><Plus size={16}/> Create</button></div>
      <label htmlFor="rag-collection">Active collection</label><select id="rag-collection" value={collectionId} onChange={e=>{setCollectionId(e.target.value);setAnswer(null);setSearchResults(null);setConfirmCollectionDelete(false);setDeletePhrase('');setDocumentToDelete(null);}}><option value="">Select a collection</option>{collections.map(c=><option key={c.id} value={c.id}>{c.name} ({c.documents})</option>)}</select>
      <div className="rag-section-title"><h3>Indexed documents</h3><span>{documents.length} files</span></div>
      {documents.map(doc=><article className="rag-document" key={doc.id}><FileText size={18}/><div><strong>{doc.name}</strong><small>{doc.pages} pages · {doc.chunks} chunks · v{doc.version}</small></div><button aria-label={`Delete ${doc.name}`} onClick={()=>setDocumentToDelete(doc)} disabled={busy}><Trash2 size={16}/></button></article>)}
      {documentToDelete&&<div className="rag-confirm" role="group" aria-label="Confirm document deletion">
        <strong>Delete {documentToDelete.name}?</strong>
        <p>Its indexed content will be removed from this knowledge collection.</p>
        <div className="rag-confirm-actions"><button disabled={busy} onClick={()=>setDocumentToDelete(null)}>Cancel</button>
          <button className="rag-danger-action" disabled={busy} onClick={()=>void removeDocument(documentToDelete)}>Delete document</button></div>
      </div>}
      {documents.length===0&&<p className="rag-muted">No documents indexed yet. Upload a PDF, DOCX, TXT, MD or CSV file.</p>}
      <label className="rag-upload"><UploadCloud size={20}/> {busy?'Processing...':'Upload document'}<input type="file" aria-label="Upload document" accept=".pdf,.docx,.txt,.md,.csv" disabled={!collectionId||busy} onChange={e=>void upload(e)}/></label>
      <p className="rag-muted">12 MiB max. Original file bytes are not retained. Extracted text remains locally until deleted. Scanned PDFs require separate OCR.</p>
      <button className="rag-delete" disabled={!collectionId||busy} onClick={()=>{setConfirmCollectionDelete(v=>!v);setDeletePhrase('');}}>
        {confirmCollectionDelete?'Close delete confirmation':'Delete entire collection'}</button>
      {confirmCollectionDelete&&<div className="rag-confirm" role="group" aria-label="Confirm collection deletion">
        <strong>Delete this collection and all indexed documents?</strong>
        <p>This cannot be undone. Type <code>DELETE_COLLECTION</code> to confirm.</p>
        <input aria-label="Type DELETE_COLLECTION to confirm" autoComplete="off" spellCheck={false}
          value={deletePhrase} onChange={e=>setDeletePhrase(e.target.value)}/>
        <div className="rag-confirm-actions"><button disabled={busy} onClick={()=>{setConfirmCollectionDelete(false);setDeletePhrase('');}}>Cancel</button>
          <button className="rag-danger-action" disabled={busy||deletePhrase!=='DELETE_COLLECTION'} onClick={()=>void removeCollection()}>Delete collection permanently</button></div>
      </div>}
    </section><section className="rag-panel">
      <div className="rag-section-title"><h2>Retrieval playground</h2><span>{status?.embeddings_enabled?'Neural embeddings on':'Keyword-only local mode'}</span></div>
      <label htmlFor="rag-mode">Retrieval strategy</label><select id="rag-mode" value={mode} onChange={e=>setMode(e.target.value)}><option value="auto">Auto (recommended)</option><option value="keyword">Keyword / full text</option><option value="semantic" disabled={!status?.embeddings_enabled}>Semantic / neural vectors</option><option value="hybrid" disabled={!status?.embeddings_enabled}>Hybrid / RRF fusion</option></select>
      <label htmlFor="rag-question">Question</label><textarea id="rag-question" rows={4} maxLength={1000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="What does the report say about operational risks?"/>
      <div className="rag-actions"><button disabled={busy||!collectionId||!question.trim()} onClick={()=>void run(false)}><Search size={16}/> Retrieve sources (local)</button><button className="rag-primary" disabled={busy||!collectionId||!question.trim()||!consent} onClick={()=>void run(true)}>Ask Muse with citations</button></div>
      <label className="rag-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I agree to send this question and selected source excerpts to Meta Muse. Search-only never sends document content to Meta.</span></label>
      {answer&&<div className="rag-answer"><div className="rag-section-title"><h3>Muse response</h3><span>{answer.model??'No model needed'} · {answer.retrieval_mode}</span></div><p>{answer.answer}</p>{answer.sources.map(s=><div className="rag-source" key={s.reference}><strong>{s.reference} {s.citation}</strong><small>{s.excerpt}</small></div>)}{answer.usage&&<div className="rag-muted">Tokens: {answer.usage.input_tokens??'?'} input / {answer.usage.output_tokens??'?'} output</div>}</div>}
      {searchResults&&<div className="rag-answer"><h3>Retrieved evidence · {searchResults.mode}</h3>{searchResults.results.map((s,i)=><div className="rag-source" key={s.id}><strong>[{i+1}] {s.citation}</strong><small>{s.content}</small></div>)}{searchResults.results.length===0&&<p className="rag-muted">No matching sources were found.</p>}</div>}
      <p className="rag-muted"><ShieldCheck size={14}/> Cite the original documents, not a generated summary. Answers may be incomplete; verify important claims against source pages.</p>
    </section></div>
    <footer className="rag-footer">Local, single-user prototype. Do not expose this API on a public network without authentication, tenant isolation, quotas and encryption.</footer>
  </main>;
}
