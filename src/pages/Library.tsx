import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Play, Star, ImageIcon, X, FolderOpen,
  ChevronLeft, ChevronRight, SlidersHorizontal, Info,
  EyeOff, Trash2, RotateCcw, ExternalLink, FolderPlus,
} from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { getGames, addManualGame, launchGame, updateGame, setFavorite, deleteGame, GameFilter, Game, getCollections, addGameToCollection, removeGameFromCollection, getGameCollections, Collection } from "../api/client";
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
  const [filterKey, setFilterKey] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [coverPickGame, setCoverPickGame] = useState<Game | null>(null);
  const [newGame, setNewGame] = useState({ name: "", exePath: "" });
  const [launching, setLaunching] = useState(false);
  const [heroBgFailed, setHeroBgFailed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ game: Game; x: number; y: number } | null>(null);
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

  const favMutation = useMutation({
    mutationFn: ({ id, fav }: { id: string; fav: boolean }) => setFavorite(id, fav),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["games"] }),
    onError: () => toast.error("Failed to update favorite"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateGame(id, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["games"] }); setFilterKey((k) => k + 1); },
    onError: () => toast.error("Failed to update game"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteGame(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["games"] }); setFilterKey((k) => k + 1); },
    onError: () => toast.error("Failed to remove game"),
  });

  const { data: collections = [] } = useQuery({
    queryKey: ["collections"],
    queryFn: getCollections,
  });

  const addToCollectionMutation = useMutation({
    mutationFn: ({ collectionId, gameId }: { collectionId: string; gameId: string }) =>
      addGameToCollection(collectionId, gameId),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ["collection-games", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["game-collections"] });
      const col = collections.find((c) => c.id === collectionId);
      toast.success(`Added to ${col?.name ?? "collection"}`);
    },
    onError: () => toast.error("Failed to add to collection"),
  });

  const removeFromCollectionMutation = useMutation({
    mutationFn: ({ collectionId, gameId }: { collectionId: string; gameId: string }) =>
      removeGameFromCollection(collectionId, gameId),
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ["collection-games", collectionId] });
      queryClient.invalidateQueries({ queryKey: ["game-collections"] });
      const col = collections.find((c) => c.id === collectionId);
      toast.success(`Removed from ${col?.name ?? "collection"}`);
    },
    onError: () => toast.error("Failed to remove from collection"),
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

  // Dismiss context menu on click-outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    function dismiss(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setContextMenu(null);
    }
    window.addEventListener("mousedown", dismiss);
    window.addEventListener("keydown", dismiss);
    return () => { window.removeEventListener("mousedown", dismiss); window.removeEventListener("keydown", dismiss); };
  }, [contextMenu]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (showAddModal || showSearch || showFilters || contextMenu) return;
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
          <div className="relative z-50 flex items-center gap-2 px-5 pb-3">
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
                <FilterSelect
                  value={filter.status ?? "installed"}
                  onChange={(v) => { setFilter((f) => ({ ...f, status: v as GameFilter["status"] })); setFilterKey((k) => k + 1); }}
                  options={[
                    { value: "installed", label: "Installed" },
                    { value: "hidden", label: "Hidden" },
                    { value: "deleted", label: "Deleted" },
                    { value: "all", label: "All" },
                  ]}
                />
                <FilterSelect
                  value={filter.source ?? ""}
                  onChange={(v) => { setFilter((f) => ({ ...f, source: v || undefined })); setFilterKey((k) => k + 1); }}
                  options={[
                    { value: "", label: "All Sources" },
                    ...["steam", "epic", "gog", "xbox", "riot", "manual"].map((s) => ({ value: s, label: sourceLabel(s) })),
                  ]}
                />
                <FilterSelect
                  value={filter.collectionId ?? ""}
                  onChange={(v) => { setFilter((f) => ({ ...f, collectionId: v || undefined })); setFilterKey((k) => k + 1); }}
                  options={[
                    { value: "", label: "All Collections" },
                    ...collections.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
                <FilterSelect
                  value={filter.sortBy ?? "name"}
                  onChange={(v) => { setFilter((f) => ({ ...f, sortBy: v as GameFilter["sortBy"] })); setFilterKey((k) => k + 1); }}
                  options={[
                    { value: "name", label: "Name" },
                    { value: "playtime", label: "Playtime" },
                    { value: "last_played", label: "Last Played" },
                    { value: "added", label: "Date Added" },
                  ]}
                />
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
                key={filterKey}
                ref={carouselRef}
                className="flex gap-2.5 overflow-hidden px-10 pt-4 pb-6 animate-ps5-fade"
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
                    onContextMenu={(e) => { e.preventDefault(); setSelectedIndex(i); setContextMenu({ game, x: e.clientX, y: e.clientY }); }}
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

      {contextMenu && (
        <GameContextMenu
          game={contextMenu.game}
          x={contextMenu.x}
          y={contextMenu.y}
          collections={collections}
          onClose={() => setContextMenu(null)}
          onPlay={() => { setContextMenu(null); handleLaunchSelected(); }}
          onDetails={() => { setContextMenu(null); navigate(`/library/${contextMenu.game.id}`); }}
          onCoverPick={() => { setContextMenu(null); setCoverPickGame(contextMenu.game); }}
          onToggleFavorite={() => { favMutation.mutate({ id: contextMenu.game.id, fav: !contextMenu.game.isFavorite }); setContextMenu(null); }}
          onHide={() => { statusMutation.mutate({ id: contextMenu.game.id, status: "hidden" }); setContextMenu(null); toast.success("Game hidden"); }}
          onRestore={() => { statusMutation.mutate({ id: contextMenu.game.id, status: "installed" }); setContextMenu(null); toast.success("Game restored"); }}
          onRemove={() => { removeMutation.mutate(contextMenu.game.id); setContextMenu(null); toast.success("Game removed"); }}
          onAddToCollection={(collectionId) => { addToCollectionMutation.mutate({ collectionId, gameId: contextMenu.game.id }); setContextMenu(null); }}
          onRemoveFromCollection={(collectionId) => { removeFromCollectionMutation.mutate({ collectionId, gameId: contextMenu.game.id }); setContextMenu(null); }}
        />
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
  onContextMenu: (e: React.MouseEvent) => void;
}

function CarouselCard({ game, isSelected, onClick, onCoverPick, onContextMenu }: CardProps) {
  const currentlyPlayingId = useUiStore((s) => s.currentlyPlayingGameId);
  const isPlaying = currentlyPlayingId === game.id;
  const hasCover = !!game.coverUrl;

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
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

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onBlur={() => setOpen(false)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-white/75 hover:text-white transition-colors cursor-pointer"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        {selected.label}
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 right-0 z-[200] rounded-xl py-1 min-w-[110px]"
          style={{ background: "rgb(18,18,24)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onMouseDown={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${opt.value === value ? "text-white font-medium" : "text-white/50 hover:text-white"}`}
              style={opt.value === value ? { background: "rgba(255,255,255,0.08)" } : {}}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GameContextMenu({
  game, x, y, onClose: _onClose, collections,
  onPlay, onDetails, onCoverPick,
  onToggleFavorite, onHide, onRestore, onRemove, onAddToCollection, onRemoveFromCollection,
}: {
  game: Game; x: number; y: number; onClose: () => void;
  collections: Collection[];
  onPlay: () => void; onDetails: () => void; onCoverPick: () => void;
  onToggleFavorite: () => void; onHide: () => void; onRestore: () => void; onRemove: () => void;
  onAddToCollection: (collectionId: string) => void;
  onRemoveFromCollection: (collectionId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCollections, setShowCollections] = useState(false);

  const { data: gameCollections = [] } = useQuery({
    queryKey: ["game-collections", game.id],
    queryFn: () => getGameCollections(game.id),
    enabled: showCollections,
  });

  function openCollections() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setShowCollections(true);
  }
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setShowCollections(false), 120);
  }

  // Flip so menu stays inside viewport
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: x + width > window.innerWidth ? x - width : x,
      top: y + height > window.innerHeight ? y - height : y,
    });
  }, [x, y]);

  const isInstalled = game.status === "installed";
  const isHidden = game.status === "hidden";
  const gameCollectionIds = new Set(gameCollections.map((c) => c.id));

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[500] rounded-xl py-1 min-w-[170px] animate-ps5-fade"
      style={{ left: pos.left, top: pos.top, background: "rgb(16,16,22)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 16px 48px rgba(0,0,0,0.85)" }}
    >
      <p className="px-3 pt-1.5 pb-2 text-[10px] font-semibold text-white/30 uppercase tracking-widest truncate">{game.name}</p>
      <div className="border-t border-white/8 mb-1" />

      {canLaunch(game) && (
        <CtxItem icon={<Play size={13} className="fill-white" />} label="Play" onClick={onPlay} highlight />
      )}
      <CtxItem icon={<ExternalLink size={13} />} label="View Details" onClick={onDetails} />
      <CtxItem icon={<ImageIcon size={13} />} label="Change Cover" onClick={onCoverPick} />

      <div className="border-t border-white/8 my-1" />

      <CtxItem
        icon={<Star size={13} className={game.isFavorite ? "fill-yellow-400 text-yellow-400" : ""} />}
        label={game.isFavorite ? "Unfavorite" : "Favorite"}
        onClick={onToggleFavorite}
      />

      {/* Collections flyout — hover to open, delayed close bridges the gap */}
      <div className="relative" onMouseEnter={openCollections} onMouseLeave={scheduleClose}>
        <button
          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors cursor-pointer text-left
            ${showCollections ? "text-white bg-white/8" : "text-white/65 hover:text-white hover:bg-white/6"}`}
        >
          <FolderPlus size={13} />
          <span className="flex-1">Collections</span>
          <ChevronRight size={11} className="text-white/30" />
        </button>

        {showCollections && (
          <div
            onMouseEnter={openCollections}
            onMouseLeave={scheduleClose}
            className="absolute left-full top-0 rounded-xl py-1 min-w-[170px] z-[600]"
            style={{ background: "rgb(16,16,22)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 16px 48px rgba(0,0,0,0.85)" }}
          >
            {collections.length === 0 ? (
              <p className="px-3 py-2 text-xs text-white/30 italic">No collections yet</p>
            ) : (
              <>
                {gameCollections.length > 0 && (
                  <button
                    onClick={() => { gameCollections.forEach((c) => onRemoveFromCollection(c.id)); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-white/40 hover:text-white/70 hover:bg-white/6 transition-colors cursor-pointer text-left"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0 border border-white/20" />
                    <span className="italic">None</span>
                  </button>
                )}
                {gameCollections.length > 0 && <div className="border-t border-white/8 my-1" />}
                {collections.map((col) => {
                  const inCol = gameCollectionIds.has(col.id);
                  return (
                    <button
                      key={col.id}
                      onClick={() => inCol ? onRemoveFromCollection(col.id) : onAddToCollection(col.id)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors cursor-pointer text-left hover:bg-white/6"
                      style={{ color: inCol ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)" }}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color, opacity: inCol ? 1 : 0.5 }} />
                      <span className="flex-1 truncate">{col.name}</span>
                      {inCol && <span className="text-white/30 text-[10px]">✓</span>}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {isInstalled && <CtxItem icon={<EyeOff size={13} />} label="Hide" onClick={onHide} />}
      {(isHidden || game.status === "deleted") && <CtxItem icon={<RotateCcw size={13} />} label="Restore" onClick={onRestore} />}

      <div className="border-t border-white/8 my-1" />

      <CtxItem icon={<Trash2 size={13} />} label="Remove" onClick={onRemove} danger />
    </div>
  );
}

function CtxItem({ icon, label, onClick, highlight, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; highlight?: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors cursor-pointer text-left
        ${danger ? "text-red-400 hover:bg-red-500/10" : highlight ? "text-white font-medium hover:bg-white/10" : "text-white/65 hover:text-white hover:bg-white/6"}`}
    >
      {icon}
      {label}
    </button>
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
