"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Win = { id:string; repName:string; company:string; product:string; songId:string; createdAt:string };
type Song = { id:string; repName:string; title:string; artist:string; videoId:string; startSeconds:number };
type YTPlayer = { loadVideoById(options:{videoId:string;startSeconds:number;endSeconds:number}):void; cueVideoById(options:{videoId:string;startSeconds:number;endSeconds:number}):void; playVideo():void; pauseVideo():void; stopVideo():void; mute():void; unMute():void };
declare global { interface Window { YT?: { Player:new(id:string, options:Record<string,unknown>)=>YTPlayer }; onYouTubeIframeAPIReady?:()=>void } }

const SDR_NAMES = [
  "Aldo Lopez","Aaron Hill","Audrey Linder","Ava Geertsen","Carson Heber","Cason Clarke",
  "Christian Hawkins","Devin Stika","Dylan Hamilton","Easton Christiansen","Jace Muir",
  "Jeremy Thompson","Josh Cheney","Kana Makuakane","Kenzie Sacks","Kody Davis","Kyla Probst",
  "Lexee Cheney","Logan Baker","Nick Crawford","Porter Whitworth","Preston Francis",
  "Shaline Vogler","Spencer Anderson","Trey Falkner",
].sort();

const initialWins: Win[] = [
  { id:"1", repName:"Porter Whitworth", company:"Bright Smiles Dental", product:"Pearl Voice", songId:"", createdAt:"10:42 AM" },
  { id:"2", repName:"Casen Cowdrey", company:"Studio Dental", product:"Practice Intelligence", songId:"", createdAt:"9:18 AM" },
  { id:"3", repName:"Maya Rodriguez", company:"Oakview Dentistry", product:"Precheck", songId:"", createdAt:"Yesterday" },
];

const songFor = (win:Win, songs:Song[]) => songs.find(s=>s.id===win.songId) ?? songs.find(s=>s.repName.toLowerCase()===win.repName.toLowerCase()) ?? songs[0];

export default function Home() {
  const [wins,setWins]=useState(initialWins);
  const [active,setActive]=useState<Win>(initialWins[0]);
  const [songs,setSongs]=useState<Song[]>([]);
  const [selectedSong,setSelectedSong]=useState("");
  const [seconds,setSeconds]=useState(15);
  const [playing,setPlaying]=useState(false);
  const [celebrating,setCelebrating]=useState(false);
  const [armed,setArmed]=useState(false);
  const [showSetup,setShowSetup]=useState(false);
  const [form,setForm]=useState({repName:"Porter Whitworth",youtubeUrl:"",startSeconds:"0"});
  const [formError,setFormError]=useState("");
  const playerRef=useRef<YTPlayer|null>(null);
  const stopRef=useRef<number|null>(null);
  const lastServerIdRef=useRef<string|null>(null);

  const currentSong=songFor(active,songs);

  const playSong=useCallback((song?:Song) => {
    if (!song || !playerRef.current || !armed || typeof playerRef.current.loadVideoById !== "function") return;
    if (stopRef.current) window.clearTimeout(stopRef.current);
    if (typeof playerRef.current.unMute === "function") playerRef.current.unMute();
    playerRef.current.loadVideoById({videoId:song.videoId,startSeconds:song.startSeconds,endSeconds:song.startSeconds+15});
    setSeconds(15); setPlaying(true);
    stopRef.current=window.setTimeout(()=>{if(typeof playerRef.current?.stopVideo==="function")playerRef.current.stopVideo();setPlaying(false);setSeconds(0)},15000);
  },[armed]);

  const launch=useCallback((win:Win, availableSongs=songs)=>{
    setActive(win); setWins(current=>[win,...current.filter(item=>item.id!==win.id)].slice(0,6));
    setSeconds(15); setCelebrating(true); window.setTimeout(()=>setCelebrating(false),3200);
    playSong(songFor(win,availableSongs));
  },[playSong,songs]);

  useEffect(()=>{ if(!playing)return; const timer=window.setInterval(()=>setSeconds(v=>Math.max(0,v-1)),1000); return()=>window.clearInterval(timer)},[playing]);

  useEffect(()=>{
    const boot=async()=>{
      try{const res=await fetch("/api/songs",{cache:"no-store"});const data=await res.json() as {songs?:Song[]};const list=data.songs??[];setSongs(list);setSelectedSong(list[0]?.id??"");}
      catch{/* Setup remains available while reconnecting. */}
    }; boot();
  },[]);

  useEffect(()=>{
    let mounted=true;
    const sync=async()=>{try{const res=await fetch("/api/events",{cache:"no-store"});const data=await res.json() as {events?:Win[]};if(!mounted||!data.events?.length)return;const normalized=data.events.map(event=>({...event,createdAt:event.createdAt==="Just now"?event.createdAt:new Date(event.createdAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}));setWins(normalized);const newest=normalized[0];if(lastServerIdRef.current&&lastServerIdRef.current!==newest.id)launch(newest);lastServerIdRef.current=newest.id}catch{}};
    sync();const poller=window.setInterval(sync,3000);return()=>{mounted=false;window.clearInterval(poller)};
  },[launch]);

  useEffect(()=>{
    if(document.querySelector("script[data-youtube-api]")){ if(window.YT&&currentSong&&!playerRef.current) createPlayer(currentSong); return; }
    const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;script.dataset.youtubeApi="true";document.body.appendChild(script);
    window.onYouTubeIframeAPIReady=()=>{if(currentSong)createPlayer(currentSong)};
    function createPlayer(song:Song){playerRef.current=new window.YT!.Player("youtube-player",{height:"200",width:"200",videoId:song.videoId,playerVars:{playsinline:1,controls:1,start:song.startSeconds,origin:window.location.origin},events:{onReady:()=>{if(typeof playerRef.current?.cueVideoById==="function")playerRef.current.cueVideoById({videoId:song.videoId,startSeconds:song.startSeconds,endSeconds:song.startSeconds+15})}}})}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[currentSong?.videoId]);

  const armAudio=()=>{setArmed(true);const song=currentSong??songs[0];if(song&&typeof playerRef.current?.cueVideoById==="function"){playerRef.current.cueVideoById({videoId:song.videoId,startSeconds:song.startSeconds,endSeconds:song.startSeconds+15});if(typeof playerRef.current.unMute==="function")playerRef.current.unMute()}};
  const togglePlayback=()=>{if(playing){if(typeof playerRef.current?.pauseVideo==="function")playerRef.current.pauseVideo();setPlaying(false)}else playSong(currentSong)};

  const testDrop=()=>{const song=songs.find(s=>s.id===selectedSong)??songs[0];if(!song){setShowSetup(true);return}const event={id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,repName:song.repName,company:"Pearl Customer",product:"Demo completed",songId:song.id,createdAt:"Just now"};lastServerIdRef.current=event.id;launch(event);fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(event)}).catch(()=>undefined)};

  const saveSong=async()=>{
    setFormError("");
    const response=await fetch("/api/songs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,startSeconds:Number(form.startSeconds)})});
    const data=await response.json() as {song?:Song;error?:string};if(!response.ok||!data.song){setFormError(data.error??"Could not save this clip");return}
    setSongs(current=>[data.song!,...current.filter(s=>s.id!==data.song!.id&&s.repName.toLowerCase()!==data.song!.repName.toLowerCase())]);setSelectedSong(data.song.id);setShowSetup(false);
  };

  const progress=((15-seconds)/15)*100;
  return <main className={`app-shell ${celebrating?"is-celebrating":""}`}>
    <nav className="topbar"><div className="brand-lockup"><img src="https://unrivaled-taffy-45056a.netlify.app/01-logo/pearl-logo-primary-circled.svg" alt="Pearl"/><span className="brand-divider"/><span className="product-name">DEMO DROP</span></div><div className="topbar-actions"><span className="live-pill"><i/> LIVE FROM HUBSPOT</span><button className={`audio-arm ${armed?"armed":""}`} onClick={armAudio}>{armed?"✓ AUDIO READY":"ENABLE AUDIO"}</button><button className="icon-button" onClick={()=>setShowSetup(true)}>SET UP SONGS</button></div></nav>
    <section className="stage"><div className="ambient orb-one"/><div className="ambient orb-two"/><div className="grid-lines"/>{celebrating&&<div className="confetti" aria-hidden="true">{Array.from({length:24}).map((_,i)=><i key={i}/>)}</div>}
      <div className="eyebrow"><span>01</span> DEMO COMPLETED</div>
      <div className="hero-grid"><div className="hero-copy"><p className="moment-label">THE FLOOR IS YOURS</p><h1>{active.repName}</h1><p className="account-line">{active.company} <span>•</span> {active.product}</p></div><div className="score-orbit"><div className="score-ring"><span>+</span>1<small>DEMO</small></div></div></div>
      <div className="player-card">
        <div className={`youtube-shell ${currentSong?"":"empty"}`}><div id="youtube-player"/>{!currentSong&&<button onClick={()=>setShowSetup(true)}><b>＋</b><span>Add a YouTube song</span></button>}</div>
        <div className="track-meta"><div className="track-title-row"><div><strong>{currentSong?.title??"No song selected"}</strong><span>{currentSong?`${currentSong.artist} · ${currentSong.startSeconds}s–${currentSong.startSeconds+15}s`:"Choose a real song and its best 15 seconds"}</span></div><span className="approved">YOUTUBE EMBED</span></div><div className="waveform">{Array.from({length:52}).map((_,i)=><i key={i} className={i/52*100<=progress?"passed":""} style={{height:`${20+((i*17)%64)}%`}}/>)}</div><div className="time-row"><span>0:{String(15-seconds).padStart(2,"0")}</span><button onClick={togglePlayback}>{playing?"PAUSE":"PLAY CLIP"}</button><span>0:15</span></div>{!armed&&<p className="audio-note">Click “Enable audio” once on the TV before the first celebration.</p>}</div>
      </div>
    </section>
    <section className="control-strip"><div className="song-picker"><span className="strip-label">REP SONG</span><div className="select-wrap"><select value={selectedSong} onChange={e=>setSelectedSong(e.target.value)} aria-label="Choose saved rep song"><option value="">Choose a saved song</option>{songs.map(s=><option value={s.id} key={s.id}>{s.repName} · {s.title}</option>)}</select></div><button className="setup-button" onClick={()=>setShowSetup(true)}>＋ ADD SONG</button><button className="test-button" onClick={testDrop}>TEST MY DROP <span>↗</span></button></div><div className="recent-wins"><span className="strip-label">RECENT WINS</span><div className="win-list">{wins.slice(0,3).map(win=><button key={win.id} onClick={()=>launch(win)} className="win-item"><span className="avatar">{win.repName.split(" ").map(p=>p[0]).slice(0,2).join("")}</span><span><strong>{win.repName.split(" ")[0]}</strong><small>{win.createdAt}</small></span></button>)}</div></div></section>
    {showSetup&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowSetup(false)}}><section className="song-modal" role="dialog" aria-modal="true" aria-labelledby="song-modal-title"><div className="modal-head"><div><span className="strip-label">REP CELEBRATION</span><h2 id="song-modal-title">Choose the best 15 seconds.</h2></div><button onClick={()=>setShowSetup(false)} aria-label="Close">×</button></div><p>Choose the SDR and paste a YouTube link. We’ll automatically add the song title and artist.</p><label>SDR<select value={form.repName} onChange={e=>setForm({...form,repName:e.target.value})}>{SDR_NAMES.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label>YOUTUBE LINK<input placeholder="https://youtube.com/watch?v=..." value={form.youtubeUrl} onChange={e=>setForm({...form,youtubeUrl:e.target.value})}/></label><label>START TIME IN SECONDS<input type="number" min="0" value={form.startSeconds} onChange={e=>setForm({...form,startSeconds:e.target.value})}/><small>Example: 1:12 into the song = 72 seconds. The site stops automatically 15 seconds later.</small></label>{formError&&<p className="form-error">{formError}</p>}<div className="modal-actions"><button onClick={()=>setShowSetup(false)}>CANCEL</button><button className="test-button" onClick={saveSong}>SAVE 15-SECOND CLIP</button></div></section></div>}
  </main>;
}
