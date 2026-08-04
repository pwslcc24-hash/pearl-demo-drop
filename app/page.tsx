"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type Win = { id:string; repName:string; company:string; product:string; songId:string; createdAt:string; aeName?:string };
type Song = { id:string; repName:string; title:string; artist:string; videoId:string; startSeconds:number };
type YTPlayer = { loadVideoById(options:{videoId:string;startSeconds:number;endSeconds:number}):void; cueVideoById(options:{videoId:string;startSeconds:number;endSeconds:number}):void; playVideo():void; pauseVideo():void; stopVideo():void; setVolume(volume:number):void; mute():void; unMute():void };
declare global { interface Window { YT?: { Player:new(id:string, options:Record<string,unknown>)=>YTPlayer }; onYouTubeIframeAPIReady?:()=>void } }

const DEFAULT_SONG:Song={id:"default-demo-drop",repName:"",title:"Default Demo Drop Song",artist:"YouTube",videoId:"vkSFh6HMUtQ",startSeconds:0};
const youtubeIdFromInput=(value:string)=>{try{const url=new URL(value);if(url.hostname.includes("youtu.be"))return url.pathname.slice(1).split("/")[0];return url.searchParams.get("v")??url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1]??""}catch{return /^[\w-]{11}$/.test(value)?value:""}};

const SDR_NAMES = [
  "Aldo Lopez","Aaron Hill","Audrey Linder","Ava Geertsen","Carson Heber","Cason Clarke",
  "Christian Hawkins","Devin Stika","Dylan Hamilton","Easton Christiansen","Jace Muir",
  "Jeremy Thompson","Josh Cheney","Kana Makuakane","Kenzie Sacks","Kody Davis","Kyla Probst",
  "Lexee Cheney","Logan Baker","Nick Crawford","Payton Clayson","Porter Whitworth","Preston Francis",
  "Shaline Vogler","Spencer Anderson","Trey Falkner",
].sort();

const PROFILE_PHOTOS:Record<string,string> = {
  "Aaron Hill":"https://avatars.slack-edge.com/2026-04-24/10991526944806_f1ea48129e560ba111e6_original.png",
  "Audrey Linder":"https://avatars.slack-edge.com/2026-03-02/10611268373542_60afd5fdb395219ccc3c_original.png",
  "Ava Geertsen":"https://avatars.slack-edge.com/2026-06-12/11329761946343_b306ec3fabe2e63110fe_original.png",
  "Carson Heber":"https://avatars.slack-edge.com/2026-07-09/11556410895250_5460657a874932eb26c0_original.png",
  "Cason Clarke":"https://avatars.slack-edge.com/2025-11-11/9896468367988_c885256277e71f73ed3d_original.png",
  "Christian Hawkins":"https://avatars.slack-edge.com/2025-10-08/9659784054486_59d936ebfefdb32bda18_original.png",
  "Devin Stika":"https://avatars.slack-edge.com/2025-02-25/8533946848096_9b876e0c46fe79e7ea89_original.jpg",
  "Dylan Hamilton":"https://avatars.slack-edge.com/2026-05-19/11169062394052_2989a70f92d14f5922b4_original.jpg",
  "Easton Christiansen":"https://avatars.slack-edge.com/2026-05-26/11212537496770_b22931c97cbc19f4b4a6_original.png",
  "Jace Muir":"https://avatars.slack-edge.com/2026-05-13/11127106550196_480f666377706665948c_original.png",
  "Jeremy Thompson":"https://avatars.slack-edge.com/2026-06-02/11267949618436_7e67363aa178698cea5d_original.png",
  "Josh Cheney":"https://avatars.slack-edge.com/2026-05-19/11192449227072_c8d7d74b354a88e4bcff_original.jpg",
  "Kana Makuakane":"https://avatars.slack-edge.com/2025-10-06/9645779583110_88eed983785efe75755a_original.png",
  "Kenzie Sacks":"https://avatars.slack-edge.com/2026-05-01/11036147669669_14b2d6ad5dcae19fd43d_original.jpg",
  "Kody Davis":"https://avatars.slack-edge.com/2025-02-21/8495869155284_a054d7e3f11ebe506c7f_original.png",
  "Kyla Probst":"https://secure.gravatar.com/avatar/f37d6fdb192187d84ddf71ffd7f43970.jpg?s=512",
  "Lexee Cheney":"https://avatars.slack-edge.com/2025-08-11/9363249340800_43034a7744e01744a01a_original.png",
  "Logan Baker":"https://avatars.slack-edge.com/2025-02-10/8434147154612_1523d43f840c387a91b7_original.png",
  "Nick Crawford":"https://avatars.slack-edge.com/2024-11-26/8091357862804_5546ae25bdf4b2cc6c78_original.png",
  "Payton Clayson":"https://avatars.slack-edge.com/2025-05-06/8853038916005_9b972db4ec830ff9c353_original.png",
  "Porter Whitworth":"https://avatars.slack-edge.com/2026-05-12/11112656090757_9ffb64429c45569d7f2c_original.png",
  "Preston Francis":"https://avatars.slack-edge.com/2024-07-31/7500496532934_ea6a07e6287a0f778deb_original.jpg",
  "Shaline Vogler":"https://avatars.slack-edge.com/2024-09-05/7684163771459_33535853ccb34541fe16_original.png",
  "Spencer Anderson":"https://secure.gravatar.com/avatar/e14c51407e4deaccca87fb7012f35c8d.jpg?s=512",
  "Trey Falkner":"https://avatars.slack-edge.com/2026-03-13/10696428094498_295e8b181babf42de68b_original.png",
};

const initialWins: Win[] = [];
const formatCompletedAt=(value:string)=>{if(value==="Just now")return value;const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})};

const songFor = (win:Win, songs:Song[]) => songs.find(s=>s.id===win.songId) ?? songs.find(s=>s.repName.toLowerCase()===win.repName.toLowerCase()) ?? {...DEFAULT_SONG,repName:win.repName};

export default function Home() {
  const [wins,setWins]=useState(initialWins);
  const [active,setActive]=useState<Win|null>(null);
  const [songs,setSongs]=useState<Song[]>([]);
  const [selectedSong,setSelectedSong]=useState("");
  const [seconds,setSeconds]=useState(15);
  const [playing,setPlaying]=useState(false);
  const [celebrating,setCelebrating]=useState(false);
  const [monthlyCounts,setMonthlyCounts]=useState<Record<string,number>>({});
  const [showSetup,setShowSetup]=useState(false);
  const [setupRep,setSetupRep]=useState<string|null>(null);
  const [form,setForm]=useState({repName:"Porter Whitworth",youtubeUrl:"",startSeconds:"0"});
  const [formError,setFormError]=useState("");
  const playerRef=useRef<YTPlayer|null>(null);
  const stopRef=useRef<number|null>(null);
  const fadeRefs=useRef<number[]>([]);
  const lastServerIdRef=useRef<string|null>(null);

  const currentSong=active?songFor(active,songs):songs[0]??DEFAULT_SONG;
  const setupSong=setupRep?songs.find(s=>s.repName.toLowerCase()===setupRep.toLowerCase()):undefined;
  const setupVideoId=youtubeIdFromInput(form.youtubeUrl);

  const openSetup=()=>{setSetupRep(null);setFormError("");setShowSetup(true)};
  const chooseSetupRep=(repName:string)=>{const saved=songs.find(s=>s.repName.toLowerCase()===repName.toLowerCase());setSetupRep(repName);setForm({repName,youtubeUrl:`https://www.youtube.com/watch?v=${saved?.videoId??DEFAULT_SONG.videoId}`,startSeconds:String(saved?.startSeconds??DEFAULT_SONG.startSeconds)});setFormError("")};

  const clearFades=useCallback(()=>{fadeRefs.current.forEach(timer=>window.clearTimeout(timer));fadeRefs.current=[]},[]);

  const playSong=useCallback((song?:Song, forceAudio=false) => {
    if (!song || !playerRef.current || typeof playerRef.current.loadVideoById !== "function") return;
    if (stopRef.current) window.clearTimeout(stopRef.current);
    clearFades();
    if(typeof playerRef.current.setVolume==="function")playerRef.current.setVolume(0);
    if (typeof playerRef.current.unMute === "function") playerRef.current.unMute();
    playerRef.current.loadVideoById({videoId:song.videoId,startSeconds:song.startSeconds,endSeconds:song.startSeconds+16});
    for(let step=1;step<=15;step++)fadeRefs.current.push(window.setTimeout(()=>{if(typeof playerRef.current?.setVolume==="function")playerRef.current.setVolume(Math.round(step/15*100))},step*100));
    for(let step=1;step<=45;step++)fadeRefs.current.push(window.setTimeout(()=>{const remaining=1-step/45;if(typeof playerRef.current?.setVolume==="function")playerRef.current.setVolume(Math.max(0,Math.round(100*remaining*remaining)))},10500+step*100));
    setSeconds(15); setPlaying(true);
    stopRef.current=window.setTimeout(()=>{clearFades();if(typeof playerRef.current?.setVolume==="function")playerRef.current.setVolume(0);if(typeof playerRef.current?.stopVideo==="function")playerRef.current.stopVideo();setPlaying(false);setSeconds(0)},15300);
  },[clearFades]);

  const launch=useCallback((win:Win, availableSongs=songs, forceAudio=false)=>{
    setActive(win); setWins(current=>[win,...current.filter(item=>item.id!==win.id)].slice(0,6));
    setSeconds(15); setCelebrating(true); window.setTimeout(()=>setCelebrating(false),3200);
    playSong(songFor(win,availableSongs),forceAudio);
  },[playSong,songs]);

  useEffect(()=>{ if(!playing)return; const timer=window.setInterval(()=>setSeconds(v=>Math.max(0,v-1)),1000); return()=>window.clearInterval(timer)},[playing]);

  useEffect(()=>{
    const boot=async()=>{
      try{const res=await fetch("/api/songs",{cache:"no-store"});const data=await res.json() as {songs?:Song[]};const list=data.songs??[];setSongs(list);}
      catch{/* Setup remains available while reconnecting. */}
    }; boot();
  },[]);

  useEffect(()=>{
    let mounted=true;
    const sync=async()=>{try{const res=await fetch("/api/events",{cache:"no-store"});const data=await res.json() as {events?:Win[];monthlyCounts?:{repName:string;count:number}[]};if(!mounted)return;const normalized=data.events??[];setWins(normalized);setMonthlyCounts(Object.fromEntries((data.monthlyCounts??[]).map(item=>[item.repName,item.count])));const newest=normalized[0];if(newest&&!active)setActive(newest);if(newest&&lastServerIdRef.current&&lastServerIdRef.current!==newest.id)launch(newest);if(newest)lastServerIdRef.current=newest.id}catch{}};
    sync();const poller=window.setInterval(sync,3000);return()=>{mounted=false;window.clearInterval(poller)};
  },[launch,active]);

  useEffect(()=>{
    if(!currentSong)return;
    const createPlayer=()=>{if(!window.YT||typeof window.YT.Player!=="function"||playerRef.current)return false;playerRef.current=new window.YT.Player("youtube-player",{height:"200",width:"200",videoId:currentSong.videoId,playerVars:{playsinline:1,controls:1,start:currentSong.startSeconds,origin:window.location.origin},events:{onReady:()=>{if(typeof playerRef.current?.cueVideoById==="function")playerRef.current.cueVideoById({videoId:currentSong.videoId,startSeconds:currentSong.startSeconds,endSeconds:currentSong.startSeconds+15})}}});return true};
    if(!document.querySelector("script[data-youtube-api]")){const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;script.dataset.youtubeApi="true";document.body.appendChild(script)}
    window.onYouTubeIframeAPIReady=createPlayer;
    if(createPlayer())return;
    const readyCheck=window.setInterval(()=>{if(createPlayer())window.clearInterval(readyCheck)},250);
    return()=>window.clearInterval(readyCheck);
  },[currentSong?.videoId,currentSong?.startSeconds]);

  const togglePlayback=()=>{if(playing){clearFades();if(stopRef.current)window.clearTimeout(stopRef.current);if(typeof playerRef.current?.pauseVideo==="function")playerRef.current.pauseVideo();setPlaying(false)}else playSong(currentSong)};

  const saveSong=async()=>{
    setFormError("");
    const response=await fetch("/api/songs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,startSeconds:Number(form.startSeconds)})});
    const data=await response.json() as {song?:Song;error?:string};if(!response.ok||!data.song){setFormError(data.error??"Could not save this clip");return}
    setSongs(current=>[data.song!,...current.filter(s=>s.id!==data.song!.id&&s.repName.toLowerCase()!==data.song!.repName.toLowerCase())]);setSelectedSong(data.song.id);setSetupRep(null);setShowSetup(false);
  };

  const progress=((15-seconds)/15)*100;
  return <main className={`app-shell ${celebrating?"is-celebrating":""}`}>
    <nav className="topbar"><div className="brand-lockup"><img src="https://unrivaled-taffy-45056a.netlify.app/01-logo/pearl-logo-primary-circled.svg" alt="Pearl"/><span className="brand-divider"/><span className="product-name">DEMO DROP</span></div><div className="topbar-actions"><span className="live-pill"><i/> LIVE FROM HUBSPOT</span><button className="icon-button" onClick={openSetup}>SET UP SONGS</button></div></nav>
    <section className="stage"><div className="ambient orb-one"/><div className="ambient orb-two"/><div className="grid-lines"/>{celebrating&&<div className="confetti" aria-hidden="true">{Array.from({length:90}).map((_,i)=><i key={i} style={{"--x":`${(i*37)%101}%`,"--mid":`${((i*29)%80)-40}px`,"--drift":`${((i*53)%180)-90}px`,"--delay":`${(i%12)*.035}s`,"--duration":`${2.4+(i%9)*.13}s`,"--spin":`${540+(i%8)*135}deg`,"--w":`${5+(i%4)*2}px`,"--h":`${i%5===0?7:12+(i%4)*3}px`} as CSSProperties}/>)}</div>}
      <div className="eyebrow"><span>01</span> DEMO COMPLETED {active&&<> · AE: {active.aeName||"Not assigned"}</>}</div>
      <div className="hero-grid"><div className="hero-copy"><p className="moment-label">THE FLOOR IS YOURS</p>{active?<><div className="rep-hero">{PROFILE_PHOTOS[active.repName]?<img src={PROFILE_PHOTOS[active.repName]} alt=""/>:<span>{active.repName.split(" ").map(p=>p[0]).slice(0,2).join("")}</span>}<h1>{active.repName}</h1></div><p className="account-line"><b>{active.company}</b> <span>•</span> {active.product} <span>•</span> {formatCompletedAt(active.createdAt)}</p></>:<h1>Waiting for the next win</h1>}</div><div className="score-orbit"><div className="score-ring"><span>+</span>1<small>DEMO</small></div></div></div>
      <div className="player-card">
        <div className="youtube-shell"><div id="youtube-player"/></div>
        <div className="track-meta"><div className="track-title-row"><div><strong>{currentSong.title}</strong><span>{`${currentSong.artist} · ${currentSong.startSeconds}s–${currentSong.startSeconds+15}s`}</span></div><span className="approved">AUTO CELEBRATION</span></div><div className="waveform">{Array.from({length:52}).map((_,i)=><i key={i} className={i/52*100<=progress?"passed":""} style={{height:`${20+((i*17)%64)}%`}}/>)}</div><div className="time-row"><span>0:{String(15-seconds).padStart(2,"0")}</span><button onClick={togglePlayback}>{playing?"PAUSE":"PLAY CLIP"}</button><span>0:15</span></div></div>
      </div>
    </section>
    <section className="control-strip"><div className="recent-wins"><span className="strip-label">RECENT WINS</span><div className="win-list">{wins.slice(0,5).map(win=><button key={win.id} onClick={()=>launch(win)} className="win-item">{PROFILE_PHOTOS[win.repName]?<img className="avatar" src={PROFILE_PHOTOS[win.repName]} alt=""/>:<span className="avatar">{win.repName.split(" ").map(p=>p[0]).slice(0,2).join("")}</span>}<span><strong>{win.repName}</strong><small>{monthlyCounts[win.repName]??0} demos this month · {formatCompletedAt(win.createdAt)}</small></span></button>)}</div></div></section>
    {showSetup&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowSetup(false)}}><section className="song-modal" role="dialog" aria-modal="true" aria-labelledby="song-modal-title"><div className="modal-head"><div><span className="strip-label">REP CELEBRATION</span><h2 id="song-modal-title">{setupRep?setupRep:"Set up songs"}</h2></div><button onClick={()=>setShowSetup(false)} aria-label="Close">×</button></div>{!setupRep?<><p>Choose an SDR to see or change their song.</p><div className="rep-song-list">{SDR_NAMES.map(name=>{const saved=songs.find(s=>s.repName.toLowerCase()===name.toLowerCase());return <button key={name} onClick={()=>chooseSetupRep(name)}><span className="rep-list-avatar">{PROFILE_PHOTOS[name]?<img src={PROFILE_PHOTOS[name]} alt=""/>:name.split(" ").map(p=>p[0]).slice(0,2).join("")}</span><span><strong>{name}</strong><small>{saved?`${saved.title} · ${saved.artist}`:"Default song"}</small></span><b>CHANGE ›</b></button>})}</div></>:<><button className="back-to-reps" onClick={()=>setSetupRep(null)}>‹ ALL SDRS</button><p>{setupSong?"Their saved song is loaded below. Paste a different URL to change it.":"The default song is loaded below. Paste a different URL to personalize it."}</p><div className="song-url-preview">{setupVideoId&&<img src={`https://i.ytimg.com/vi/${setupVideoId}/hqdefault.jpg`} alt="Selected YouTube song thumbnail"/>}<label>YOUTUBE LINK<input placeholder="https://youtube.com/watch?v=..." value={form.youtubeUrl} onChange={e=>setForm({...form,youtubeUrl:e.target.value})}/></label></div><label>START TIME IN SECONDS<input type="number" min="0" value={form.startSeconds} onChange={e=>setForm({...form,startSeconds:e.target.value})}/><small>Example: 1:12 into the song = 72 seconds. The site stops automatically 15 seconds later.</small></label>{formError&&<p className="form-error">{formError}</p>}<div className="modal-actions"><button onClick={()=>setSetupRep(null)}>BACK</button><button className="test-button" onClick={saveSong}>{setupSong?"SAVE CHANGES":"SAVE PERSONAL SONG"}</button></div></>}</section></div>}
  </main>;
}
