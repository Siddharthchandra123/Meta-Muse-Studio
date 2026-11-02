'use client';

import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';

const KEY='muse-nova-studio-theme-v1';
type Theme='dark'|'light';

export default function StudioThemeToggle(){
  const [theme,setTheme]=useState<Theme>('dark');
  useEffect(()=>{
    let saved:Theme='dark';
    try { if(window.localStorage.getItem(KEY)==='light')saved='light'; } catch { /* storage may be disabled */ }
    setTheme(saved);
    document.documentElement.dataset.museStudioTheme=saved;
    return ()=>{delete document.documentElement.dataset.museStudioTheme;};
  },[]);
  function toggle(){
    const next:Theme=theme==='dark'?'light':'dark';
    setTheme(next);
    document.documentElement.dataset.museStudioTheme=next;
    try {window.localStorage.setItem(KEY,next);} catch { /* storage may be disabled */ }
  }
  return <button className="studio-theme-toggle" type="button" onClick={toggle} aria-label={theme==='dark'?'Switch Studio to light theme':'Switch Studio to dark theme'} title={theme==='dark'?'Switch to light theme':'Switch to dark theme'}>
    {theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}<span>{theme==='dark'?'Light':'Dark'} mode</span>
  </button>;
}
