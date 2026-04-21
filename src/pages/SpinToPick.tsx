import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dices, Play, Check, Shuffle } from "lucide-react";
import { getGames, launchGame, Game } from "../api/client";
import toast from "react-hot-toast";

// Reel geometry constants
const CARD_W = 110;
const CARD_H = 154; // CARD_W * 1.4
const GAP = 10;
const STEP = CARD_W + GAP; // 120
const VISIBLE = 7; // odd number keeps center card symmetric
const CONTAINER_W = VISIBLE * STEP - GAP; // 830
const WINNER_IDX = 33; // position in reel where winner lands
const REEL_LEN = 45; // total cards in reel
const SPIN_MS = 10000;

// ── Audio helpers (Web Audio API) ────────────────────────────────────────────

function getAudioCtx(ref: { current: AudioContext | null }) {
  if (!ref.current) ref.current = new AudioContext();
  return ref.current;
}

/** Short mechanical click — noise burst shaped by a fast exponential decay */
function playTick(ctx: AudioContext, volume = 0.45) {
  const len = Math.floor(ctx.sampleRate * 0.022);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1400;
  filter.Q.value = 1.2;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

/** Three ascending tones — mimics the CS2 case-opening landing chime */
function playWinChime(ctx: AudioContext) {
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.13;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function buildReel(pool: Game[], winner: Game): Game[] {
  const reel: Game[] = [];
  for (let i = 0; i < REEL_LEN; i++) {
    if (i === WINNER_IDX) {
      reel.push(winner);
      continue;
    }
    const prev = reel[i - 1];
    // Exclude the previous card's game to avoid consecutive repeats
    const candidates = pool.length > 1 && prev
      ? pool.filter((g) => g.id !== prev.id)
      : pool;
    reel.push(candidates[Math.floor(Math.random() * candidates.length)]);
  }
  return reel;
}

export default function SpinToPick() {
  const { data: allGames = [], isLoading } = useQuery({
    queryKey: ["games", { status: "installed" }],
    queryFn: () => getGames({ status: "installed" }),
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const initialized = useRef(false);

  // Default: all installed games selected
  useEffect(() => {
    if (allGames.length > 0 && !initialized.current) {
      setSelectedIds(new Set(allGames.map((g) => g.id)));
      initialized.current = true;
    }
  }, [allGames]);

  const pool = allGames.filter((g) => selectedIds.has(g.id));

  const [reelItems, setReelItems] = useState<Game[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<Game | null>(null);
  const [hasSpun, setHasSpun] = useState(false);
  const reelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // Cancel RAF on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const handleSpin = useCallback(() => {
    if (isSpinning) return;
    if (pool.length === 0) {
      toast.error("Select at least one game to spin!");
      return;
    }

    const winner = pool[Math.floor(Math.random() * pool.length)];
    const reel = buildReel(pool, winner);

    setReelItems(reel);
    setResult(null);
    setHasSpun(true);
    setIsSpinning(true);

    // Snap to start without transition
    const el = reelRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = "translateX(0px)";
    }

    // Winner card center aligns with container center
    // tx = containerCenter - winnerCardCenter (negative = scroll left)
    const tx = CONTAINER_W / 2 - (WINNER_IDX * STEP + CARD_W / 2);

    const ctx = getAudioCtx(audioCtxRef);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (el) {
          el.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.82, 0.12, 1.0)`;
          el.style.transform = `translateX(${tx}px)`;
        }

        // RAF loop: play a tick each time the reel crosses a card boundary
        let lastCardIdx = -1;
        const tick = () => {
          if (!reelRef.current) return;
          const matrix = new DOMMatrix(getComputedStyle(reelRef.current).transform);
          const cardIdx = Math.floor(-matrix.m41 / STEP);
          if (cardIdx !== lastCardIdx && cardIdx >= 0) {
            lastCardIdx = cardIdx;
            playTick(ctx);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);
      });
    });

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      playWinChime(getAudioCtx(audioCtxRef));
      setIsSpinning(false);
      setResult(winner);
    }, SPIN_MS + 200);
  }, [pool, isSpinning]);

  const handleLaunch = async () => {
    if (!result) return;
    try {
      await launchGame(result);
      toast.success(`Launching ${result.name}…`);
    } catch {
      toast.error("Failed to launch game");
    }
  };

  const toggleGame = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "#050505" }}>
      <div className="fixed inset-0 z-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(80,40,140,0.15) 0%, transparent 60%), #050505" }} />
      <style>{`
        @keyframes result-in {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 16px var(--gt-accent)55, 0 0 40px var(--gt-accent)18; }
          50%       { box-shadow: 0 0 24px var(--gt-accent)88, 0 0 60px var(--gt-accent)30; }
        }
      `}</style>

      {/* Page header */}
      <div className="relative z-10 px-6 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(203,166,247,0.12)" }}>
            <Dices size={20} className="text-[var(--gt-accent)]" />
          </div>
          <div>
            <p className="text-xs text-white/35 uppercase tracking-[0.15em]">Random</p>
            <h1 className="text-2xl font-bold text-white">Spin to Pick</h1>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center gap-6 px-6 pb-6 pt-4">

        {/* ── Reel section ── */}
        <div className="flex flex-col items-center gap-4 w-full">

          {/* Reel window */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              width: CONTAINER_W,
              height: CARD_H + 24,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Left fade */}
            <div className="absolute inset-y-0 left-0 w-32 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to right, rgba(5,5,5,0.9) 20%, transparent 100%)" }} />
            {/* Right fade */}
            <div className="absolute inset-y-0 right-0 w-32 z-10 pointer-events-none"
              style={{ background: "linear-gradient(to left, rgba(5,5,5,0.9) 20%, transparent 100%)" }} />

            {/* Center selector border */}
            <div
              className="absolute inset-y-3 z-10 pointer-events-none rounded-xl"
              style={{
                left: `calc(50% - ${CARD_W / 2 + 3}px)`,
                width: CARD_W + 6,
                border: "2px solid var(--gt-accent)",
                animation: "glow-pulse 2.5s ease-in-out infinite",
              }}
            />
            {/* Top indicator arrow */}
            <div className="absolute top-0 z-20 pointer-events-none"
              style={{ left: "50%", transform: "translateX(-50%)" }}>
              <div style={{
                width: 0, height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderTop: "10px solid var(--gt-accent)",
              }} />
            </div>
            {/* Bottom indicator arrow */}
            <div className="absolute bottom-0 z-20 pointer-events-none"
              style={{ left: "50%", transform: "translateX(-50%)" }}>
              <div style={{
                width: 0, height: 0,
                borderLeft: "7px solid transparent",
                borderRight: "7px solid transparent",
                borderBottom: "10px solid var(--gt-accent)",
              }} />
            </div>

            {/* Scrolling reel */}
            <div className="absolute inset-0 flex items-center">
              <div
                ref={reelRef}
                className="flex items-center will-change-transform"
                style={{ gap: GAP }}
              >
                {reelItems.length > 0
                  ? reelItems.map((game, i) => (
                      <div
                        key={i}
                        className="flex-shrink-0 rounded-xl overflow-hidden"
                        style={{ width: CARD_W, height: CARD_H }}
                      >
                        {game.coverUrl ? (
                          <img
                            src={game.coverUrl}
                            alt={game.name}
                            className="w-full h-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center p-2"
                            style={{ background: "var(--gt-overlay)" }}
                          >
                            <span className="text-center font-medium leading-tight"
                              style={{ color: "var(--gt-sub)", fontSize: 10 }}>
                              {game.name}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  : Array.from({ length: VISIBLE }).map((_, i) => (
                      <div
                        key={i}
                        className="flex-shrink-0 rounded-xl"
                        style={{ width: CARD_W, height: CARD_H, background: "var(--gt-overlay)", opacity: 0.3 }}
                      />
                    ))
                }
              </div>
            </div>

            {/* Idle hint */}
            {!hasSpun && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <p className="text-sm text-white/35">Press Spin to start</p>
              </div>
            )}
          </div>

          {/* Spin button */}
          <button
            onClick={handleSpin}
            disabled={isSpinning}
            className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: isSpinning
                ? "var(--gt-overlay)"
                : "linear-gradient(135deg, var(--gt-accent), var(--gt-accent-dim))",
              color: isSpinning ? "var(--gt-sub)" : "var(--gt-base)",
              boxShadow: isSpinning ? "none" : "0 4px 24px var(--gt-accent)55",
            }}
          >
            <Shuffle size={16} className={isSpinning ? "animate-spin" : ""} />
            {isSpinning ? "Spinning…" : "Spin"}
          </button>

          {/* Result card */}
          {result && !isSpinning && (
            <div
              className="flex items-center gap-4 p-4 rounded-2xl w-full max-w-md"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(203,166,247,0.35)",
                boxShadow: "0 0 40px rgba(203,166,247,0.1)",
                animation: "result-in 0.45s cubic-bezier(0.2, 0.8, 0.3, 1) both",
              }}
            >
              {/* Cover thumbnail */}
              <div className="flex-shrink-0 w-14 h-20 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(203,166,247,0.3)" }}>
                {result.coverUrl ? (
                  <img src={result.coverUrl} alt={result.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-1" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <span className="text-center text-white/50" style={{ fontSize: 9 }}>{result.name}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[var(--gt-accent)] font-semibold uppercase tracking-widest mb-0.5" style={{ fontSize: 9 }}>Today's Pick</p>
                <p className="text-base font-bold truncate text-white">{result.name}</p>
                <p className="text-xs mt-0.5 text-white/40">Ready to play</p>
              </div>

              <button
                onClick={handleLaunch}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "var(--gt-green)22",
                  color: "var(--gt-green)",
                  border: "1px solid var(--gt-green)44",
                }}
              >
                <Play size={13} fill="currentColor" />
                Launch
              </button>
            </div>
          )}
        </div>

        {/* ── Game pool selector ── */}
        <div className="w-full flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold">Game Pool</h2>
              <p className="text-xs text-white/30 mt-0.5">{pool.length} / {allGames.length} selected</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedIds(new Set(allGames.map((g) => g.id)))}
                className="text-xs text-white/40 hover:text-white/80 transition-colors cursor-pointer"
              >
                Select all
              </button>
              <span className="text-white/15">·</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-white/40 hover:text-red-400 transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-white/30">Loading games…</p>
          ) : allGames.length === 0 ? (
            <p className="text-sm text-white/30">No installed games found in your library.</p>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}
            >
              {allGames.map((game) => {
                const included = selectedIds.has(game.id);
                return (
                  <button
                    key={game.id}
                    onClick={() => toggleGame(game.id)}
                    title={game.name}
                    className="relative group rounded-lg overflow-hidden focus:outline-none transition-transform hover:scale-105 active:scale-95"
                    style={{ aspectRatio: "3/4" }}
                  >
                    {game.coverUrl ? (
                      <img
                        src={game.coverUrl}
                        alt={game.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center p-1"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        <span className="text-center leading-tight text-white/50" style={{ fontSize: 9 }}>
                          {game.name}
                        </span>
                      </div>
                    )}

                    {/* Dim overlay when excluded */}
                    <div
                      className="absolute inset-0 transition-opacity duration-150"
                      style={{ background: "rgba(0,0,0,0.65)", opacity: included ? 0 : 1 }}
                    />

                    {/* Check badge */}
                    {included && (
                      <div
                        className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: "var(--gt-accent)" }}
                      >
                        <Check size={9} strokeWidth={3} style={{ color: "var(--gt-base)" }} />
                      </div>
                    )}

                    {/* Name tooltip on hover */}
                    <div
                      className="absolute bottom-0 inset-x-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
                    >
                      <span className="text-white font-medium line-clamp-2 leading-tight block"
                        style={{ fontSize: 8 }}>
                        {game.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
