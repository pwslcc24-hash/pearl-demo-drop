"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type Win = { id:string; repName:string; company:string; product:string; songId:string; createdAt:string; aeName?:string };
type Song = { id:string; repName:string; title:string; artist:string; videoId:string; startSeconds:number };
type YTPlayer = { loadVideoById(options:{videoId:string;startSeconds:number;endSeconds:number}):void; cueVideoById(options:{videoId:string;startSeconds:number;endSeconds:number}):void; playVideo():void; pauseVideo():void; stopVideo():void; setVolume(volume:number):void; mute():void; unMute():void };
declare global { interface Window { YT?: { Player:new(id:string, options:Record<string,unknown>)=>YTPlayer }; onYouTubeIframeAPIReady?:()=>void } }

const DEFAULT_SONG:Song={id:"default-demo-drop",repName:"",title:"Default Demo Drop Song",artist:"YouTube",videoId:"vkSFh6HMUtQ",startSeconds:0};
const LEADER_SONG:Song={id:"new-leader-anthem",repName:"",title:"New Leader",artist:"Celebration Anthem",videoId:"Vtmo5ZwWb6c",startSeconds:0};
const youtubeIdFromInput=(value:string)=>{try{const url=new URL(value);if(url.hostname.includes("youtu.be"))return url.pathname.slice(1).split("/")[0];return url.searchParams.get("v")??url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1]??""}catch{return /^[\w-]{11}$/.test(value)?value:""}};

type SdrTeam = "inbound" | "outbound" | "cross-sell" | "blitz";

const SDR_QUOTA_BY_TEAM: Record<SdrTeam, number> = {
  inbound: 45,
  outbound: 12,
  "cross-sell": 27,
  blitz: 18,
};

// Team assignments from July 2026 org changes + June SPIFF rosters.
const SDR_TEAM_BY_REP: Record<string, SdrTeam> = {
  "Aaron Hill": "inbound",
  "Kenzie Sacks": "inbound",
  "Porter Whitworth": "inbound",
  "Audrey Linder": "inbound",
  "Kody Davis": "cross-sell",
  "Kana Makuakane": "cross-sell",
  "Christian Hawkins": "cross-sell",
  "Lexee Cheney": "cross-sell",
  "Kyla Probst": "cross-sell",
  "Ben PoVey": "cross-sell",
  "Kaden Backlund": "blitz",
  "Jace Muir": "blitz",
  "Trey Falkner": "blitz",
  "Logan Baker": "blitz",
  "Cason Clarke": "blitz",
  "Spencer Anderson": "blitz",
  "Carson Heber": "outbound",
  "Josh Cheney": "outbound",
  "Spencer Gowan": "outbound",
  "Aldo Lopez": "outbound",
  "Devin Stika": "outbound",
  "Dylan Hamilton": "outbound",
  "Easton Christiansen": "outbound",
  "Nick Crawford": "outbound",
  "Jack Gardner": "outbound",
  "Jeremy Thompson": "outbound",
  "Preston Francis": "outbound",
  "Ava Geertsen": "outbound",
  "Payton Clayson": "outbound",
  "Ty Armstrong": "outbound",
};

const SDR_QUOTA_OVERRIDES: Record<string, number> = {
  "Kana Makuakane": 45,
  "Preston Francis": 6,
  "Carson Heber": 6,
  "Lexee Cheney": 13,
};

const LEADERBOARD_EXCLUDED = new Set(["Shaline Vogler"]);

const SDR_NAMES = [
  "Aldo Lopez","Aaron Hill","Audrey Linder","Ava Geertsen","Ben PoVey","Carson Heber","Cason Clarke",
  "Christian Hawkins","Devin Stika","Dylan Hamilton","Easton Christiansen","Jace Muir","Jack Gardner",
  "Jeremy Thompson","Josh Cheney","Kaden Backlund","Kana Makuakane","Kenzie Sacks","Kody Davis","Kyla Probst",
  "Lexee Cheney","Logan Baker","Nick Crawford","Payton Clayson","Porter Whitworth","Preston Francis",
  "Spencer Anderson","Spencer Gowan","Trey Falkner","Ty Armstrong",
].sort();

const SONG_SDR_NAMES = [...SDR_NAMES, "Amber Washington", "Katelyn Moric"].sort();

const AE_PHOTOS:Record<string,string> = {
  "Paul Bills":"https://avatars.slack-edge.com/2025-02-28/8529823355829_9304a0625f18a41e92a9_original.png",
  "Jared PoVey":"https://avatars.slack-edge.com/2026-05-11/11102020612661_3b09a3a8feda8d4a431e_original.jpg",
  "Colin Anderson":"https://avatars.slack-edge.com/2025-03-10/8580103589877_efcbd7938fd87a343902_original.png",
  "Colin":"https://avatars.slack-edge.com/2025-03-10/8580103589877_efcbd7938fd87a343902_original.png",
  "Justin Rindt":"https://avatars.slack-edge.com/2023-10-18/6055804829253_5eef5e30c75755b803f1_original.jpg",
  "Matt Dubois":"https://avatars.slack-edge.com/2026-06-09/11317002691317_754c8ab54fa832baac9b_original.png",
  "Kyle Lemperle":"https://avatars.slack-edge.com/2024-08-05/7552357303232_a36bed52acf55cbff739_original.png",
  "Bryson Thomas":"https://avatars.slack-edge.com/2023-12-15/6353408651123_da09940dcc4beb804472_original.png",
  "Chad Tippets":"https://avatars.slack-edge.com/2026-07-10/11558424787333_475a8b9e9d133f5aa509_original.jpg",
  "Chad":"https://avatars.slack-edge.com/2026-07-10/11558424787333_475a8b9e9d133f5aa509_original.jpg",
  "Justin Jolley":"https://avatars.slack-edge.com/2026-03-02/10626318739505_0a2fc6b8ad8ef5f2154a_original.jpg",
  "Justin Kolley":"https://avatars.slack-edge.com/2026-03-02/10626318739505_0a2fc6b8ad8ef5f2154a_original.jpg",
  "Brody Wright":"https://avatars.slack-edge.com/2026-05-29/11239589793253_a56b1a48e4c35e95a786_original.png",
  "Brody Weight":"https://avatars.slack-edge.com/2026-05-29/11239589793253_a56b1a48e4c35e95a786_original.png",
  "Brody":"https://avatars.slack-edge.com/2026-05-29/11239589793253_a56b1a48e4c35e95a786_original.png",
  "Brock Mearian":"https://avatars.slack-edge.com/2025-11-25/9979736146679_26b0b4616e247bc02d3a_original.jpg",
  "Ethan Sherman":"https://avatars.slack-edge.com/2026-05-20/11174283332101_835b7fd1db6ae33afbb9_original.png",
  "Hayden Love":"https://avatars.slack-edge.com/2026-07-20/11625790752499_54cb8ec7f9ae1bc7e838_original.jpg",
  "Ike Rutter":"https://secure.gravatar.com/avatar/0da1a4498669ba322ffab8eabb6c6082.jpg?s=512&d=https%3A%2F%2Fa.slack-edge.com%2Fdf10d%2Fimg%2Favatars%2Fava_0008-512.png",
  "Isaac Jackman":"https://avatars.slack-edge.com/2024-10-28/7940789665542_853473b307d2e2d407d5_original.png",
  "Jackson O'Hara":"https://avatars.slack-edge.com/2025-11-27/10005734236853_799c207b8b340837efa1_original.png",
  "Kaylee Bott":"https://avatars.slack-edge.com/2023-11-08/6190466326672_5a180fedcdff8c88c199_original.png",
  "Kayne Bosma":"https://avatars.slack-edge.com/2025-12-01/10056136369216_dee10db94010601ae4dd_original.png",
  "Kobe Dixon":"https://avatars.slack-edge.com/2025-10-28/9784502886787_79632bafc4b9f50a2c5a_original.png",
  "Lindsey Simser":"https://avatars.slack-edge.com/2026-03-18/10757709788544_9d133afefd66214c6ca0_original.jpg",
  "Marcus Smith":"https://avatars.slack-edge.com/2026-06-03/11277917272324_6c4b4ee152bda108a586_original.jpg",
  "Marcus Jr.":"https://avatars.slack-edge.com/2026-06-03/11277917272324_6c4b4ee152bda108a586_original.jpg",
  "MJ":"https://avatars.slack-edge.com/2026-06-03/11277917272324_6c4b4ee152bda108a586_original.jpg",
  "Matthew Larsen":"https://avatars.slack-edge.com/2026-06-04/11278268861123_47e1c4617c40350c7299_original.png",
  "Matt Larsen":"https://avatars.slack-edge.com/2026-06-04/11278268861123_47e1c4617c40350c7299_original.png",
  "Payton Anderson":"https://avatars.slack-edge.com/2026-04-13/10931232556864_b684105ea0c4f2c06b41_original.png",
  "Peyton Anderson":"https://avatars.slack-edge.com/2026-04-13/10931232556864_b684105ea0c4f2c06b41_original.png",
  "Peyton":"https://avatars.slack-edge.com/2026-04-13/10931232556864_b684105ea0c4f2c06b41_original.png",
  "Harrison Sanford":"https://avatars.slack-edge.com/2025-11-05/9863531691233_ea688e4cb5a6b3905cfa_original.png",
  "Sarah Parker":"https://avatars.slack-edge.com/2025-02-17/8464298390915_633292dfec0438d74912_original.jpg",
  "Seth Wilkins":"https://avatars.slack-edge.com/2026-05-22/11194149067681_3e9aae444143eb607f4e_original.jpg",
};

const LOCAL_PREVIEW_WIN:Win={
  id:"local-preview-porter",
  repName:"Porter Whitworth",
  company:"Sunrise Family Dentistry",
  product:"Demo completed",
  songId:"victory-lap",
  createdAt:"2026-08-06T20:00:00.000Z",
  aeName:"Justin Jolley",
};
const isLocalPreviewHost=()=>typeof window!=="undefined"&&["localhost","127.0.0.1"].includes(window.location.hostname);
const DISPLAY_TIMEZONE="America/Denver";

const PROFILE_PHOTOS:Record<string,string> = {
  "Aaron Hill":"https://avatars.slack-edge.com/2026-04-24/10991526944806_f1ea48129e560ba111e6_original.png",
  "Aldo Lopez":"https://avatars.slack-edge.com/2025-10-15/9703111814726_bb41a84d06b9ef61874b_original.jpg",
  "Aldo":"https://avatars.slack-edge.com/2025-10-15/9703111814726_bb41a84d06b9ef61874b_original.jpg",
  "Audrey Linder":"https://avatars.slack-edge.com/2026-03-02/10611268373542_60afd5fdb395219ccc3c_original.png",
  "Ava Geertsen":"https://avatars.slack-edge.com/2026-06-12/11329761946343_b306ec3fabe2e63110fe_original.png",
  "Ben PoVey":"https://avatars.slack-edge.com/2026-05-19/11162577720598_e496ecab6537e35e045e_original.jpg",
  "Carson Heber":"https://avatars.slack-edge.com/2026-07-09/11556410895250_5460657a874932eb26c0_original.png",
  "Cason Clarke":"https://avatars.slack-edge.com/2025-11-11/9896468367988_c885256277e71f73ed3d_original.png",
  "Christian Hawkins":"https://avatars.slack-edge.com/2025-10-08/9659784054486_59d936ebfefdb32bda18_original.png",
  "Devin Stika":"https://avatars.slack-edge.com/2025-02-25/8533946848096_9b876e0c46fe79e7ea89_original.jpg",
  "Dylan Hamilton":"https://avatars.slack-edge.com/2026-05-19/11169062394052_2989a70f92d14f5922b4_original.jpg",
  "Easton Christiansen":"https://avatars.slack-edge.com/2026-05-26/11212537496770_b22931c97cbc19f4b4a6_original.png",
  "Jace Muir":"https://avatars.slack-edge.com/2026-05-13/11127106550196_480f666377706665948c_original.png",
  "Jack Gardner":"https://secure.gravatar.com/avatar/cf133158570f5beaceae0d856ee48c24.jpg?s=512",
  "Jeremy Thompson":"https://avatars.slack-edge.com/2026-06-02/11267949618436_7e67363aa178698cea5d_original.png",
  "Josh Cheney":"https://avatars.slack-edge.com/2026-05-19/11192449227072_c8d7d74b354a88e4bcff_original.jpg",
  "Kaden Backlund":"https://secure.gravatar.com/avatar/db7cee5c2cfc3fa97b5d3bc2193c5118.jpg?s=512",
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
  "Amber Washington":"https://avatars.slack-edge.com/2026-04-08/10871432056306_7466de2630b81a7f6844_original.jpg",
  "Katelyn Moric":"https://avatars.slack-edge.com/2026-03-31/10846120726416_0ac3ad91ac7ee3a9b3e5_original.png",
  "Spencer Anderson":"https://secure.gravatar.com/avatar/e14c51407e4deaccca87fb7012f35c8d.jpg?s=512",
  "Spencer Gowan":"https://avatars.slack-edge.com/2026-02-03/10446198740337_3dc774a9637b5df37708_original.jpg",
  "Trey Falkner":"https://avatars.slack-edge.com/2026-03-13/10696428094498_295e8b181babf42de68b_original.png",
  "Ty Armstrong":"https://avatars.slack-edge.com/2025-07-29/9287649416449_bf95eec2ec3ad04895a3_original.png",
};

const initialWins: Win[] = [];
const formatCompletedAt=(value:string)=>{if(value==="Just now")return value;const raw=String(value);const date=/^\d{10,13}$/.test(raw)?new Date(Number(raw.length===10?`${raw}000`:raw)):new Date(raw);return Number.isNaN(date.getTime())?"Recently":date.toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:DISPLAY_TIMEZONE})};

const normalizeRepName=(value:string)=>String(value??"").trim().replace(/\s+/g," ").toLowerCase();
const canonicalRepName=(value:string)=>String(value??"").trim().replace(/\s+/g," ");
const repLookup=<T,>(map:Record<string,T>,name:string)=>{
  if(map[name]!==undefined)return map[name];
  const normalized=normalizeRepName(name);
  return Object.entries(map).find(([key])=>normalizeRepName(key)===normalized)?.[1];
};
const photoFor=(name:string,map:Record<string,string>)=>{
  if(!name)return undefined;
  if(map[name])return map[name];
  const normalized=normalizeRepName(name);
  return Object.entries(map).find(([key])=>normalizeRepName(key)===normalized)?.[1];
};
const quotaForRep=(name:string)=>repLookup(SDR_QUOTA_OVERRIDES,name)??SDR_QUOTA_BY_TEAM[repLookup(SDR_TEAM_BY_REP,name)??"outbound"];
const isLeaderboardExcluded=(name:string)=>LEADERBOARD_EXCLUDED.has(name)||[...LEADERBOARD_EXCLUDED].some(excluded=>normalizeRepName(excluded)===normalizeRepName(name));
const mergeMonthlyCounts=(items:{repName:string;count:number}[]|undefined)=>{
  const merged=new Map<string,{displayName:string;count:number}>();
  for(const item of items??[]){
    const displayName=canonicalRepName(item.repName);
    if(!displayName||isLeaderboardExcluded(displayName))continue;
    const norm=normalizeRepName(displayName);
    const existing=merged.get(norm);
    merged.set(norm,{displayName:existing?.displayName??displayName,count:(existing?.count??0)+Math.max(0,Number(item.count)||0)});
  }
  return Object.fromEntries([...merged.values()].map(entry=>[entry.displayName,entry.count]));
};
const pctToQuota=(count:number,quota:number)=>Math.min(100,Math.round((count/quota)*100));
type LeaderboardEntry={repName:string;count:number;quota:number;pct:number;rank:number};
const sameLeaderboardScore=(a:{pct:number},b:{pct:number})=>a.pct===b.pct;
const medalForRank=(rank:number)=>rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":null;
const buildLeaderboard=(counts:Record<string,number>)=>{const sorted=Object.entries(counts).filter(([repName])=>!isLeaderboardExcluded(repName)).map(([repName,count])=>{const quota=quotaForRep(repName);return{repName,count,quota,pct:pctToQuota(count,quota)}}).sort((a,b)=>b.pct-a.pct||b.count-a.count||a.repName.localeCompare(b.repName));const ranked:LeaderboardEntry[]=[];for(let index=0;index<sorted.length;index++){const entry=sorted[index]!;const rank=index===0||!sameLeaderboardScore(entry,sorted[index-1]!)?index+1:ranked[index-1]!.rank;ranked.push({...entry,rank})}return ranked};
const rankBadgeForRep=(entries:LeaderboardEntry[],name:string)=>{const entry=entries.find(item=>normalizeRepName(item.repName)===normalizeRepName(name));if(!entry)return null;return medalForRank(entry.rank)??`#${entry.rank}`};
const topLeaderFromCounts=(counts:Record<string,number>)=>{const top=buildLeaderboard(counts)[0];if(!top||top.count<=0)return null;return{displayName:top.repName,norm:normalizeRepName(top.repName),pct:top.pct,count:top.count}};
const initialsFor=(name:string)=>name.split(" ").map(part=>part[0]).slice(0,2).join("");
// The SDR's saved song is authoritative. Never borrow a song from another rep
// when a HubSpot event contains an empty, stale, or default song id.
const songFor = (win:Win, songs:Song[]) => songs.find(s=>normalizeRepName(s.repName)===normalizeRepName(win.repName)) ?? {...DEFAULT_SONG,repName:win.repName};

export default function Home() {
  const [wins,setWins]=useState(initialWins);
  const [active,setActive]=useState<Win|null>(null);
  const [songs,setSongs]=useState<Song[]>([]);
  const [selectedSong,setSelectedSong]=useState("");
  const [seconds,setSeconds]=useState(15);
  const [playing,setPlaying]=useState(false);
  const [celebrating,setCelebrating]=useState(false);
  const [leaderCelebrating,setLeaderCelebrating]=useState(false);
  const [newLeaderName,setNewLeaderName]=useState<string|null>(null);
  const [monthlyCounts,setMonthlyCounts]=useState<Record<string,number>>({});
  const [showSetup,setShowSetup]=useState(false);
  const [setupRep,setSetupRep]=useState<string|null>(null);
  const [form,setForm]=useState({repName:"Porter Whitworth",youtubeUrl:"",startSeconds:"0"});
  const [formError,setFormError]=useState("");
  const playerRef=useRef<YTPlayer|null>(null);
  const pendingSongRef=useRef<Song|null>(null);
  const playSongRef=useRef<(song?:Song)=>void>(()=>{});
  const stopRef=useRef<number|null>(null);
  const fadeRefs=useRef<number[]>([]);
  const lastServerIdRef=useRef<string|null>(null);
  const leaderRef=useRef<string|null>(null);
  const leaderReadyRef=useRef(false);
  const prevCountsRef=useRef<Record<string,number>>({});
  const leaderCelebratingRef=useRef(false);
  const previewReadyRef=useRef(false);
  const songsRef=useRef<Song[]>([]);
  const activeBeforeLeaderRef=useRef<Win|null>(null);
  const activeRef=useRef<Win|null>(null);
  const [localPreview,setLocalPreview]=useState(false);

  useEffect(()=>{setLocalPreview(isLocalPreviewHost())},[]);
  useEffect(()=>{activeRef.current=active},[active]);
  useEffect(()=>{leaderCelebratingRef.current=leaderCelebrating},[leaderCelebrating]);


  const currentSong=leaderCelebrating?LEADER_SONG:active?songFor(active,songs):songs[0]??DEFAULT_SONG;
  const setupSong=setupRep?songs.find(s=>normalizeRepName(s.repName)===normalizeRepName(setupRep)):undefined;
  const setupVideoId=youtubeIdFromInput(form.youtubeUrl);

  const openSetup=()=>{setSetupRep(null);setFormError("");setShowSetup(true)};
  const chooseSetupRep=(repName:string)=>{const saved=songs.find(s=>normalizeRepName(s.repName)===normalizeRepName(repName));setSetupRep(repName);setForm({repName,youtubeUrl:`https://www.youtube.com/watch?v=${saved?.videoId??DEFAULT_SONG.videoId}`,startSeconds:String(saved?.startSeconds??DEFAULT_SONG.startSeconds)});setFormError("")};

  const clearFades=useCallback(()=>{fadeRefs.current.forEach(timer=>window.clearTimeout(timer));fadeRefs.current=[]},[]);

  const playSong=useCallback((song?:Song) => {
    if (!song) return;
    if (!playerRef.current || typeof playerRef.current.loadVideoById !== "function") {
      pendingSongRef.current=song;
      return;
    }
    pendingSongRef.current=null;
    if (stopRef.current) window.clearTimeout(stopRef.current);
    clearFades();
    if(typeof playerRef.current.setVolume==="function")playerRef.current.setVolume(0);
    if (typeof playerRef.current.unMute === "function") playerRef.current.unMute();
    playerRef.current.loadVideoById({videoId:song.videoId,startSeconds:song.startSeconds,endSeconds:song.startSeconds+16});
    // Start the new celebration immediately when a HubSpot completion arrives.
    // The explicit play call is needed after loadVideoById on some browsers.
    if (typeof playerRef.current.playVideo === "function") playerRef.current.playVideo();
    for(let step=1;step<=15;step++)fadeRefs.current.push(window.setTimeout(()=>{if(typeof playerRef.current?.setVolume==="function")playerRef.current.setVolume(Math.round(step/15*100))},step*100));
    for(let step=1;step<=45;step++)fadeRefs.current.push(window.setTimeout(()=>{const remaining=1-step/45;if(typeof playerRef.current?.setVolume==="function")playerRef.current.setVolume(Math.max(0,Math.round(100*remaining*remaining)))},10500+step*100));
    setSeconds(15); setPlaying(true);
    stopRef.current=window.setTimeout(()=>{clearFades();if(typeof playerRef.current?.setVolume==="function")playerRef.current.setVolume(0);if(typeof playerRef.current?.stopVideo==="function")playerRef.current.stopVideo();setPlaying(false);setSeconds(0)},15300);
  },[clearFades]);

  useEffect(()=>{playSongRef.current=playSong},[playSong]);

  const launch=useCallback((win:Win, availableSongs=songsRef.current, updateWins=true)=>{
    setActive(win);
    if(updateWins)setWins(current=>[win,...current.filter(item=>item.id!==win.id)].slice(0,6));
    setSeconds(15); setCelebrating(true);
    window.setTimeout(()=>{setCelebrating(false);setActive(null)},15300);
    playSong(songFor(win,availableSongs));
  },[playSong]);

  const launchLeader=useCallback((repName:string)=>{
    activeBeforeLeaderRef.current=activeRef.current;
    setCelebrating(false);
    setActive(null);
    setNewLeaderName(repName);
    setLeaderCelebrating(true);
    setSeconds(15);
    window.setTimeout(()=>{
      setLeaderCelebrating(false);
      setNewLeaderName(null);
    },15300);
    playSong(LEADER_SONG);
  },[playSong]);

  useEffect(()=>{ if(!playing)return; const timer=window.setInterval(()=>setSeconds(v=>Math.max(0,v-1)),1000); return()=>window.clearInterval(timer)},[playing]);

  useEffect(()=>{
    let mounted=true;
    const refreshSongs=async()=>{
      try{const res=await fetch("/api/songs",{cache:"no-store"});const data=await res.json() as {songs?:Song[]};const list=data.songs??[];if(mounted&&list.length){songsRef.current=list;setSongs(list);}}
      catch{/* Setup remains available while reconnecting. */}
    }; refreshSongs();const poller=window.setInterval(refreshSongs,15000);return()=>{mounted=false;window.clearInterval(poller)};
  },[]);

  useEffect(()=>{
    let mounted=true;
    const loadSongs=async()=>{
      let availableSongs=songsRef.current;
      if(availableSongs.length)return availableSongs;
      try{
        const songRes=await fetch("/api/songs",{cache:"no-store"});
        const songData=await songRes.json() as {songs?:Song[]};
        availableSongs=songData.songs??[];
        if(availableSongs.length){songsRef.current=availableSongs;setSongs(availableSongs)}
      }catch{}
      return availableSongs;
    };
    const sync=async()=>{
      try{
        const res=await fetch("/api/events",{cache:"no-store"});
        const data=await res.json() as {events?:Win[];monthlyCounts?:{repName:string;count:number}[]};
        if(!mounted)return;
        const normalized=(data.events??[]).filter(item=>!isLeaderboardExcluded(item.repName));
        const counts=mergeMonthlyCounts(data.monthlyCounts);
        const previewWin=localPreview?LOCAL_PREVIEW_WIN:null;
        const displayWins=previewWin?[previewWin,...normalized.filter(item=>item.id!==previewWin.id)]:normalized;
        setWins(displayWins);
        setMonthlyCounts(counts);
        const newest=normalized[0];
        const isNewEvent=Boolean(newest&&lastServerIdRef.current&&lastServerIdRef.current!==newest.id&&!localPreview);
        const topLeader=topLeaderFromCounts(counts);
        const sameRepLeader=Boolean(isNewEvent&&topLeader&&newest&&normalizeRepName(newest.repName)===topLeader.norm);
        let leaderLaunched=false;

        if(!leaderReadyRef.current){
          if(topLeader)leaderRef.current=topLeader.norm;
          prevCountsRef.current=counts;
          leaderReadyRef.current=true;
        }else if(isNewEvent&&newest&&!localPreview&&!leaderCelebratingRef.current){
          const leaderBefore=topLeaderFromCounts(prevCountsRef.current);
          const eventRep=canonicalRepName(newest.repName);
          const optimisticCounts={...counts,[eventRep]:Math.max(counts[eventRep]??0,(prevCountsRef.current[eventRep]??counts[eventRep]??0)+1)};
          const leaderAfter=topLeaderFromCounts(optimisticCounts);
          if(leaderAfter&&leaderBefore?.norm!==leaderAfter.norm){
            launchLeader(leaderAfter.displayName);
            leaderLaunched=true;
          }
        }

        if(topLeader)leaderRef.current=topLeader.norm;
        prevCountsRef.current=counts;
        if(localPreview&&!previewReadyRef.current)previewReadyRef.current=true;
        if(isNewEvent&&!(leaderLaunched&&sameRepLeader)){
          const availableSongs=await loadSongs();
          launch(newest!,availableSongs);
        }
        if(newest)lastServerIdRef.current=newest.id;
      }catch{}
    };
    sync();const poller=window.setInterval(sync,3000);return()=>{mounted=false;window.clearInterval(poller)};
  },[launch,launchLeader,localPreview]);

  useEffect(()=>{
    if(!currentSong)return;
    const cueCurrentSong=()=>{
      if(pendingSongRef.current){
        playSongRef.current(pendingSongRef.current);
        return;
      }
      if(!playing&&typeof playerRef.current?.cueVideoById==="function")playerRef.current.cueVideoById({videoId:currentSong.videoId,startSeconds:currentSong.startSeconds,endSeconds:currentSong.startSeconds+15});
    };
    if(playerRef.current){cueCurrentSong();return}
    const createPlayer=()=>{if(!window.YT||typeof window.YT.Player!=="function"||playerRef.current)return false;playerRef.current=new window.YT.Player("youtube-player",{height:"200",width:"200",videoId:currentSong.videoId,playerVars:{autoplay:1,playsinline:1,controls:1,start:currentSong.startSeconds,origin:window.location.origin,enablejsapi:1},events:{onReady:cueCurrentSong,onStateChange:(event:{data:number})=>{if(event.data===0&&pendingSongRef.current)playSongRef.current(pendingSongRef.current)}}});return true};
    if(!document.querySelector("script[data-youtube-api]")){const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;script.dataset.youtubeApi="true";document.body.appendChild(script)}
    window.onYouTubeIframeAPIReady=createPlayer;
    if(createPlayer())return;
    const readyCheck=window.setInterval(()=>{if(createPlayer())window.clearInterval(readyCheck)},250);
    return()=>window.clearInterval(readyCheck);
  },[currentSong?.videoId,currentSong?.startSeconds,playing]);

  const togglePlayback=()=>{if(playing){clearFades();if(stopRef.current)window.clearTimeout(stopRef.current);if(typeof playerRef.current?.pauseVideo==="function")playerRef.current.pauseVideo();setPlaying(false)}else playSong(currentSong)};

  const saveSong=async()=>{
    setFormError("");
    const response=await fetch("/api/songs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,startSeconds:Number(form.startSeconds)})});
    const data=await response.json() as {song?:Song;error?:string};if(!response.ok||!data.song){setFormError(data.error??"Could not save this clip");return}
    setSongs(current=>{const updated=[data.song!,...current.filter(s=>s.id!==data.song!.id&&normalizeRepName(s.repName)!==normalizeRepName(data.song!.repName))];songsRef.current=updated;return updated});setSelectedSong(data.song.id);setSetupRep(null);setShowSetup(false);
  };

  const rerunMostRecentWin=async()=>{
    try{
      const response=await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"replay-most-recent"})});
      const data=await response.json() as {event?:Win};
      if(!response.ok||!data.event)return;
      launch(data.event,songsRef.current,false);
    }catch{/* The live feed will stay unchanged if the replay request fails. */}
  };

  const testNewLeader=()=>{
    const top=buildLeaderboard(monthlyCounts)[0];
    if(!top)return;
    launchLeader(top.repName);
  };

  const progress=((15-seconds)/15)*100;
  const demoCountFor=(name:string)=>monthlyCounts[name]??0;
  const leaderboard=buildLeaderboard(monthlyCounts);
  const topThree=leaderboard.slice(0,3);
  const leaderboardRest=leaderboard.slice(3,12);
  const monthLabel=new Date().toLocaleString("en-US",{month:"long",year:"numeric",timeZone:DISPLAY_TIMEZONE});
  const showDemoTakeover=celebrating&&active&&!leaderCelebrating;
  const renderFace=(name:string,map:Record<string,string>,className="")=>{const photo=photoFor(name,map);return photo?<img className={className} src={photo} alt=""/>:<span className={className}>{initialsFor(name)}</span>};
  const renderPlayerCard=(className="",label=leaderCelebrating?"LEADER CELEBRATION":"AUTO CELEBRATION")=>(
    <div className={`player-card ${className}`.trim()}>
      <div className="youtube-shell"><img src={`https://i.ytimg.com/vi/${currentSong.videoId}/hqdefault.jpg`} alt={`${currentSong.title} artwork`}/></div>
      <div className="track-meta"><div className="track-title-row"><div><strong>{currentSong.title}</strong><span>{`${currentSong.artist} · ${currentSong.startSeconds}s–${currentSong.startSeconds+15}s`}</span></div><span className="approved">{label}</span></div><div className="waveform">{Array.from({length:52}).map((_,i)=><i key={i} className={i/52*100<=progress?"passed":""} style={{height:`${20+((i*17)%64)}%`}}/>)}</div><div className="time-row"><span>0:{String(15-seconds).padStart(2,"0")}</span><button onClick={togglePlayback}>{playing?"PAUSE":"PLAY CLIP"}</button><span>0:15</span></div></div>
    </div>
  );
  const renderLeaderboard=()=>(
    <aside className="leaderboard-panel"><div className="leaderboard-head"><span className="strip-label">MONTHLY LEADERBOARD</span><p>{monthLabel}</p><small>Inbound {SDR_QUOTA_BY_TEAM.inbound} · Outbound {SDR_QUOTA_BY_TEAM.outbound} · Cross-sell {SDR_QUOTA_BY_TEAM["cross-sell"]} · Blitz {SDR_QUOTA_BY_TEAM.blitz} demo completes = 100%</small></div><ol className="leaderboard-list">{leaderboardRest.length?leaderboardRest.map(entry=><li key={entry.repName} className="leaderboard-row"><span className="leaderboard-rank">{entry.rank}</span>{renderFace(entry.repName,PROFILE_PHOTOS,"leaderboard-avatar")}<div className="leaderboard-tab-body"><strong className="leaderboard-name">{entry.repName}</strong><span className="leaderboard-count">{entry.count} / {entry.quota}</span><div className="leaderboard-side"><em>{entry.pct}%</em><div className="quota-bar" aria-hidden="true"><i style={{width:`${entry.pct}%`}}/></div></div></div></li>):<li className="leaderboard-empty">{leaderboard.length>3?"Everyone else is still at zero.":"Waiting for monthly counts from HubSpot…"}</li>}</ol></aside>
  );
  const renderPodiumSlot=(entry:LeaderboardEntry,position:1|2|3,compact=false)=>(
    <div key={entry.repName} className={`podium-slot place-${position}${compact?" is-compact":""}`}>{renderFace(entry.repName,PROFILE_PHOTOS,`podium-face place-${position}`)}<div className="podium-copy"><strong>{medalForRank(entry.rank)?<><span className="podium-medal podium-medal-inline" aria-hidden="true">{medalForRank(entry.rank)}</span> {entry.repName}</>:entry.repName}</strong><span>{entry.count} / {entry.quota} completes</span><em>{entry.pct}% to quota</em></div></div>
  );
  const renderPodium=()=>(
    <div className="podium-stage"><div className="podium">{topThree.length?<><p className="podium-label">MONTHLY LEADERS · {monthLabel}</p>{topThree[0]?<div className="podium-leader">{renderPodiumSlot(topThree[0],1)}</div>:null}{topThree.slice(1).map((entry,index)=><div key={entry.repName} className={`podium-runner place-${index+2}-row`}>{renderPodiumSlot(entry,(index+2) as 2|3,true)}</div>)}</>:<p className="podium-empty">Waiting for monthly counts from HubSpot…</p>}</div></div>
  );
  const renderDemoTakeover=()=>active?(
    <div className="demo-takeover" role="status" aria-live="polite"><div className="demo-takeover-glow" aria-hidden="true"/><div className="demo-takeover-content"><p className="demo-takeover-label">DEMO COMPLETED</p><div className="deal-team"><div className="rep-hero sdr-hero">{renderFace(active.repName,PROFILE_PHOTOS)}<div><small>SDR</small><h1>{active.repName}</h1></div></div>{active.aeName?<div className="rep-hero ae-hero">{renderFace(active.aeName,AE_PHOTOS)}<div><small>AE</small><strong>{active.aeName}</strong></div></div>:null}</div><p className="account-line"><b>{active.company}</b> <span>•</span> {active.product} <span>•</span> {formatCompletedAt(active.createdAt)}</p></div>{renderPlayerCard("demo-takeover-player")}</div>
  ):null;
  return <main className={`app-shell ${celebrating||leaderCelebrating?"is-celebrating":""} ${leaderCelebrating?"is-new-leader":""} ${showDemoTakeover?"is-demo-celebrating":""}`}>
    <nav className="topbar"><div className="brand-lockup"><img src="https://unrivaled-taffy-45056.netlify.app/01-logo/pearl-logo-primary-circled.svg" alt="Pearl"/><span className="brand-divider"/><span className="product-name">DEMO DROP</span></div><div className="topbar-actions">{localPreview&&<span className="live-pill preview-pill"><i/> LOCAL PREVIEW · LIVE DATA</span>}<span className="live-pill"><i/> LIVE FROM HUBSPOT</span><button className="icon-button" onClick={testNewLeader} disabled={!leaderboard.length}>TEST NEW LEADER</button><button className="icon-button" onClick={rerunMostRecentWin}>RE-RUN MOST RECENT</button><button className="icon-button" onClick={openSetup}>SET UP SONGS</button></div></nav>
    <section className="stage"><div className="ambient orb-one"/><div className="ambient orb-two"/><div className="grid-lines"/>{(celebrating||leaderCelebrating)&&<div className="confetti" aria-hidden="true">{Array.from({length:90}).map((_,i)=><i key={i} style={{"--x":`${(i*37)%101}%`,"--mid":`${((i*29)%80)-40}px`,"--drift":`${((i*53)%180)-90}px`,"--delay":`${(i%12)*.035}s`,"--duration":`${2.4+(i%9)*.13}s`,"--spin":`${540+(i%8)*135}deg`,"--w":`${5+(i%4)*2}px`,"--h":`${i%5===0?7:12+(i%4)*3}px`} as CSSProperties}/>)}</div>}
      {leaderCelebrating&&newLeaderName?<div className="leader-takeover" role="status" aria-live="polite"><div className="leader-takeover-glow" aria-hidden="true"/><div className="leader-takeover-content"><span className="leader-takeover-crown" aria-hidden="true">👑</span><p className="leader-takeover-label">NEW LEADER</p>{renderFace(newLeaderName,PROFILE_PHOTOS,"leader-takeover-face")}<h1 className="leader-takeover-name">{newLeaderName}</h1><p className="leader-takeover-stats"><b>{demoCountFor(newLeaderName)} / {quotaForRep(newLeaderName)}</b> demo completes · <b>{pctToQuota(demoCountFor(newLeaderName),quotaForRep(newLeaderName))}%</b> to quota</p></div>{renderPlayerCard("leader-takeover-player","LEADER CELEBRATION")}</div>:showDemoTakeover?renderDemoTakeover():<div className="stage-layout"><div className="stage-podium">{renderPodium()}</div><div className="stage-leaderboard">{renderLeaderboard()}</div></div>}
    </section>
    <section className="control-strip"><div className="recent-wins"><span className="strip-label">RECENT WINS</span><div className="win-list">{wins.slice(0,5).map(win=>{const badge=rankBadgeForRep(leaderboard,win.repName);return <button key={win.id} onClick={()=>launch(win)} className="win-item"><span className="win-faces-col"><span className="win-faces">{PROFILE_PHOTOS[win.repName]?<img className="avatar" src={PROFILE_PHOTOS[win.repName]} alt=""/>:<span className="avatar">{win.repName.split(" ").map(p=>p[0]).slice(0,2).join("")}</span>}{win.aeName?(photoFor(win.aeName,AE_PHOTOS)?<img className="avatar avatar-ae" src={photoFor(win.aeName,AE_PHOTOS)!} alt=""/>:<span className="avatar avatar-ae">{initialsFor(win.aeName)}</span>):null}</span>{badge&&<span className="win-rank-badge">{badge}</span>}</span><span className="win-copy"><strong>{win.repName}</strong>{win.aeName&&<small className="win-ae-line">AE: {win.aeName}</small>}<small><b>{demoCountFor(win.repName)}</b> demos complete</small><em>{formatCompletedAt(win.createdAt)}</em></span></button>})}</div></div></section>
    {showSetup&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowSetup(false)}}><section className="song-modal" role="dialog" aria-modal="true" aria-labelledby="song-modal-title"><div className="modal-head"><div><span className="strip-label">REP CELEBRATION</span><h2 id="song-modal-title">{setupRep?setupRep:"Set up songs"}</h2></div><button onClick={()=>setShowSetup(false)} aria-label="Close">×</button></div>{!setupRep?<><p>Choose an SDR to see or change their song.</p><div className="rep-song-list">{SONG_SDR_NAMES.map(name=>{const saved=songs.find(s=>normalizeRepName(s.repName)===normalizeRepName(name));return <button key={name} onClick={()=>chooseSetupRep(name)}><span className="rep-list-avatar">{PROFILE_PHOTOS[name]?<img src={PROFILE_PHOTOS[name]} alt=""/>:name.split(" ").map(p=>p[0]).slice(0,2).join("")}</span><span><strong>{name}</strong><small>{saved?`${saved.title} · ${saved.artist}`:"Default song"}</small></span><b>CHANGE ›</b></button>})}</div></>:<><button className="back-to-reps" onClick={()=>setSetupRep(null)}>‹ ALL SDRS</button><p>{setupSong?"Their saved song is loaded below. Paste a different URL to change it.":"The default song is loaded below. Paste a different URL to personalize it."}</p><div className="song-url-preview">{setupVideoId&&<img src={`https://i.ytimg.com/vi/${setupVideoId}/hqdefault.jpg`} alt="Selected YouTube song thumbnail"/>}<label>YOUTUBE LINK<input placeholder="https://youtube.com/watch?v=..." value={form.youtubeUrl} onChange={e=>setForm({...form,youtubeUrl:e.target.value})}/></label></div><label>START TIME IN SECONDS<input type="number" min="0" value={form.startSeconds} onChange={e=>setForm({...form,startSeconds:e.target.value})}/><small>Example: 1:12 into the song = 72 seconds. The site stops automatically 15 seconds later.</small></label>{formError&&<p className="form-error">{formError}</p>}<div className="modal-actions"><button onClick={()=>setSetupRep(null)}>BACK</button><button className="test-button" onClick={saveSong}>{setupSong?"SAVE CHANGES":"SAVE PERSONAL SONG"}</button></div></>}</section></div>}
    <div className="audio-player" aria-hidden="true"><div id="youtube-player"/></div>
  </main>;
}
