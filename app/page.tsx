"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Win = {
  id: string;
  repName: string;
  company: string;
  product: string;
  songId: string;
  createdAt: string;
};

const songs = [
  { id: "victory-lap", title: "Victory Lap", vibe: "Stadium energy", colors: ["#91BCD4", "#C0E7DB"] },
  { id: "main-stage", title: "Main Stage", vibe: "Festival pop", colors: ["#E0BFDE", "#F3EBDD"] },
  { id: "skyline", title: "Skyline", vibe: "Bright electronic", colors: ["#C9D8F4", "#FBDFD7"] },
  { id: "overtime", title: "Overtime", vibe: "Fast hip-hop", colors: ["#D0CDDF", "#FFF1D8"] },
];

const initialWins: Win[] = [
  { id: "1", repName: "Porter Whitworth", company: "Bright Smiles Dental", product: "Pearl Voice", songId: "victory-lap", createdAt: "10:42 AM" },
  { id: "2", repName: "Casen Cowdrey", company: "Studio Dental", product: "Practice Intelligence", songId: "skyline", createdAt: "9:18 AM" },
  { id: "3", repName: "Maya Rodriguez", company: "Oakview Dentistry", product: "Precheck", songId: "main-stage", createdAt: "Yesterday" },
];

function synthTone(songId: string, remaining: number, audioRef: React.MutableRefObject<AudioContext | null>) {
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = audioRef.current ?? new AudioCtx();
  audioRef.current = ctx;
  const patterns: Record<string, number[]> = {
    "victory-lap": [220, 277, 330, 440, 330, 554, 440, 659],
    "main-stage": [262, 330, 392, 523, 392, 659, 523, 784],
    skyline: [196, 247, 294, 392, 494, 392, 587, 494],
    overtime: [147, 220, 294, 220, 330, 294, 392, 330],
  };
  const notes = patterns[songId] ?? patterns["victory-lap"];
  const start = ctx.currentTime;
  for (let i = 0; i < Math.min(30, Math.ceil(remaining * 2)); i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i % 4 === 0 ? "sawtooth" : "triangle";
    osc.frequency.value = notes[i % notes.length];
    gain.gain.setValueAtTime(0, start + i * 0.5);
    gain.gain.linearRampToValueAtTime(0.055, start + i * 0.5 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + i * 0.5 + 0.38);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + i * 0.5);
    osc.stop(start + i * 0.5 + 0.42);
  }
}

export default function Home() {
  const [wins, setWins] = useState(initialWins);
  const [active, setActive] = useState<Win>(initialWins[0]);
  const [selectedSong, setSelectedSong] = useState("victory-lap");
  const [seconds, setSeconds] = useState(15);
  const [playing, setPlaying] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);
  const lastServerIdRef = useRef<string | null>(null);

  const launch = useCallback((win: Win) => {
    setActive(win);
    setWins((current) => [win, ...current.filter((item) => item.id !== win.id)].slice(0, 6));
    setSeconds(15);
    setPlaying(true);
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), 3200);
    if (soundOn) synthTone(win.songId, 15, audioRef);
  }, [soundOn]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          setPlaying(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    let mounted = true;
    const sync = async () => {
      try {
        const response = await fetch("/api/events", { cache: "no-store" });
        const data = await response.json() as { events?: Win[] };
        if (!mounted || !data.events?.length) return;
        const normalized = data.events.map((event) => ({
          ...event,
          createdAt: event.createdAt === "Just now" ? event.createdAt : new Date(event.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        }));
        setWins(normalized);
        const newest = normalized[0];
        if (lastServerIdRef.current && lastServerIdRef.current !== newest.id) launch(newest);
        lastServerIdRef.current = newest.id;
      } catch {
        // The display keeps running with its last known state while reconnecting.
      }
    };
    sync();
    const poller = window.setInterval(sync, 3000);
    return () => { mounted = false; window.clearInterval(poller); };
  }, [launch]);

  const testDrop = () => {
    const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    repName: "Porter Whitworth",
    company: "Pearl Customer",
    product: "Demo completed",
    songId: selectedSong,
    createdAt: "Just now",
    };
    lastServerIdRef.current = event.id;
    launch(event);
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) }).catch(() => undefined);
  };

  const song = songs.find((item) => item.id === active.songId) ?? songs[0];
  const progress = ((15 - seconds) / 15) * 100;

  return (
    <main className={`app-shell ${celebrating ? "is-celebrating" : ""}`}>
      <nav className="topbar">
        <div className="brand-lockup">
          <img src="https://unrivaled-taffy-45056a.netlify.app/01-logo/pearl-logo-primary-circled.svg" alt="Pearl" />
          <span className="brand-divider" />
          <span className="product-name">DEMO DROP</span>
        </div>
        <div className="topbar-actions">
          <span className="live-pill"><i /> LIVE FROM HUBSPOT</span>
          <button className="icon-button" onClick={() => setSoundOn((value) => !value)} aria-label="Toggle celebration sound">
            {soundOn ? "VOL  ON" : "VOL OFF"}
          </button>
        </div>
      </nav>

      <section className="stage">
        <div className="ambient orb-one" />
        <div className="ambient orb-two" />
        <div className="grid-lines" />
        {celebrating && <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }).map((_, i) => <i key={i} />)}</div>}

        <div className="eyebrow"><span>01</span> DEMO COMPLETED</div>
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="moment-label">THE FLOOR IS YOURS</p>
            <h1>{active.repName}</h1>
            <p className="account-line">{active.company} <span>•</span> {active.product}</p>
          </div>
          <div className="score-orbit">
            <div className="score-ring">
              <span>+</span>1
              <small>DEMO</small>
            </div>
          </div>
        </div>

        <div className="player-card">
          <div className="album" style={{ background: `linear-gradient(135deg, ${song.colors[0]}, ${song.colors[1]})` }}>
            <span className="album-mark">P</span>
            <i /><i /><i />
          </div>
          <button className="play-button" onClick={() => { setPlaying((value) => !value); if (!playing && soundOn) synthTone(active.songId, seconds || 15, audioRef); }} aria-label={playing ? "Pause highlight" : "Play highlight"}>
            {playing ? "Ⅱ" : "▶"}
          </button>
          <div className="track-meta">
            <div className="track-title-row">
              <div><strong>{song.title}</strong><span>{song.vibe} · approved highlight</span></div>
              <span className="approved">✓ PRE-APPROVED</span>
            </div>
            <div className="waveform" aria-label={`${seconds} seconds remaining`}>
              {Array.from({ length: 52 }).map((_, i) => <i key={i} className={i / 52 * 100 <= progress ? "passed" : ""} style={{ height: `${20 + ((i * 17) % 64)}%` }} />)}
            </div>
            <div className="time-row"><span>0:{String(15 - seconds).padStart(2, "0")}</span><span>0:15</span></div>
          </div>
        </div>
      </section>

      <section className="control-strip">
        <div className="song-picker">
          <span className="strip-label">PORTER&apos;S DROP</span>
          <div className="select-wrap">
            <select value={selectedSong} onChange={(event) => setSelectedSong(event.target.value)} aria-label="Choose your pre-approved song">
              {songs.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.vibe}</option>)}
            </select>
          </div>
          <button className="test-button" onClick={testDrop}>TEST MY DROP <span>↗</span></button>
        </div>
        <div className="recent-wins">
          <span className="strip-label">RECENT WINS</span>
          <div className="win-list">
            {wins.slice(0, 3).map((win) => (
              <button key={win.id} onClick={() => launch(win)} className="win-item">
                <span className="avatar">{win.repName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
                <span><strong>{win.repName.split(" ")[0]}</strong><small>{win.createdAt}</small></span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
