'use client';

import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import StudioThemeToggle from '@/components/StudioThemeToggle';
import {Activity,ArrowLeft,ArrowRight,Check,CheckCircle2,ChevronRight,Cloud,Code2,Grid2X2,LayoutList,Layers3,RefreshCw,Search,SlidersHorizontal,Sparkles,X} from 'lucide-react';
import {availabilityLabel,canRunModel,fetchStudioModels,FAMILY_CAPABILITIES,MODEL_FAMILIES,type StudioFamily,type StudioModel} from '@/lib/studio-models';
import '../lab.css';
import '../ui-refresh.css';

type StatusFilter='all'|'listed'|'unverified'|'local';
const FAMILIES:(StudioFamily|'all')[]=['all','reasoning','image','audio','segmentation','local','other'];
const FALLBACK:StudioModel[]=[
  {id:'muse-spark-1.3',name:'Muse Spark 1.3',family:'reasoning',mode:'api',api:true,availability:'unverified',description:'Text, multimodal reasoning and agentic workflows.'},
  {id:'muse-wonder-1.0',name:'Muse Wonder',family:'reasoning',mode:'api',api:true,availability:'unverified',description:'Complex coding and longer-horizon reasoning.'},
  {id:'muse-image-1.0',name:'Muse Image',family:'image',mode:'api',api:true,availability:'unverified',description:'Image creation and editing.'},
  {id:'muse-voice-transcribe-1.0',name:'Muse Voice Transcribe',family:'audio',mode:'api',api:true,availability:'unverified',description:'Recorded and live speech recognition.'},
  {id:'sam-3.1',name:'SAM 3.1',family:'segmentation',mode:'api',api:true,availability:'unverified',description:'Image and video segmentation.'},
  {id:'muse-glimmer-30b',name:'Muse Glimmer 30B',family:'local',mode:'self-hosted',api:false,availability:'requires-local-deployment',description:'Open-weight model; host it yourself.'},
];
const COLORS:Record<StudioFamily,string>={reasoning:'violet',image:'pink',audio:'green',segmentation:'cyan',local:'amber',other:'slate'};

export default function CatalogPage(){
  const [models,setModels]=useState<StudioModel[]>(FALLBACK);
  const [query,setQuery]=useState('');
  const [family,setFamily]=useState<StudioFamily|'all'>('all');
  const [status,setStatus]=useState<StatusFilter>('all');
  const [sort,setSort]=useState<'featured'|'name'|'access'>('featured');
  const [view,setView]=useState<'grid'|'list'>('grid');
  const [loading,setLoading]=useState(false);
  const [catalogError,setCatalogError]=useState('');
  const [catalogStatus,setCatalogStatus]=useState('unverified');
  const [selected,setSelected]=useState<string>('muse-spark-1.3');
  const [compareIds,setCompareIds]=useState<string[]>([]);

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{const result=await fetchStudioModels();setModels(result.models);setCatalogStatus(result.catalog_status??'unverified');setCatalogError(result.listing_error??'');}
    catch(err){setCatalogError(err instanceof Error?err.message:'Catalog unavailable.');setCatalogStatus('unverified');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const visible=useMemo(()=>models.filter(m=>{
    const matchesText=(m.name+' '+m.id+' '+m.description).toLowerCase().includes(query.trim().toLowerCase());
    const matchesFamily=family==='all'||m.family===family;
    const matchesStatus=status==='all'||(status==='listed'&&m.availability==='listed')||(status==='unverified'&&m.availability==='unverified')||(status==='local'&&m.mode==='self-hosted');
    return matchesText&&matchesFamily&&matchesStatus;
  }).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='access'?((a.availability==='listed'?0:a.availability==='unverified'?1:2)-(b.availability==='listed'?0:b.availability==='unverified'?1:2))||a.name.localeCompare(b.name):0),[models,query,family,status,sort]);
  const active=models.find(m=>m.id===selected)??visible[0]??null;
  const selectableForCompare=(model:StudioModel)=>model.family==='reasoning'&&model.mode==='api'&&canRunModel(model);
  const toggleCompare=(model:StudioModel)=>{
    if(!selectableForCompare(model))return;
    setCompareIds(old=>old.includes(model.id)?old.filter(id=>id!==model.id):old.length<2?[...old,model.id]:[old[1],model.id]);
  };
  const href=compareIds.length===2?`/studio/compare?left=${encodeURIComponent(compareIds[0])}&right=${encodeURIComponent(compareIds[1])}`:'/studio/compare';

  return <div className="sc-root">
    <header className="sc-navbar">
      <Link className="sc-brand" href="/studio"><span className="sc-brand-icon"><Sparkles size={21}/></span><strong>MUSE <span>Nova</span></strong><small>STUDIO</small></Link>
      <nav className="sc-nav"><Link href="/studio"><ArrowLeft size={15}/> Playground</Link><Link href="/studio/catalog" className="current"><Layers3 size={15}/> Model catalog</Link><Link href="/studio/compare"><Activity size={15}/> Compare models</Link></nav>
      <div className="sc-nav-actions"><StudioThemeToggle/><button className="sc-refresh" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={15} className={loading?'sc-spin':''}/> Refresh availability</button></div>
    </header>
    <div className="sc-container">
      <div className="sc-heading"><div><span className="sc-eyebrow"><span className="sc-pulse"/> META MODEL API · MODEL EXPLORER</span><h1>Model catalog</h1><p>Discover models, inspect capabilities, and select what your Meta API account lists. Local models are shown separately.</p></div><div className="sc-head-actions"><div className="sc-head-stat"><b>{models.length}</b><span>Catalog models</span></div><div className="sc-head-stat"><b>{models.filter(m=>m.availability==='listed').length}</b><span>Listed by API</span></div></div></div>
      {catalogError&&<div role="status" className="sc-notice"><Cloud size={16}/> Could not verify the complete live catalog: {catalogError}. Availability shown as unverified where applicable.</div>}
      <div className="sc-catalog-layout"><aside className="sc-filters"><div className="sc-panel-title"><SlidersHorizontal size={16}/> Filters</div><label className="sc-search"><Search size={17}/><input aria-label="Search models" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name or ID"/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={15}/></button>}</label>
        <p className="sc-filter-label">Model family</p><div className="sc-filter-list">{FAMILIES.map(f=><button key={f} className={family===f?'active':''} onClick={()=>setFamily(f)}><span>{f==='all'?'All models':MODEL_FAMILIES[f]}</span><b>{f==='all'?models.length:models.filter(m=>m.family===f).length}</b></button>)}</div>
        <p className="sc-filter-label">Availability</p><div className="sc-filter-list">{([['all','All statuses'],['listed','Listed for API key'],['unverified','Access unverified'],['local','Self-hosted']] as const).map(([id,label])=><button key={id} onClick={()=>setStatus(id)} className={status===id?'active':''}><span>{label}</span>{status===id&&<Check size={15}/>}</button>)}</div>
        <p className="sc-helper">Availability comes from <code>GET /v1/models</code>. A listed model can still fail because of permissions, quotas, or endpoint differences.</p>
      </aside>
      <div className="sc-models-area"><div className="sc-results-bar"><div><b>{visible.length} results</b><span>{catalogStatus==='live'?'Live Meta model listing checked':'Using unverified catalog information'}</span></div><Link href={href} className={`sc-compare-link ${compareIds.length<2?'muted':''}`}><Activity size={16}/> Compare selected {compareIds.length}/2 <ArrowRight size={15}/></Link></div>
        <div className="sc-toolbar"><label className="sc-sort-label">Sort by <select aria-label="Sort models" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="featured">Featured</option><option value="name">Name (A–Z)</option><option value="access">API availability</option></select></label><div className="sc-view-picker" role="group" aria-label="Catalog layout"><button aria-label="Grid layout" aria-pressed={view==='grid'} className={view==='grid'?'active':''} onClick={()=>setView('grid')}><Grid2X2 size={16}/></button><button aria-label="List layout" aria-pressed={view==='list'} className={view==='list'?'active':''} onClick={()=>setView('list')}><LayoutList size={16}/></button></div></div>
        <div className={`sc-cards ${view==='list'?'sc-list-view':''}`}>{visible.map(m=><article key={m.id} className={`sc-model-card ${selected===m.id?'chosen':''}`}><div className="sc-card-top"><div className={`sc-model-emblem ${COLORS[m.family]}`}><Sparkles size={22}/></div><span className={`sc-status ${m.availability==='listed'?'listed':m.availability==='not-listed'?'missing':'unknown'}`}>{availabilityLabel(m.availability)}</span></div><h3>{m.name}</h3><code>{m.id}</code><p>{m.description}</p><div className="sc-tags">{(m.capabilities?.length?m.capabilities:FAMILY_CAPABILITIES[m.family]).slice(0,3).map(cap=><span key={cap}>{cap}</span>)}</div><div className="sc-card-bottom"><button onClick={()=>setSelected(m.id)}>Details <ChevronRight size={15}/></button>{selectableForCompare(m)&&<label className="sc-pick"><input type="checkbox" checked={compareIds.includes(m.id)} onChange={()=>toggleCompare(m)}/> Compare</label>}</div></article>)}</div>
        {visible.length===0&&<div className="sc-empty"><Search size={25}/><h3>No models found</h3><p>Change the search or availability filter.</p><button onClick={()=>{setQuery('');setStatus('all');setFamily('all');}}>Reset filters</button></div>}
      </div><aside className="sc-detail-panel"><span className="sc-eyebrow">MODEL DETAILS</span>{active?<><div className={`sc-detail-icon ${COLORS[active.family]}`}><Layers3 size={24}/></div><h2>{active.name}</h2><code>{active.id}</code><p>{active.description}</p><div className="sc-divider"/><dl><div><dt>Category</dt><dd>{MODEL_FAMILIES[active.family]}</dd></div><div><dt>Availability</dt><dd>{availabilityLabel(active.availability)}</dd></div><div><dt>Service</dt><dd>{active.endpoint??'Not verified'}</dd></div><div><dt>Hosting</dt><dd>{active.mode==='self-hosted'?'Self-hosted':active.mode==='muse-code-only'?'Muse Code':active.mode==='unconfigured'?'Adapter needed':'Meta-hosted'}</dd></div></dl><div className="sc-divider"/><h4>Capabilities</h4><div className="sc-capabilities">{(active.capabilities?.length?active.capabilities:FAMILY_CAPABILITIES[active.family]).map(t=><span key={t}><CheckCircle2 size={14}/>{t}</span>)}</div><div className="sc-detail-actions">{canRunModel(active)?<Link href={`/studio?model=${encodeURIComponent(active.id)}`}><Sparkles size={15}/> Open playground</Link>:<span className="sc-unavailable">Requires a supported deployment or adapter</span>}{selectableForCompare(active)&&<button onClick={()=>toggleCompare(active)}>{compareIds.includes(active.id)?'Remove from comparison':'Add to comparison'}</button>}</div></>:<p>Select a model to see details.</p>}<div className="sc-panel-disclaimer">The catalog is descriptive, not a benchmark ranking. Prices and your remaining credits are not shown until verified.</div></aside></div>
      {compareIds.length>0&&<div className="sc-selection-dock" aria-live="polite"><div className="sc-dock-copy"><span className="sc-dock-symbol"><Activity size={18}/></span><div><strong>{compareIds.length} of 2 models selected</strong><small>{compareIds.map(id=>models.find(m=>m.id===id)?.name||id).join(' vs ')}</small></div></div><div className="sc-dock-actions"><button onClick={()=>setCompareIds([])}>Clear selection</button><Link href={href} aria-disabled={compareIds.length<2} className={compareIds.length<2?'disabled':''}>Compare now <ArrowRight size={15}/></Link></div></div>}
    </div>
  </div>;
}
