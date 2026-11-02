'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {AudioLines, Headphones, Radio, Square} from 'lucide-react';
import {processLiveEvent, type LiveTranscriptEvent} from '@/lib/live-events';

type Props = {
  onFinalTurn: (text:string) => void;
  onSpeechStart: () => void;
  onModeChange: (active:boolean) => void;
  disabled?: boolean;
};

// This local-dev WebSocket deliberately does not go through a Next.js HTTP route.
// A server-side FastAPI relay authenticates to Meta, never the browser.
function localVoiceUrl(): string {
  return 'ws://127.0.0.1:8000/v1/voice/realtime';
}

export default function LiveVoice({onFinalTurn,onSpeechStart,onModeChange,disabled}:Props) {
  const [active,setActive] = useState(false);
  const [status,setStatus] = useState('Live voice off');
  const [partial,setPartial] = useState('');
  const wsFailureRef = useRef(false);
  const socketRef = useRef<WebSocket|null>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const contextRef = useRef<AudioContext|null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode|null>(null);
  const processorRef = useRef<AudioWorkletNode|null>(null);
  const activeRef = useRef(false);
  const completedRef = useRef(new Set<number>());
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const callbacks = useRef({onFinalTurn,onSpeechStart,onModeChange});
  useEffect(()=>{callbacks.current={onFinalTurn,onSpeechStart,onModeChange};},[onFinalTurn,onSpeechStart,onModeChange]);

  const shutdown = useCallback((graceful = false) => {
    activeRef.current = false;
    if(sessionTimerRef.current){clearTimeout(sessionTimerRef.current);sessionTimerRef.current=null;}
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN && graceful) {
      try {socket.send(JSON.stringify({type:'endStream'}));} catch { /* already disconnected */ }
      // Give Meta a chance to flush a pending speechComplete before closing.
      window.setTimeout(()=>{if(socket.readyState<2)socket.close();},2500);
    } else if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    processorRef.current?.disconnect(); processorRef.current = null;
    sourceRef.current?.disconnect(); sourceRef.current = null;
    streamRef.current?.getTracks().forEach(t=>t.stop()); streamRef.current = null;
    const context = contextRef.current; contextRef.current = null;
    if(context) void context.close().catch(()=>{});
    setActive(false); setPartial('');
    callbacks.current.onModeChange(false);
  },[]);

  useEffect(()=>()=>{shutdown(false);},[shutdown]);

  async function start() {
    if (activeRef.current || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia || !('AudioWorkletNode' in window) || !window.WebSocket) {
      setStatus('Use an up-to-date Chrome/Edge browser on localhost.');
      return;
    }
    activeRef.current = true;
    completedRef.current.clear();
    wsFailureRef.current=false;
    setStatus('Checking realtime backend...');
    try {
      // Same-origin Next.js readiness route; no browser-to-backend CORS needed.
      const checkResponse = await fetch('/api/voice/realtime/status', {cache:'no-store'});
      if (!checkResponse.ok) throw new Error('Live voice backend check failed. Run FastAPI v0.3.3 on port 8000.');
      const check: {key_configured?:boolean; websockets_installed?:boolean; allowed_origins?:string[]} = await checkResponse.json();
      if (!check.key_configured) throw new Error('Live voice API key missing. Check FastAPI .env and restart it.');
      if (!check.websockets_installed) throw new Error('Install websockets>=14,<17 in the backend environment.');
      if (!check.allowed_origins?.includes(window.location.origin))
        throw new Error(`Dashboard origin ${window.location.origin} is not allowed by FastAPI. Check LIVE_VOICE_ALLOWED_ORIGINS.`);
      setStatus('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1},
      });
      if (!activeRef.current) {stream.getTracks().forEach(t=>t.stop());return;}
      streamRef.current = stream;
      stream.getTracks().forEach(t => {t.onended = ()=>{setStatus('Microphone disconnected');shutdown();};});
      const context = new AudioContext({sampleRate:48000});
      contextRef.current = context;
      await context.audioWorklet.addModule('/pcm24-worklet.js');
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(context,'muse-pcm24', {numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      sourceRef.current=source; processorRef.current=processor;
      // A zero gain output keeps the worklet processing, without feedback to speakers.
      const mute = context.createGain();mute.gain.value = 0;
      source.connect(processor);processor.connect(mute);mute.connect(context.destination);
      setStatus('Connecting to Muse Voice Transcribe...');
      const socket = new WebSocket(localVoiceUrl());
      socketRef.current=socket;
      let ready = false;
      socket.onmessage = event => {
        if (!activeRef.current || socketRef.current!==socket) return;
        let raw:LiveTranscriptEvent;
        try {raw = JSON.parse(String(event.data)) as LiveTranscriptEvent;} catch{return;}
        const result = processLiveEvent(raw,completedRef.current);
        if(result.kind==='ready') {
          ready=true;
          setStatus('Listening continuously — use headphones to reduce echo');
        } else if(result.kind==='start') {
          setPartial('');setStatus('Hearing speech...');
          callbacks.current.onSpeechStart();
        } else if(result.kind==='partial') {
          setPartial(result.text||'');
        } else if(result.kind==='final') {
          setPartial(''); setStatus('Turn recognized — listening for your next question');
          callbacks.current.onFinalTurn(result.text!);
        } else if(result.kind==='error') {
          wsFailureRef.current=true;
          setStatus(result.text||'Realtime transcription error');
          shutdown();
        }
      };
      processor.port.onmessage=event=>{
        const data = event.data;
        if(!activeRef.current || !ready || socket.readyState!==WebSocket.OPEN) return;
        if(!(data instanceof ArrayBuffer) || data.byteLength!==3840) return;
        if(socket.bufferedAmount > 512*1024) {
          setStatus('Network too slow for live audio. Stopping safely.');
          shutdown();
          return;
        }
        socket.send(data);
      };
      socket.onerror=()=>{
        if(activeRef.current && socketRef.current===socket) {
          wsFailureRef.current=true;
          setStatus('WebSocket handshake failed. Check the FastAPI terminal and scripts/diagnose-realtime.ps1.');
        }
      };
      socket.onclose=event=>{
        if(activeRef.current && socketRef.current===socket){
          if(!wsFailureRef.current) setStatus(event.code === 1000 ? 'Live voice ended' :
            `Voice connection closed (${event.code}). Run scripts/diagnose-realtime.ps1; push-to-talk still works.`);
          shutdown();
        }
      };
      setActive(true);
      sessionTimerRef.current=setTimeout(()=>{setStatus("Live session reached 20-minute safety limit");shutdown(true);},20*60*1000);
      callbacks.current.onModeChange(true);
    } catch(error) {
      setStatus(error instanceof Error?error.message:'Could not start continuous voice');
      shutdown();
    }
  }

  return <section className={`live-voice ${active?'live-voice-on':''}`} aria-label="Continuous voice mode">
    <button className="live-voice-toggle" type="button" disabled={disabled && !active}
      onClick={()=>{if(active) {shutdown(true);setStatus('Live voice off');} else void start();}}
      aria-pressed={active}>
      {active ? <Square size={14} fill="currentColor"/>:<Radio size={16}/>}
      {active?'Stop live voice':'Start live conversation'}
    </button>
    <div className="live-voice-copy"><span className="live-voice-status"><AudioLines size={13}/>{status}</span>
      {partial && <span className="live-voice-partial">{partial}</span>}
      <small><Headphones size={12}/> Audio is sent to Meta while live mode is on. Auto-stops at 20 minutes.</small>
    </div>
  </section>;
}
