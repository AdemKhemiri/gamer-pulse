import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Play, Star, ImageIcon, X, FolderOpen,
  ChevronLeft, ChevronRight, SlidersHorizontal, Info,
} from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { getGames, addManualGame, launchGame, GameFilter, Game } from "../api/client";
import { useUiStore } from "../store/uiStore";
import { formatHours, formatRelative, sourceLabel, sourceColor } from "../utils/format";
import { gradientFromName } from "../utils/gameColor";
import CoverPickerModal from "../components/games/CoverPickerModal";
import toast from "react-hot-toast";

const CARD_W = 110;
const CARD_H = 154; // 2:3

function canLaunch(game: Game): boolean {
  return !!(game.exePath || (game.source === "steam" && game.sourceId) || (game.source === "epic" && game.sourceId));
}

export default function Library() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const selectedIndex = useUiStore((s) => s.selectedLibraryIndex);
  const setSelectedIndex = useUiStore((s) => s.setSelectedLibraryIndex);
  const [filter, setFilter] = useState<GameFilter>({ status: "installed", sortBy: "name" });
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [coverPickGame, setCoverPickGame] = useState<Game | null>(null);
  const [newGame, setNewGame] = useState({ name: "", exePath: "" });
  const [launching, setLaunching] = useState(false);
  const [heroBgFailed, setHeroBgFailed] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: games = [], isLoading } = useQuery({
    queryKey: ["games", filter],
    queryFn: () => getGames(filter),
  });

  const addMutation = useMutation({
    mutationFn: () => addManualGame({ name: newGame.name, exePath: newGame.exePath || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setShowAddModal(false);
      setNewGame({ name: "", exePath: "" });
      toast.success("Game added");
    },
    onError: () => toast.error("Failed to add game"),
  });

  const selectedGame = games[selectedIndex] ?? null;

  // Clamp selectedIndex when games list changes
  useEffect(() => {
    if (games.length > 0 && selectedIndex >= games.length) {
      setSelectedIndex(games.length - 1);
    }
  }, [games.length]);

  // Reset hero bg failed state when selected game changes
  useEffect(() => {
    setHeroBgFailed(false);
  }, [selectedGame?.id]);

  // Scroll carousel so selected card is visible (left-biased like PS5)
  useEffect(() => {
    const el = carouselRef.current;
    const container = containerRef.current;
    if (!el || !container) return;
    const cardStep = CARD_W + 10;
    const targetScroll = selectedIndex * cardStep - 80;
    el.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (showAddModal || showSearch || showFilters) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedIndex(Math.min(games.length - 1, selectedIndex + 1));
      } else if (e.key === "Enter" && selectedGame) {
        e.preventDefault();
        navigate(`/library/${selectedGame.id}`);
      } else if (e.key === " " && selectedGame) {
        e.preventDefault();
        handleLaunchSelected();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [games.length, selectedIndex, selectedGame, showAddModal, showSearch, showFilters]);

  // Ctrl+F search shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setShowSearch(false);
        setFilter((f) => ({ ...f, search: undefined }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleLaunchSelected() {
    if (!selectedGame || !canLaunch(selectedGame)) return;
    setLaunching(true);
    try {
      await launchGame(selectedGame);
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Failed to launch game");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden" ref={containerRef} style={{ background: "#050505" }}>

      {/* ── Full-page background ── */}
      {selectedGame && (() => {
        // Priority: user-set bgUrl > Steam hero CDN > blurred cover > gradient
        const steamHeroUrl = !heroBgFailed && selectedGame.source === "steam" && selectedGame.sourceId
          ? `https://steamcdn-a.akamaihd.net/steam/apps/${selectedGame.sourceId}/library_hero.jpg`
          : null;
        const wideUrl = selectedGame.bgUrl || steamHeroUrl;

        return (
          <div className="absolute inset-0 z-0">
            {wideUrl ? (
              /* ── Wide hero/background art ── */
              <>
                <img
                  key={`hero-${selectedGame.id}-${wideUrl}`}
                  src={wideUrl}
                  alt=""
                  className="w-full h-full object-cover object-top"
                  style={{ filter: "brightness(0.45) saturate(1.3)" }}
                  onError={() => { if (!selectedGame.bgUrl) setHeroBgFailed(true); }}
                />
                <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(5,5,5,0.88) 0%, rgba(5,5,5,0.45) 45%, rgba(5,5,5,0.15) 100%)" }} />
                <div className="absolute inset-x-0 bottom-0" style={{ height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)" }} />
              </>
            ) : selectedGame.coverUrl ? (
              /* ── Blurred cover fallback ── */
              <>
                <div
                  key={`blur-${selectedGame.id}`}
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${selectedGame.coverUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center top",
                    filter: "blur(55px) saturate(1.8) brightness(0.22)",
                    transform: "scale(1.12)",
                  }}
                />
                <div className="absolute inset-0" style={{ background: "rgba(5,5,5,0.25)" }} />
                <div className="absolute inset-x-0 bottom-0" style={{ height: "60%", background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)" }} />
                <div className="absolute inset-y-0 left-0" style={{ width: "45%", background: "linear-gradient(to right, rgba(5,5,5,0.7), transparent)" }} />
              </>
            ) : (
              /* ── Gradient fallback ── */
              <div className="absolute inset-0" style={{ background: gradientFromName(selectedGame.name), opacity: 0.12 }} />
            )}
          </div>
        );
      })()}

      {/* ── Content layer ── */}
      <div className="relative z-10 flex flex-col h-full">

        {/* ── TOP: carousel strip ── */}
        <div className="flex-shrink-0 pt-4">

          {/* Controls row */}
          <div className="flex items-center gap-2 px-5 pb-3">
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-[0.18em]">Library</span>
            {games.length > 0 && <span className="text-[11px] text-white/25">· {games.length}</span>}

            <div className="flex-1" />

            {showSearch && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full animate-ps5-left"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                <Search size={12} className="text-white/50 flex-shrink-0" />
                <input
                  ref={searchRef}
                  autoFocus
                  type="text"
                  value={filter.search ?? ""}
                  onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value || undefined }))}
                  placeholder="Search…"
                  className="bg-transparent text-white text-xs placeholder-white/30 outline-none w-32"
                />
                <button onClick={() => { setShowSearch(false); setFilter((f) => ({ ...f, search: undefined })); }} className="text-white/40 hover:text-white cursor-pointer">
                  <X size={12} />
                </button>
              </div>
            )}

            {showFilters && (
              <div className="flex items-center gap-2 animate-ps5-left">
                <select
                  value={filter.source ?? ""}
                  onChange={(e) => setFilter((f) => ({ ...f, source: e.target.value || undefined }))}
                  className="text-xs rounded-full px-3 py-1 text-white outline-none cursor-pointer appearance-none"
                  style={{ background: "rgba(30,30,38,0.95)", border: "1px solid rgba(255,255,255,0.15)", colorScheme: "dark" }}
                >
                  <option value="">All Sources</option>
                  {["steam", "epic", "gog", "xbox", "riot", "manual"].map((s) => (
                    <option key={s} value={s}>{sourceLabel(s)}</option>
                  ))}
                </select>
                <select
                  value={filter.sortBy ?? "name"}
                  onChange={(e) => setFilter((f) => ({ ...f, sortBy: e.target.value as GameFilter["sortBy"] }))}
                  className="text-xs rounded-full px-3 py-1 text-white outline-none cursor-pointer appearance-none"
                  style={{ background: "rgba(30,30,38,0.95)", border: "1px solid rgba(255,255,255,0.15)", colorScheme: "dark" }}
                >
                  <option value="name">Name</option>
                  <option value="playtime">Playtime</option>
                  <option value="last_played">Last Played</option>
                  <option value="added">Date Added</option>
                </select>
                <button
                  onClick={() => setFilter((f) => ({ ...f, favoritesOnly: !f.favoritesOnly }))}
                  className={`p-1.5 rounded-full transition-colors cursor-pointer ${filter.favoritesOnly ? "text-yellow-300" : "text-white/40 hover:text-white/70"}`}
                >
                  <Star size={13} fill={filter.favoritesOnly ? "currentColor" : "none"} />
                </button>
              </div>
            )}

            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${showFilters ? "text-white bg-white/15" : "text-white/45 hover:text-white hover:bg-white/10"}`}
            >
              <SlidersHorizontal size={14} />
            </button>
            <button
              onClick={() => { setShowSearch((v) => !v); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 50); }}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${showSearch ? "text-white bg-white/15" : "text-white/45 hover:text-white hover:bg-white/10"}`}
            >
              <Search size={14} />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium text-white transition-colors cursor-pointer"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}
            >
              <Plus size={12} />
              Add
            </button>
          </div>

          {/* Carousel */}
          {isLoading ? (
            <div className="flex items-center px-5 h-[174px]">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            </div>
          ) : games.length === 0 ? (
            <div className="flex items-center gap-3 px-5 h-[174px] text-white/35">
              <span className="text-3xl">🎮</span>
              <p className="text-sm">No games found. Scan or add a game.</p>
            </div>
          ) : (
            <div className="relative flex items-center">
              {/* Left arrow */}
              <button
                onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                disabled={selectedIndex === 0}
                className="absolute left-1 z-20 w-8 h-8 flex items-center justify-center rounded-full transition-all cursor-pointer disabled:opacity-0"
                style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <ChevronLeft size={15} className="text-white" />
              </button>

              {/* Cards track */}
              <div
                ref={carouselRef}
                className="flex gap-2.5 overflow-x-hidden px-10 py-4"
                style={{ scrollBehavior: "smooth" }}
              >
                {games.map((game, i) => (
                  <CarouselCard
                    key={game.id}
                    game={game}
                    isSelected={i === selectedIndex}
                    onClick={() => {
                      if (i === selectedIndex) navigate(`/library/${game.id}`);
                      else setSelectedIndex(i);
                    }}
                    onCoverPick={(e) => { e.stopPropagation(); setCoverPickGame(game); }}
                  />
                ))}
              </div>

              {/* Right arrow */}
              <button
                onClick={() => setSelectedIndex(Math.min(games.length - 1, selectedIndex + 1))}
                disabled={selectedIndex === games.length - 1}
                className="absolute right-1 z-20 w-8 h-8 flex items-center justify-center rounded-full transition-all cursor-pointer disabled:opacity-0"
                style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <ChevronRight size={15} className="text-white" />
              </button>
            </div>
          )}
        </div>

        {/* ── Middle spacer (shows background art) ── */}
        <div className="flex-1" />

        {/* ── Bottom game info panel ── */}
        {selectedGame && (
          <div className="flex-shrink-0 px-8 pb-7 animate-ps5-up">
            <div className="flex items-end justify-between gap-8">

              {/* Left: name + info + actions */}
              <div className="flex-1 min-w-0" style={{ maxWidth: "52%" }}>
                {/* Source badge */}
                <div className="mb-2">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded"
                    style={{ background: sourceColor(selectedGame.source) + "cc", color: "#fff" }}
                  >
                    {sourceLabel(selectedGame.source)}
                  </span>
                  {selectedGame.isFavorite && (
                    <Star size={12} className="inline-block ml-2 text-yellow-400 fill-yellow-400 align-middle" />
                  )}
                </div>

                {/* Game name */}
                <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight mb-3 line-clamp-2">
                  {selectedGame.name}
                </h2>

                {/* Stats row */}
                <div className="flex items-center gap-6 mb-5">
                  <InfoChip label="Playtime" value={selectedGame.totalPlaySecs ? formatHours(selectedGame.totalPlaySecs) : "—"} />
                  <InfoChip label="Last Played" value={selectedGame.lastPlayedAt ? formatRelative(selectedGame.lastPlayedAt) : "Never"} />
                  <InfoChip label="Sessions" value={String(selectedGame.sessionCount ?? 0)} />
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  {canLaunch(selectedGame) && (
                    <button
                      onClick={handleLaunchSelected}
                      disabled={launching}
                      className="flex items-center gap-2 px-7 py-2.5 rounded-full text-sm font-bold text-black transition-all cursor-pointer disabled:opacity-60 hover:scale-[1.03] active:scale-[0.97]"
                      style={{ background: launching ? "rgba(255,255,255,0.75)" : "#ffffff", minWidth: 110 }}
                    >
                      <Play size={13} className="fill-black" />
                      {launching ? "Launching…" : "Play"}
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/library/${selectedGame.id}`)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white transition-all cursor-pointer hover:bg-white/15"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)" }}
                  >
                    <Info size={13} />
                    Details
                  </button>
                </div>

                {/* Keyboard hints */}
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>←→</span>
                    <span>Navigate</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>Enter</span>
                    <span>Details</span>
                  </div>
                  {canLaunch(selectedGame) && (
                    <div className="flex items-center gap-1.5 text-white/20 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>Space</span>
                      <span>Play</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: empty — art fills this space */}
              <div className="flex-shrink-0 w-8" />
            </div>
          </div>
        )}
      </div>

      {/* ── Cover picker modal ── */}
      {coverPickGame && (
        <CoverPickerModal game={coverPickGame} onClose={() => setCoverPickGame(null)} />
      )}

      {/* ── Add game modal ── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div
            className="w-96 rounded-2xl p-6"
            style={{ background: "rgba(15,15,20,0.97)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <h2 className="text-lg font-semibold text-white mb-4">Add Game Manually</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Game Name *</label>
                <input
                  autoFocus
                  type="text"
                  value={newGame.name}
                  onChange={(e) => setNewGame((g) => ({ ...g, name: e.target.value }))}
                  placeholder="e.g. Elden Ring"
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Executable Path (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGame.exePath}
                    onChange={(e) => setNewGame((g) => ({ ...g, exePath: e.target.value }))}
                    placeholder="C:\Games\game.exe"
                    className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const sel = await openFileDialog({
                        title: "Select Game Executable",
                        filters: [{ name: "Executable", extensions: ["exe"] }],
                        multiple: false,
                      });
                      if (sel) {
                        const path = typeof sel === "string" ? sel : (sel as { path: string }).path;
                        setNewGame((g) => ({
                          ...g,
                          exePath: path,
                          name: g.name || (path.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? ""),
                        }));
                      }
                    }}
                    className="flex-shrink-0 px-3 py-2.5 rounded-xl text-white/50 hover:text-white transition-colors cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/12 text-sm text-white/60 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => addMutation.mutate()}
                disabled={!newGame.name || addMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {addMutation.isPending ? "Adding…" : "Add Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Carousel card ──────────────────────────────────────────────────────────────

interface CardProps {
  game: Game;
  isSelected: boolean;
  onClick: () => void;
  onCoverPick: (e: React.MouseEvent) => void;
}

function CarouselCard({ game, isSelected, onClick, onCoverPick }: CardProps) {
  const currentlyPlayingId = useUiStore((s) => s.currentlyPlayingGameId);
  const isPlaying = currentlyPlayingId === game.id;
  const hasCover = !!game.coverUrl;

  return (
    <div
      onClick={onClick}
      className="flex-shrink-0 relative cursor-pointer group"
      style={{ width: CARD_W, height: CARD_H }}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Card body */}
      <div
        className="w-full h-full rounded-xl overflow-hidden transition-all duration-200"
        style={isSelected ? {
          transform: "scale(1.07) translateY(-4px)",
          boxShadow: "0 0 0 2.5px rgba(255,255,255,0.95), 0 0 28px rgba(255,255,255,0.18), 0 16px 40px rgba(0,0,0,0.8)",
        } : {
          transform: "scale(1)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.7)",
          opacity: 0.55,
        }}
      >
        {hasCover ? (
          <img
            src={game.coverUrl!}
            alt={game.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-1.5"
            style={{ background: gradientFromName(game.name) }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
            >
              {game.name.charAt(0).toUpperCase()}
            </div>
            <p className="text-white/60 text-[9px] text-center px-2 leading-tight font-medium line-clamp-2">
              {game.name}
            </p>
          </div>
        )}

        {/* Now playing badge */}
        {isPlaying && (
          <div
            className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.5)" }}
          >
            <Play size={6} className="fill-green-400 text-green-400" />
            <span className="text-[7px] text-green-400 font-bold">PLAYING</span>
          </div>
        )}

        {/* Source badge */}
        <div
          className="absolute top-1.5 right-1.5 text-[7px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: sourceColor(game.source) + "dd", color: "#fff" }}
        >
          {sourceLabel(game.source)}
        </div>

        {/* Favorite star */}
        {game.isFavorite && (
          <Star size={10} className="absolute bottom-1.5 right-1.5 text-yellow-400 fill-yellow-400" />
        )}

        {/* Cover picker overlay */}
        <div className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
          <button
            onClick={onCoverPick}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-medium text-white cursor-pointer"
            style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            <ImageIcon size={9} />
            {hasCover ? "Change" : "Set Cover"}
          </button>
        </div>
      </div>

      {/* Name tag below selected card */}
      {isSelected && (
        <p className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-white/60 font-medium truncate px-1">
          {game.name}
        </p>
      )}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-white/35 uppercase tracking-wider mb-0.5">{label}</span>
      <span className="text-sm text-white font-semibold leading-tight">{value}</span>
    </div>
  );
}
