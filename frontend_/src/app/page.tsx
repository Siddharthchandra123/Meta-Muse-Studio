'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowUp, BookOpen, ChevronDown, CircleHelp, ImagePlus, Paperclip,
  Clipboard, Cloud, Database, Download, FileText, History, Monitor, Camera, MonitorOff,
  Menu, MessageCircle, Mic, Moon,
  Plus, Search, Settings2, ShieldCheck, Sparkles, Square, Sun, Trash2, Wifi, WifiOff, Volume2, VolumeX,
  X, Zap,
} from 'lucide-react';
import { parseSseFrames, type SSEFrame } from '@/lib/sse';
import { recordingToWav } from '@/lib/wav';
import { selectImages } from '@/lib/images';
import { selectDocuments } from '@/lib/documents';
import { captureFrame } from '@/lib/screen';
import LiveVoice from '@/components/LiveVoice';
import {
  ACTIVE_KEY, THEME_KEY, MAX_THREADS, STORE_KEY, type ChatMessage, type Health,
  type Thread, type Usage, type UsageSummary, newThread, persistThreads, readThreads,
} from '@/lib/types';

type View = 'chat' | 'usage';
const suggestions = [
  { icon: BookOpen, title: 'Explore a topic', prompt: 'Explain how real-time multimodal AI agents work and give me a learning roadmap.' },
  { icon: Sparkles, title: 'Brainstorm ideas', prompt: 'Help me brainstorm three practical projects combining voice AI and productivity.' },
  { icon: FileText, title: 'Improve my writing', prompt: 'Help me draft a professional introduction for a technical project called MUSE Nova.' },
  { icon: Zap, title: 'Plan a project', prompt: 'Create a realistic engineering plan for a multimodal personal assistant.' },
];
const money = (n: number) => `$${n < 0.01 ? n.toFixed(6) : n.toFixed(4)}`;
const dateLabel = (ms: number) => new Intl.DateTimeFormat('en', {month:'short', day:'numeric'}).format(ms);

function LocalImagePreview({file}: {file: File}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img className="image-queue-preview" src={url} alt={`Preview of ${file.name}`}/> : <ImagePlus size={18}/>;
}

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDocs, setPendingDocs] = useState<File[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [screenWithVoice, setScreenWithVoice] = useState(false);
  const screenWithVoiceRef = useRef(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [health, setHealth] = useState<Health | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const ttsRequestRef = useRef<AbortController | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const voiceBusyRef = useRef(false);
  const [liveActive, setLiveActive] = useState(false);
  const liveEnabledRef = useRef(false);
  const busyRef = useRef(false);
  const voiceQueueRef = useRef<{text:string; images:File[]}[]>([]);
  const voiceDrainingRef = useRef(false);
  const sendRef = useRef<(text:string, images?:File[])=>Promise<void>>(async()=>{});

  async function drainVoiceQueue() {
    if (voiceDrainingRef.current) return;
    voiceDrainingRef.current = true;
    try {
      while (liveEnabledRef.current && voiceQueueRef.current.length) {
        // Wait for an interrupted model request to leave its streaming state.
        while (busyRef.current && liveEnabledRef.current) {
          await new Promise(resolve=>setTimeout(resolve, 75));
        }
        if (!liveEnabledRef.current) break;
        const next = voiceQueueRef.current.shift();
        if (next) await sendRef.current(next.text,next.images);
      }
    } finally {
      voiceDrainingRef.current = false;
    }
  }

  async function onLiveTurn(text: string) {
    const clean = text.trim().slice(0,4000);
    if (!liveEnabledRef.current || !clean) return;
    const images:File[]=[];
    // Explicit opt-in. Never continuously upload frames in the background.
    if (screenWithVoiceRef.current && screenStreamRef.current?.active && screenVideoRef.current) {
      try { images.push(await captureFrame(screenVideoRef.current)); }
      catch (error) { setNotice(error instanceof Error ? error.message : 'Screen snapshot failed.'); }
    }
    if (!liveEnabledRef.current) return;
    if (voiceQueueRef.current.length >= 3) voiceQueueRef.current.shift();
    voiceQueueRef.current.push({text:clean,images});
    void drainVoiceQueue();
  }
  function onLiveSpeechStart() {
    // Real barge-in: a new speech boundary cancels currently playing Kokoro
    // audio and aborts any active Muse streaming request.
    stopPlayback();
    abortRef.current?.abort();
  }
  function onLiveModeChange(enabled: boolean) {
    liveEnabledRef.current = enabled;
    setLiveActive(enabled);
    if (!enabled) {
      voiceQueueRef.current=[];
      stopPlayback();
      abortRef.current?.abort();
    }
  }

  function stopScreenShare() {
    const stream=screenStreamRef.current;
    screenStreamRef.current=null;
    stream?.getTracks().forEach(track=>track.stop());
    if (screenVideoRef.current) screenVideoRef.current.srcObject=null;
    screenWithVoiceRef.current=false;
    setScreenWithVoice(false);
    setScreenSharing(false);
  }

  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNotice('Screen capture requires a supported browser on localhost.');return;
    }
    try {
      const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      const video=screenVideoRef.current;
      if (!video) { stream.getTracks().forEach(track=>track.stop());return; }
      screenStreamRef.current=stream;
      video.srcObject=stream;
      video.muted=true;
      await video.play();
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>stopScreenShare(),{once:true});
      setScreenSharing(true);
      setNotice('Screen shared locally. Nothing is uploaded until you capture or opt in to voice frames.');
    } catch (error) {
      stopScreenShare();
      setNotice(error instanceof Error ? error.message : 'Screen sharing cancelled.');
    }
  }

  async function attachScreenFrame() {
    if (!screenVideoRef.current || !screenStreamRef.current?.active) return;
    if (pendingImages.length>=3) {setNotice('Remove an image before adding a screen frame.');return;}
    try { queueImages([await captureFrame(screenVideoRef.current)]); }
    catch (error) {setNotice(error instanceof Error ? error.message : 'Screen capture failed.');}
  }

  // Release screen capture on component unmount, without uploading frames.
  useEffect(() => () => {screenStreamRef.current?.getTracks().forEach(track=>track.stop());}, []);

  function stopPlayback() {
    ttsRequestRef.current?.abort();
    ttsRequestRef.current = null;
    const audio = playbackRef.current;
    if (audio) { audio.pause(); audio.src = ''; playbackRef.current = null; }
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    playbackUrlRef.current = null;
    setSpeaking(false);
  }

  async function playSpeech(text: string) {
    stopPlayback();
    if (!text.trim()) return;
    const controller = new AbortController();
    ttsRequestRef.current = controller;
    try {
      setVoiceStatus('Generating Kokoro voice...');
      const response = await fetch('/api/voice/synthesize', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({text:text.trim().slice(0, 600), voice:'af_heart'}),
        signal: controller.signal,
      });
      if (!response.ok) {
        const info = await response.json().catch(()=>({detail:'Speech synthesis unavailable'}));
        throw new Error(String(info.detail || `HTTP ${response.status}`));
      }
      const wav = await response.blob();
      if (controller.signal.aborted) return;
      ttsRequestRef.current = null;
      const url = URL.createObjectURL(wav);
      const audio = new Audio(url);
      playbackRef.current = audio;
      playbackUrlRef.current = url;
      audio.onended = () => { stopPlayback(); setVoiceStatus(''); };
      audio.onerror = () => { stopPlayback(); setVoiceStatus('Audio playback failed.'); };
      await audio.play();
      setSpeaking(true);
      setVoiceStatus('Speaking — click Stop audio to interrupt');
    } catch (err) {
      if (controller.signal.aborted) return;
      stopPlayback();
      const text = err instanceof Error ? err.message : 'Voice playback failed';
      setVoiceStatus(text);
      setNotice(text);
    }
  }

  async function handleRecordedAudio(chunks: BlobPart[], mimeType: string) {
    voiceBusyRef.current = true;
    setVoiceBusy(true);
    setVoiceStatus('Transcribing with Muse Voice...');
    try {
      const wav = await recordingToWav(new Blob(chunks, {type:mimeType}));
      const form = new FormData();
      form.append('audio', wav, 'recording.wav');
      const response = await fetch('/api/voice/transcribe', {method:'POST', body:form});
      const result = await response.json();
      if (!response.ok) throw new Error(String(result.detail ?? `ASR HTTP ${response.status}`));
      const spokenText = String(result.transcript ?? '').trim();
      if (!spokenText) throw new Error('Muse did not detect any speech.');
      setVoiceStatus(`Heard: ${spokenText.slice(0, 90)}`);
      setMessage(spokenText);
      // Submit via the already-verified text streaming path. No new model contract.
      setVoiceBusy(false);
      voiceBusyRef.current = false;
      await send(spokenText);
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Transcription failed';
      setVoiceStatus('Voice input failed');
      setNotice(text);
    } finally {
      voiceBusyRef.current = false;
      setVoiceBusy(false);
    }
  }

  async function toggleMicrophone() {
    if (recording) {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      return;
    }
    if (busy || voiceBusyRef.current) return;
    stopPlayback();
    if (!navigator.mediaDevices?.getUserMedia || !('MediaRecorder' in window)) {
      setNotice('Your browser does not support microphone recording. Try current Chrome or Edge on localhost.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}});
      micStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => {if (event.data.size) chunks.push(event.data);};
      recorder.onerror = () => {setNotice('Microphone capture failed.'); setVoiceStatus('Microphone error');};
      recorder.onstop = () => {
        setRecording(false);
        if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
        stream.getTracks().forEach(track=>track.stop());
        micStreamRef.current = null;
        recorderRef.current = null;
        void handleRecordedAudio(chunks, recorder.mimeType);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setVoiceStatus('Recording — press Stop mic when you finish (60s max)');
      recordTimeoutRef.current = setTimeout(()=>{if (recorder.state==='recording') recorder.stop();}, 60000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Microphone permission denied.');
      setVoiceStatus('Microphone unavailable');
      micStreamRef.current?.getTracks().forEach(track=>track.stop());
      micStreamRef.current = null;
    }
  }


  useEffect(() => {
    const stored = readThreads();
    const loaded = stored.length ? stored : [newThread()];
    const wanted = localStorage.getItem(ACTIVE_KEY);
    setThreads(loaded);
    setActiveId(loaded.some(t => t.id === wanted) ? wanted : loaded[0].id);
    setTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
    setReady(true);
  }, []);

  useEffect(() => { if (ready) persistThreads(threads); }, [ready, threads]);
  useEffect(() => {
    if (ready && activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [ready, activeId]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (ready) localStorage.setItem(THEME_KEY, theme);
  }, [ready, theme]);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:busy?'auto':'smooth', block:'end'}); }, [threads, activeId, busy]);

  const refreshMetrics = useCallback(async () => {
    try {
      const [h, u] = await Promise.all([
        fetch('/api/health', {cache:'no-store'}),
        fetch('/api/usage', {cache:'no-store'}),
      ]);
      setHealth(h.ok ? await h.json() as Health : null);
      setSummary(u.ok ? await u.json() as UsageSummary : null);
    } catch { setHealth(null); setSummary(null); }
  }, []);
  useEffect(() => {
    void refreshMetrics();
    const timer = setInterval(() => void refreshMetrics(), 15000);
    return () => clearInterval(timer);
  }, [refreshMetrics]);

  const active = threads.find(t => t.id === activeId) ?? null;
  const visibleThreads = [...threads].sort((a,b)=>b.updatedAt-a.updatedAt)
    .filter(t => t.title.toLowerCase().includes(search.toLowerCase().trim()));
  const totalMessages = threads.reduce((n,t)=>n+t.messages.length,0);
  const observedTokens = threads.flatMap(t => t.messages).reduce((a,m)=>a+(m.usage?.input_tokens??0)+(m.usage?.output_tokens??0),0);

  function patchThread(id: string, fn: (old: Thread) => Thread) {
    setThreads(prev => prev.map(t => t.id === id ? fn(t) : t));
  }
  function patchMessage(threadId: string, msgId: string, fn: (old: ChatMessage) => ChatMessage) {
    patchThread(threadId, t => ({...t, updatedAt:Date.now(), messages:t.messages.map(m=>m.id===msgId?fn(m):m)}));
  }
  function queueImages(files: File[]) {
    if (busyRef.current || liveEnabledRef.current) return;
    const selection = selectImages(files, pendingImages.length);
    setPendingImages(existing => [...existing, ...selection.valid].slice(0, 3));
    if (selection.warnings.length) setNotice(selection.warnings[0]);
  }
  function queueDocuments(files:File[]) {
    if (busyRef.current || liveEnabledRef.current) return;
    const selection=selectDocuments(files,pendingDocs.length);
    setPendingDocs(existing=>[...existing,...selection.valid].slice(0,2));
    if (selection.warnings.length) setNotice(selection.warnings[0]);
  }
  function routeDroppedFiles(files:File[]) {
    queueImages(files.filter(file=>file.type.startsWith('image/')));
    queueDocuments(files.filter(file=>!file.type.startsWith('image/')));
  }
  function makeNewChat() {
    if (busy || recording || voiceBusy || liveActive) return;
    const next = newThread();
    setThreads(prev => [next, ...prev].slice(0, MAX_THREADS));
    setActiveId(next.id); setMessage(''); setPendingImages([]); setPendingDocs([]); setNotice(''); setView('chat'); setMobileMenu(false);
    inputRef.current?.focus();
  }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!busy) makeNewChat();
      } else if (event.key === '/' && !(event.target instanceof HTMLInputElement) &&
                 !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  });

  function selectThread(id: string) {
    if (busy || recording || voiceBusy || liveActive) return;
    setActiveId(id); setView('chat'); setNotice(''); setMobileMenu(false);
  }
  function deleteThread(id: string) {
    if (busy || recording || voiceBusy || liveActive || !window.confirm('Remove this chat from this browser? This does not delete Meta-hosted conversation history.')) return;
    const keep = threads.filter(t=>t.id!==id);
    if (!keep.length) keep.push(newThread());
    setThreads(keep);
    if (activeId===id) setActiveId(keep[0].id);
    setNotice('Local chat removed. Meta-hosted history is not deleted.');
  }
  function exportThread() {
    if (!active) return;
    const content = JSON.stringify({project:'MUSE Nova', exportedAt:new Date().toISOString(), thread:active},null,2);
    const blob = new Blob([content],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href=url; anchor.download=`muse-nova-chat-${dateLabel(Date.now()).replace(' ','-')}.json`; anchor.click();
    URL.revokeObjectURL(url);
  }
  function stopGeneration() {
    abortRef.current?.abort();
    stopPlayback();
  }

  async function send(prompt?: string, explicitImages?: File[]) {
    const imagesForTurn = explicitImages ?? (prompt === undefined ? [...pendingImages] : []);
    const docsForTurn = prompt === undefined ? [...pendingDocs] : [];
    const text = (prompt ?? message).trim() || (imagesForTurn.length || docsForTurn.length ? 'Please analyze the attached material, noting any uncertainty.' : '');
    if (!active || !text || busyRef.current || text.length > 4000) return;
    stopPlayback();
    const threadId = active.id;
    const outgoingConvId = active.conversationId;
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const now = Date.now();
    const userMsg: ChatMessage = {id:userId, role:'user', text, status:'done', createdAt:now, imageNames:imagesForTurn.map(f=>f.name), documentNames:docsForTurn.map(f=>f.name)};
    const assistantMsg: ChatMessage = {id:assistantId, role:'assistant', text:'', status:'streaming', createdAt:now};
    patchThread(threadId, t => ({
      ...t, title:t.messages.length ? t.title : text.slice(0, 52), updatedAt:now,
      messages:[...t.messages,userMsg,assistantMsg],
    }));
    setMessage(''); if (imagesForTurn.length && prompt === undefined) setPendingImages([]); if (docsForTurn.length) setPendingDocs([]); setNotice(''); setView('chat'); busyRef.current = true; setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let completed = false;
    let partialText = '';

    function handleFrame(frame: SSEFrame) {
      if (frame.event === 'session' && typeof frame.data.conversation_id === 'string') {
        patchThread(threadId, t => ({...t,conversationId:frame.data.conversation_id as string}));
      }
      if (frame.event === 'delta' && typeof frame.data.text === 'string') {
        partialText += frame.data.text;
        patchMessage(threadId, assistantId, m => ({...m,text:partialText}));
      }
      if (frame.event === 'error') {
        throw new Error(typeof frame.data.message === 'string' ? frame.data.message : 'The model stream failed.');
      }
      if (frame.event === 'done') {
        completed = true;
        // The terminal event carries authoritative full text. This recovers
        // from missing text-delta events and ensures an empty bubble is not marked done.
        if (typeof frame.data.answer === 'string' && frame.data.answer.trim()) {
          partialText = frame.data.answer;
        }
        const usage = frame.data.usage && typeof frame.data.usage === 'object'
          ? frame.data.usage as Usage : undefined;
        patchMessage(threadId, assistantId, m => ({...m,text:partialText,status:'done',usage}));
      }
    }

    try {
      let endpoint = '/api/chat/stream';
      let body: BodyInit = JSON.stringify({message:text,conversation_id:outgoingConvId});
      const headers: Record<string,string> = {'Content-Type':'application/json'};
      if (imagesForTurn.length || docsForTurn.length) {
        endpoint = '/api/chat/multimodal/stream';
        const form = new FormData();
        form.set('message', text);
        if (outgoingConvId) form.set('conversation_id', outgoingConvId);
        for (const file of imagesForTurn) form.append('images', file, file.name);
        for (const file of docsForTurn) form.append('documents',file,file.name);
        body = form;
        delete headers['Content-Type']; // Browser supplies the multipart boundary.
      }
      const result = await fetch(endpoint, {
        method:'POST', headers, body, signal:controller.signal,
      });
      if (!result.ok) {
        const err = await result.json().catch(()=>({detail:`HTTP ${result.status}`}));
        throw new Error(typeof err.detail==='string'?err.detail:`Request failed (${result.status}).`);
      }
      if (result.headers.get('X-MUSE-Session-Recovered') === 'true') {
        setNotice('FastAPI was restarted, so the model conversation context has restarted. Previous messages remain visible in this browser.');
      }
      if (!result.body) throw new Error('Streaming is unavailable in this browser.');
      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      while (true) {
        const {value,done} = await reader.read();
        if (done) break;
        const parsed = parseSseFrames(pending + decoder.decode(value,{stream:true}));
        pending = parsed.pending;
        for (const frame of parsed.events) handleFrame(frame);
      }
      // Flush any UTF-8 character split across the final network chunk.
      pending += decoder.decode();
      if (pending.trim()) {
        for (const frame of parseSseFrames(pending+'\n\n').events) handleFrame(frame);
      }
      if (!completed) throw new Error('The stream closed before the response completed. Check FastAPI logs.');
      if (!partialText.trim()) throw new Error('The model completed but supplied no readable text.');
      void refreshMetrics();
      if (autoSpeak || liveEnabledRef.current) void playSpeech(partialText);
    } catch (err) {
      const stopped = controller.signal.aborted;
      const detail = err instanceof Error ? err.message : 'Unexpected network error.';
      patchMessage(threadId, assistantId, m=>({...m,status:stopped?'stopped':'failed',text:m.text|| (stopped?'Generation stopped.':`Request failed: ${detail}`)}));
      setNotice(stopped
        ? 'Generation stopped. A stopped request may still consume credits or complete upstream.'
        : detail);
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  sendRef.current = send;

  return (
    <div className="app-shell">
      {mobileMenu && <button className="mobile-backdrop" aria-label="Close navigation" onClick={()=>setMobileMenu(false)}/>}
      <aside className={`sidebar ${mobileMenu?'mobile-open':''}`}>
        <div className="brand">
          <div className="brand-icon"><Sparkles size={21} strokeWidth={2.2}/></div>
          <div className="brand-copy"><strong>MUSE<span> NOVA</span></strong><small>Personal AI workspace</small></div>
          <button className="icon-btn mobile-close" aria-label="Close menu" onClick={()=>setMobileMenu(false)}><X size={18}/></button>
        </div>
        <button className="new-chat" onClick={makeNewChat} disabled={busy || recording || voiceBusy || liveActive}><Plus size={18}/> New conversation <span>Ctrl K</span></button>
        <div className="side-section-caption">WORKSPACE</div>
        <div className="side-nav">
          <button className={view==='chat'?'nav-entry selected':'nav-entry'} onClick={()=>{setView('chat');setMobileMenu(false);}}><MessageCircle size={17}/> Chats <span className="nav-count">{threads.length}</span></button>
          <a href="/studio" className="nav-entry"><Sparkles size={17}/> Muse Studio <span className="nav-count">NEW</span></a>
          <a href="/agents" className="nav-entry"><Sparkles size={17}/> Research Agent <span className="nav-count">NEW</span></a>
          <a href="/memory" className="nav-entry"><Database size={17}/> Memory Center <span className="nav-count">NEW</span></a>
          <a href="/knowledge" className="nav-entry"><Database size={17}/> Knowledge Hub <span className="nav-count">RAG</span></a>
          <button className={view==='usage'?'nav-entry selected':'nav-entry'} onClick={()=>{setView('usage');setMobileMenu(false);}}><Activity size={17}/> Usage & activity</button>
          <button className="nav-entry" onClick={()=>{setSettingsOpen(true);setMobileMenu(false);}}><Settings2 size={17}/> Settings</button>
        </div>
        <div className="side-divider"/>
        <div className="history-head"><span>RECENT CONVERSATIONS</span><History size={15}/></div>
        <div className="search-wrap"><Search size={15}/><input ref={searchRef} aria-label="Search local conversations" placeholder="Search conversations" value={search} onChange={e=>setSearch(e.target.value)}/><span>/</span></div>
        <div className="thread-list" aria-label="Conversations">
          {visibleThreads.length===0 && <p className="small-muted thread-empty">No matching conversations</p>}
          {visibleThreads.map(t => <div key={t.id} className={`thread-row ${activeId===t.id&&view==='chat'?'active':''}`}>
            <button onClick={()=>selectThread(t.id)} disabled={busy || recording || voiceBusy || liveActive} className="thread-select" title={t.title} aria-current={activeId===t.id&&view==='chat'?'page':undefined}>
              <MessageCircle size={15}/><span>{t.title}</span>
            </button>
            <button className="thread-delete" title="Remove local conversation" aria-label={`Remove ${t.title}`} disabled={busy || recording || voiceBusy || liveActive} onClick={()=>deleteThread(t.id)}><X size={14}/></button>
          </div>)}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-card"><ShieldCheck size={16}/><div><strong>Local development mode</strong><p>Your chat text stays in this browser and Meta-managed conversation history. Avoid sensitive data.</p></div></div>
          <div className="profile-row"><div className="avatar">MN</div><div><strong>Developer workspace</strong><small>Single-user prototype</small></div><span className="profile-dot"/></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-btn menu-toggle" aria-label="Open navigation" onClick={()=>setMobileMenu(true)}><Menu size={20}/></button><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-sep">/</span><strong>{view==='chat' ? 'AI Assistant' : 'Usage overview'}</strong></div></div>
          <div className="topbar-right">
            <div className="model-pill"><span className="model-dot"/><span>Muse Spark 1.3</span><ChevronDown size={13}/><span className="model-tooltip">Only configured model</span></div>
            <span className={`connection ${health ? 'connected':'disconnected'}`}>{health?<Wifi size={14}/>:<WifiOff size={14}/>}<span>{health?'Connected':'Offline'}</span></span>
            <button className="icon-btn" title="Preferences" aria-label="Preferences" onClick={()=>setSettingsOpen(true)}><Settings2 size={18}/></button>
          </div>
        </header>
        {view==='chat' ? (
          <div className="workspace">
            <div className="chat-head">
              <div><div className="eyebrow"><span className="eyebrow-orb"/> YOUR INTELLIGENT WORKSPACE</div><h1>{active?.messages.length ? active.title : 'Your next idea starts here.'}</h1><p>{active?.messages.length ? 'Continuing your conversation with MUSE Nova' : 'Ask, explore, create. Powered by Meta Muse.'}</p></div>
              <div className="head-actions"><button className="action-link" onClick={exportThread} disabled={!active?.messages.length} title="Export local transcript"><Download size={15}/> Export</button><span className="head-divider"/><button className="action-link" onClick={makeNewChat} disabled={busy || recording || voiceBusy || liveActive}><Plus size={15}/> New chat</button></div>
            </div>
            <div className="chat-scroll" aria-label="Conversation transcript" role="log" aria-live="polite" aria-relevant="additions text">
              {!active?.messages.length ? (
                <div className="welcome-panel">
                  <div className="welcome-orb"><Sparkles size={34}/></div>
                  <div className="welcome-kicker">MEET MUSE NOVA</div>
                  <h2>How can I help you <em>today?</em></h2>
                  <p>A thoughtful space for questions, ideas, and everything in between. Start with one of these prompts, or make your own.</p>
                  <div className="suggestions">
                    {suggestions.map(s=><button className="suggestion" key={s.title} onClick={()=>{setMessage(s.prompt);inputRef.current?.focus();}}><s.icon size={18}/><strong>{s.title}</strong><ArrowUp size={15} className="suggestion-arrow"/></button>)}
                  </div>
                </div>
              ) : <div className="messages">{active.messages.map(m=><article className={`chat-message ${m.role}`} key={m.id}>
                <div className={`msg-avatar ${m.role}`}>{m.role==='assistant'?<Sparkles size={16}/>:<span>U</span>}</div>
                <div className="msg-content"><div className="msg-meta"><strong>{m.role==='assistant'?'MUSE Nova':'You'}</strong><span>{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>{m.status==='streaming'&&<span className="typing-label">Generating</span>}{m.status==='failed'&&<span className="message-warning">Failed</span>}{m.status==='stopped'&&<span className="message-warning">Interrupted</span>}</div>
                  <div className="message-text">{m.text || (m.status==='streaming' ? <span className="typing-dots"><i/><i/><i/></span> : '')}</div>{m.role==='user' && !!m.imageNames?.length && <div className="sent-images" aria-label="Images shared in this turn">{m.imageNames.map((name,i)=><span className="sent-image-tag" key={`${i}-${name}`}><ImagePlus size={13}/>{name}</span>)}</div>}
                  {m.role==='user' && !!m.documentNames?.length && <div className="sent-images" aria-label="Documents shared in this turn">{m.documentNames.map((name,i)=><span className="sent-image-tag" key={`${i}-${name}`}><FileText size={13}/>{name}</span>)}</div>}
                  {m.role==='assistant' && m.status==='done' && <div className="message-tools"><button title="Copy reply" aria-label="Copy reply" onClick={()=>void navigator.clipboard.writeText(m.text)}><Clipboard size={13}/> Copy</button><button title="Play response using Kokoro" aria-label="Read reply aloud" onClick={()=>void playSpeech(m.text)}><Volume2 size={13}/> Listen</button>{m.usage?.estimated_cost_usd!=null&&<span>Est. {money(m.usage.estimated_cost_usd)}</span>}</div>}
                </div>
              </article>)}</div>}
              <div ref={endRef}/>
            </div>
            <div className="composer-zone">
              <video ref={screenVideoRef} aria-hidden="true" muted playsInline className="hidden-screen-preview"/>
              <div className="screen-controls" aria-label="Screen sharing controls">
                <button type="button" className="screen-btn" onClick={()=>screenSharing?stopScreenShare():void startScreenShare()}>
                  {screenSharing?<MonitorOff size={15}/>:<Monitor size={15}/>}
                  {screenSharing?'Stop screen sharing':'Share a screen or window'}
                </button>
                {screenSharing && <><button type="button" className="screen-btn" disabled={busy || pendingImages.length>=3 || liveActive} onClick={()=>void attachScreenFrame()}><Camera size={15}/> Attach screenshot</button>
                  <label className="screen-opt"><input type="checkbox" checked={screenWithVoice} onChange={e=>{setScreenWithVoice(e.target.checked);screenWithVoiceRef.current=e.target.checked;}}/> Include one screen frame with each live voice question</label>
                </>}
              </div>
              <LiveVoice onFinalTurn={onLiveTurn} onSpeechStart={onLiveSpeechStart}
                onModeChange={onLiveModeChange} disabled={recording || voiceBusy}/>

              {notice && <div className="notice" role="alert"><CircleHelp size={15}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss notice"><X size={14}/></button></div>}
              {voiceStatus && <div className="voice-status" role="status"><Mic size={14}/>{voiceStatus}</div>}
              {pendingDocs.length>0 && <div className="image-queue" aria-label="Selected documents">{pendingDocs.map((file,i)=><div className="image-queue-item" key={`${file.name}-${i}`}><FileText size={19}/><span title={file.name}>{file.name}</span><small>{(file.size/1048576).toFixed(2)} MiB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={()=>setPendingDocs(old=>old.filter((_,idx)=>idx!==i))}><X size={13}/></button></div>)}</div>}
              {pendingImages.length>0 && <div className="image-queue" aria-label="Selected images">{pendingImages.map((file,i)=><div className="image-queue-item" key={`${file.name}-${i}`}><LocalImagePreview file={file}/><span title={file.name}>{file.name}</span><small>{(file.size/1048576).toFixed(2)} MiB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={()=>setPendingImages(old=>old.filter((_,idx)=>idx!==i))}><X size={13}/></button></div>)}</div>}
              <form className="composer" onSubmit={e=>{e.preventDefault();void send();}}
                onDragOver={e=>{if(e.dataTransfer.types.includes('Files')) e.preventDefault();}}
                onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();routeDroppedFiles(Array.from(e.dataTransfer.files));}}}>
                <input ref={imageInputRef} className="sr-only-upload" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e=>{queueImages(Array.from(e.target.files??[]));e.currentTarget.value='';}} aria-label="Choose images"/>
                <input ref={documentInputRef} className="sr-only-upload" type="file" accept=".pdf,.docx,.txt,.md,.csv" multiple onChange={e=>{queueDocuments(Array.from(e.target.files??[]));e.currentTarget.value='';}} aria-label="Choose documents"/>
                <textarea ref={inputRef} aria-label="Message MUSE Nova" onPaste={e=>{const files=Array.from(e.clipboardData.files);if(files.length){e.preventDefault();queueImages(files);}}} placeholder="Ask MUSE Nova anything..." value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}} rows={2} maxLength={4000} disabled={busy}/>
                <div className="composer-footer"><div className="composer-features"><span className="feature-chip"><Sparkles size={14}/> Muse Spark</span><span className="feature-chip"><ImagePlus size={14}/> Vision + Documents 4.2</span><span className="feature-chip" title="Voice: push-to-talk or continuous live mode"><Mic size={14}/> Voice 3.2</span><span className="feature-chip" title="Docker-free RAG Knowledge Hub available at /knowledge"><Database size={14}/> Knowledge Hub</span></div><div className="composer-send"><button type="button" className="mic-btn" aria-label="Attach images" title="Attach 1–3 images (or drag and drop)" onClick={()=>imageInputRef.current?.click()} disabled={busy || liveActive || pendingImages.length>=3}><ImagePlus size={18}/></button><button type="button" className="mic-btn" aria-label="Attach documents" title="Attach PDF, DOCX, TXT, MD or CSV (up to 2)" onClick={()=>documentInputRef.current?.click()} disabled={busy || liveActive || pendingDocs.length>=2}><Paperclip size={18}/></button><button type="button" className={`mic-btn ${recording?'recording':''}`} onClick={()=>void toggleMicrophone()} disabled={((busy || voiceBusy || liveActive) && !recording)} title={recording?'Finish recording':'Record voice message'} aria-label={recording?'Stop microphone recording':'Start microphone recording'}>{recording?<Square size={16} fill="currentColor"/>:<Mic size={18}/>}</button>{speaking?<button type="button" className="mic-btn" onClick={stopPlayback} title="Stop audio" aria-label="Stop audio playback"><VolumeX size={18}/></button>:null}{busy?<button type="button" onClick={stopGeneration} className="stop-btn" title="Stop generating"><Square size={15} fill="currentColor"/></button>:<button type="submit" className="send-btn" disabled={!message.trim() && pendingImages.length===0 && pendingDocs.length===0} aria-label="Send message"><ArrowUp size={19}/></button>}</div></div>
              </form>
              <div className="composer-disclaimer"><span>Enter to send · Live mode detects turns · Push-to-talk remains available</span><span>Files and screen frames go to Meta only when submitted or live-voice sharing is explicitly enabled</span></div>
            </div>
          </div>
        ) : (
          <div className="usage-view"><div className="eyebrow"><Activity size={13}/> SYSTEM OBSERVABILITY</div><h1>Usage & activity</h1><p className="usage-intro">Transparent metrics for your local MUSE Nova development session. These are estimates, not your actual Meta credit balance.</p>
            <div className="metric-grid"><div className="metric-card"><span><Cloud size={18}/> SERVER REQUESTS</span><strong>{summary?.completed_calls ?? '—'}</strong><small>Completed calls since FastAPI started</small></div><div className="metric-card"><span><Zap size={18}/> ESTIMATED SPEND</span><strong>{summary?money(summary.estimated_total_usd):'—'}</strong><small>Model-estimated process spend (USD)</small></div><div className="metric-card"><span><FileText size={18}/> VISIBLE TOKENS</span><strong>{observedTokens.toLocaleString()}</strong><small>Tokens recorded in local browser history</small></div><div className="metric-card"><span><History size={18}/> MESSAGES</span><strong>{totalMessages}</strong><small>Messages saved in this browser</small></div></div>
            <div className="usage-split"><div className="info-panel"><h2>Connection health</h2><div className="detail-row"><span>FastAPI gateway</span><strong className={health?'good':'bad'}>{health?'Online':'Unavailable'}</strong></div><div className="detail-row"><span>Backend version</span><strong>{health?.version??'—'}</strong></div><div className="detail-row"><span>Inference model</span><strong>Muse Spark 1.3</strong></div><div className="detail-row"><span>Session storage</span><strong>Postgres if memory enabled; RAM otherwise</strong></div><button className="refresh-btn" onClick={()=>void refreshMetrics()}><Activity size={15}/> Refresh metrics</button></div><div className="info-panel"><h2>Billing transparency</h2><p>These estimates reset when FastAPI restarts and may omit incomplete or failed calls. Your <strong>$150 Muse API credit balance</strong> is not accessible to this prototype.</p><div className="callout"><ShieldCheck size={17}/><span>Check Meta's billing dashboard for authoritative usage and limits.</span></div><p className="small-muted">No automatic hard spend cap is implemented yet.</p></div></div>
          </div>
        )}
        <div className="foot-status"><span><span className="foot-status-dot"/> MUSE Nova v0.8.0</span><span>Designed for local development · Powered by Meta Muse</span></div>
      </main>
      {settingsOpen && <div className="dialog-scrim" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSettingsOpen(false);}}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="dialog-head"><div><div className="eyebrow">PERSONALIZE YOUR WORKSPACE</div><h2 id="settings-title">Settings</h2></div><button className="icon-btn" onClick={()=>setSettingsOpen(false)} aria-label="Close settings"><X size={18}/></button></div><div className="setting-row"><div><strong>Appearance</strong><small>Adjust the dashboard theme</small></div><button className="theme-toggle" onClick={()=>setTheme(x=>x==='dark'?'light':'dark')}>{theme==='dark'?<Moon size={16}/>:<Sun size={16}/>} {theme==='dark'?'Dark':'Light'} mode</button></div><div className="setting-row"><div><strong>Automatically speak replies</strong><small>Opt-in: Kokoro TTS speaks the first 600 characters; audio is local</small></div><button type="button" className="theme-toggle" onClick={()=>setAutoSpeak(x=>!x)}>{autoSpeak?"On":"Off"}</button></div><div className="setting-row"><div><strong>Inference model</strong><small>Only Muse Spark 1.3 is connected today</small></div><span className="setting-value">Muse Spark 1.3</span></div><div className="setting-row"><div><strong>Backend</strong><small>Same-origin Next.js proxy to local FastAPI</small></div><span className="setting-value">127.0.0.1:8000</span></div><div className="setting-row"><div><strong>Local transcript storage</strong><small>Chats in this browser are not encrypted and may survive refreshes. They are separate from Meta provider history.</small></div><button className="secondary-danger" disabled={busy} onClick={()=>{if(window.confirm('Clear every local chat in this browser? Meta-hosted conversation history will NOT be deleted.')){const next=newThread();localStorage.removeItem(STORE_KEY);setThreads([next]);setActiveId(next.id);setView('chat');setSettingsOpen(false);}}}><Trash2 size={15}/> Clear local chats</button></div><div className="dialog-footer"><ShieldCheck size={17}/> Local-only prototype with approval-controlled agent tools; no user authentication or server-side memory. Do not expose publicly.</div></section></div>}
    </div>
  );
}
