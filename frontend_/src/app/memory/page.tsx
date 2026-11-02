'use client';
import {useCallback,useEffect,useState} from 'react';
import {ArrowLeft,BookOpen,Brain,Database,MessageSquare,Plus,RefreshCw,Search,ShieldCheck,Trash2} from 'lucide-react';
import './memory.css';
import {ACTIVE_KEY,STORE_KEY,readThreads,newThread,type ChatMessage,type Thread} from '@/lib/types';

type Memory={id:string;kind:string;content:string;created_at:string;updated_at:string;score?:number};
type Thread={id:string;title:string;updated_at:string;last_answer:string};
type ChatTurn={role?:string;text?:string;prompt?:string;answer?:string};
type Status={enabled:boolean;status:string;checkpointing:string;vector_mode:string};
const categories=['preference','fact','project','instruction'];

async function json<T>(path:string,init?:RequestInit):Promise<T>{
  const r=await fetch('/api/memory/'+path,{cache:'no-store',...init});
  const d=await r.json().catch(()=>({detail:'Could not read server response'}));
  if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:`HTTP ${r.status}`);
  return d as T;
}

export default function MemoryPage(){
  const [status,setStatus]=useState<Status|null>(null);
  const [items,setItems]=useState<Memory[]>([]);
  const [threads,setThreads]=useState<Thread[]>([]);
  const [category,setCategory]=useState('fact');
  const [content,setContent]=useState('');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'chat'|'research'>('chat');
  const [selected,setSelected]=useState<string|null>(null);
  const [history,setHistory]=useState<ChatTurn[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [editing,setEditing]=useState<string|null>(null);
  const [editText,setEditText]=useState('');

  const refresh=useCallback(async()=>{
    try{
      const s=await json<Status>('status');setStatus(s);
      if(s.status!=='ready')return;
      const [m,t]=await Promise.all([json<{items:Memory[]}>('items'),json<{items:Thread[]}>(`threads?category=${filter}`)]);
      setItems(m.items);setThreads(t.items);setError('');
    }catch(e){setError(e instanceof Error?e.message:'Could not refresh memory');}
  },[filter]);
  useEffect(()=>{void refresh();},[refresh]);

  async function add(){
    if(!content.trim()||busy)return;
    setBusy(true);setError('');
    try{await json('items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:category,content:content.trim()})});setContent('');setNotice('Memory saved locally.');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Could not save memory');}
    finally{setBusy(false);}
  }
  async function search(){
    if(!query.trim()){await refresh();return;}
    try{const data=await json<{items:Memory[]}>('search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query.trim(),limit:10})});setItems(data.items);setNotice('Search uses lexical vector similarity, not neural embeddings.');}
    catch(e){setError(e instanceof Error?e.message:'Search failed');}
  }
  async function updateMemory(item:Memory){
    if(!editText.trim())return;
    try{await json(`items/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content:editText.trim(),kind:item.kind})});setEditing(null);setEditText('');await refresh();setNotice('Memory updated.');}
    catch(e){setError(e instanceof Error?e.message:'Could not update memory');}
  }
  function exportMemories(){
    const safe=items.map(({id,kind,content,created_at,updated_at})=>({id,kind,content,created_at,updated_at}));
    const url=URL.createObjectURL(new Blob([JSON.stringify({exported_at:new Date().toISOString(),memories:safe},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='muse-nova-memories.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function remove(id:string){
    if(!window.confirm('Delete this saved memory permanently?'))return;
    try{await json(`items/${id}`,{method:'DELETE'});await refresh();setNotice('Memory deleted.');}
    catch(e){setError(e instanceof Error?e.message:'Delete failed');}
  }
  async function openThread(id:string){
    try{const data=await json<{history:ChatTurn[]}>(`threads/${id}?category=${filter}`);setSelected(id);setHistory(data.history);}
    catch(e){setError(e instanceof Error?e.message:'Could not open history');}
  }
  async function resumeChat(id:string){
    if(filter!=='chat')return;
    try{
      const data=await json<{history:ChatTurn[]}>(`threads/${id}?category=chat`);
      const old=readThreads();
      const existing=old.find(t=>t.conversationId===id);
      if(existing){
        localStorage.setItem(ACTIVE_KEY,existing.id);
        window.location.assign('/');
        return;
      }
      const now=Date.now();
      const turns:ChatMessage[]=data.history.filter(h=>h.role==='assistant'||h.role==='user')
        .map((h,i)=>({id:crypto.randomUUID(),role:h.role as 'assistant'|'user',
          text:h.text||'',status:'done',createdAt:now-i*1000}));
      const thread:Thread={...newThread(),title:threads.find(t=>t.id===id)?.title||'Restored conversation',
        conversationId:id,messages:turns,createdAt:now,updatedAt:now};
      localStorage.setItem(STORE_KEY,JSON.stringify([thread,...old].slice(0,24)));
      localStorage.setItem(ACTIVE_KEY,thread.id);
      window.location.assign('/');
    }catch(e){setError(e instanceof Error?e.message:'Could not restore conversation');}
  }
  async function removeThread(id:string){
    if(!window.confirm('Permanently delete this conversation and all its LangGraph checkpoints?'))return;
    try{await json(`threads/${id}?category=${filter}`,{method:'DELETE'});setSelected(null);setHistory([]);await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Delete failed');}
  }
  async function clearMemories(){
    if(window.prompt('Type DELETE_ALL_SAVED_MEMORIES to permanently erase every saved memory')!=='DELETE_ALL_SAVED_MEMORIES')return;
    try{await json('clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE_ALL_SAVED_MEMORIES'})});await refresh();setNotice('All saved memories cleared. Chat threads were not deleted.');}
    catch(e){setError(e instanceof Error?e.message:'Clear failed');}
  }

  return <main className="memory-shell">
    <header className="memory-top"><a href="/"><ArrowLeft size={16}/> MUSE Nova</a><span>Phase 6 · Persistent Intelligence</span></header>
    <div className="memory-heading"><div className="memory-eyebrow"><Brain size={18}/> MUSE NOVA / MEMORY CENTER</div><h1>Give your assistant context.</h1><p>Saved memories are explicit and editable. LangGraph keeps your conversations and research workflow history across backend restarts.</p></div>
    <section className="memory-stats"><div><Database size={19}/><span>Database</span><strong>{status?.status??'Checking...'}</strong></div><div><BookOpen size={19}/><span>Saved memories</span><strong>{items.length}</strong></div><div><MessageSquare size={19}/><span>Stored {filter} threads</span><strong>{threads.length}</strong></div></section>
    {status?.status!=='ready'&&<div className="memory-warning"><ShieldCheck size={19}/> Persistence not ready. Start PostgreSQL, install the Phase 6 packages, set MEMORY_ENABLED=true, and restart FastAPI.</div>}
    {error&&<div className="memory-error" role="alert">{error}</div>}{notice&&<div className="memory-notice">{notice}</div>}
    <div className="memory-grid"><section className="memory-panel"><div className="memory-panel-head"><h2>Saved knowledge</h2><button onClick={()=>void refresh()} aria-label="Refresh"><RefreshCw size={16}/></button></div>
      <label htmlFor="memory-kind">Memory category</label><select id="memory-kind" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
      <label htmlFor="memory-content">Save a fact or preference explicitly</label><textarea id="memory-content" maxLength={1200} rows={3} value={content} onChange={e=>setContent(e.target.value)} placeholder="For example: Prefer concise answers with code examples."/>
      <button className="memory-primary" onClick={()=>void add()} disabled={busy||!content.trim()||status?.status!=='ready'}><Plus size={15}/> Save memory</button>
      <div className="memory-search"><input aria-label="Search memories" placeholder="Search stored memories..." value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void search();}}/><button onClick={()=>void search()}><Search size={16}/></button></div>
      <div className="memory-list">{items.map(item=><article className="memory-card" key={item.id}><div><span className="memory-kind">{item.kind}</span>{typeof item.score==='number'&&<small>Match: {Math.round(item.score*100)}%</small>}</div>{editing===item.id?<div><textarea aria-label="Edit memory" value={editText} onChange={e=>setEditText(e.target.value)} maxLength={1200} rows={3}/><button className="memory-inline-action" onClick={()=>void updateMemory(item)}>Save edit</button><button className="memory-inline-action" onClick={()=>setEditing(null)}>Cancel</button></div>:<p>{item.content}</p>}<div className="memory-row"><button className="memory-inline-action" onClick={()=>{setEditing(item.id);setEditText(item.content);}}>Edit</button><small>{new Date(item.updated_at).toLocaleString()}</small><button aria-label="Delete memory" onClick={()=>void remove(item.id)}><Trash2 size={16}/></button></div></article>)}{items.length===0&&<p className="memory-empty">No stored memories yet.</p>}</div>
      <button className="memory-inline-action" onClick={exportMemories}>Export displayed memories (JSON)</button><button className="memory-danger" onClick={()=>void clearMemories()} disabled={status?.status!=='ready'}>Clear all saved memories</button>
    </section>
    <section className="memory-panel"><div className="memory-panel-head"><h2>Durable threads</h2><span>LangGraph checkpoints</span></div>
      <div className="memory-tabs"><button className={filter==='chat'?'active':''} onClick={()=>{setFilter('chat');setSelected(null);setHistory([]);}}>Conversations</button><button className={filter==='research'?'active':''} onClick={()=>{setFilter('research');setSelected(null);setHistory([]);}}>Research runs</button></div>
      <div className="memory-list">{threads.map(t=><div className="memory-thread" key={t.id}><button className="memory-thread-main" onClick={()=>void openThread(t.id)}><strong>{t.title}</strong><span>{new Date(t.updated_at).toLocaleString()}</span></button><button aria-label="Delete thread" onClick={()=>void removeThread(t.id)}><Trash2 size={15}/></button></div>)}{threads.length===0&&<p className="memory-empty">No persistent threads yet. Send a message with memory enabled.</p>}</div>
      {selected&&<div className="memory-history"><h3>Thread transcript</h3>{filter==='chat'&&<button className="memory-primary" onClick={()=>void resumeChat(selected)}>Resume in Assistant</button>}{history.map((turn,i)=><div className="memory-turn" key={i}><strong>{turn.role==='user'?'You':turn.role==='assistant'?'MUSE Nova':'Research'}</strong><p>{turn.text || (turn.prompt ? `${turn.prompt}\n\nAnswer: ${turn.answer||''}` : '')}</p></div>)}</div>}
    </section></div>
    <footer className="memory-foot">Local-only, single-user development build. Chats are checkpointed only when MEMORY_ENABLED=true. Uploaded media bytes and API keys are not included in LangGraph checkpoints. Delete memories or threads using the controls above.</footer>
  </main>;
}
