import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, GripVertical, Trash2, Play, LayoutGrid, List, Search, X, Plus, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getCollection,
  getCollectionGames,
  getGames,
  removeGameFromCollection,
  addGameToCollection,
  reorderCollectionGames,
  launchGame,
  Game,
} from "../api/client";
import { useUiStore } from "../store/uiStore";
import GameCard from "../components/games/GameCard";
import { formatHours, formatRelative, sourceLabel } from "../utils/format";
import { CollectionIcon } from "./Collections";

export default function CollectionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);

  const [showAddPanel, setShowAddPanel]         = useState(false);
  const [addSearch, setAddSearch]               = useState("");
  const [dragId, setDragId]                     = useState<string | null>(null);
  const [dragOverId, setDragOverId]             = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId]   = useState<string | null>(null);

  const { data: collection } = useQuery({
    queryKey: ["collection", id],
    queryFn: () => getCollection(id!),
    enabled: !!id,
  });

  const { data: games = [] } = useQuery({
    queryKey: ["collectionGames", id],
    queryFn: () => getCollectionGames(id!),
    enabled: !!id,
  });

  const { data: allGames = [] } = useQuery({
    queryKey: ["games", { status: "installed" }],
    queryFn: () => getGames({ status: "installed", sortBy: "name" }),
    enabled: showAddPanel,
  });

  const removeMutation = useMutation({
    mutationFn: (gameId: string) => removeGameFromCollection(id!, gameId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collectionGames", id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["gameCollections"] });
      setConfirmRemoveId(null);
    },
    onError: () => toast.error("Failed to remove game"),
  });

  const addMutation = useMutation({
    mutationFn: (gameId: string) => addGameToCollection(id!, gameId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collectionGames", id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["gameCollections"] });
    },
    onError: () => toast.error("Failed to add game"),
  });

  const reorderMutation = useMutation({
    mutationFn: (gameIds: string[]) => reorderCollectionGames(id!, gameIds),
    onSuccess: (updated) => {
      queryClient.setQueryData(["collectionGames", id], updated);
    },
  });

  // ── drag-and-drop ──────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, gameId: string) {
    e.dataTransfer.setData("text/plain", gameId);
    e.dataTransfer.effectAllowed = "move";
    setDragId(gameId);
  }

  function handleDragOver(e: React.DragEvent, gameId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (gameId !== dragId) setDragOverId(gameId);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || dragId;
    if (!sourceId || sourceId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = games.map((g) => g.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, sourceId);
    setDragId(null);
    setDragOverId(null);
    reorderMutation.mutate(reordered);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  const gameIdsInCollection = new Set(games.map((g) => g.id));
  const filteredForAdd = allGames.filter(
    (g) =>
      !gameIdsInCollection.has(g.id) &&
      (addSearch === "" || g.name.toLowerCase().includes(addSearch.toLowerCase())),
  );

  async function handleLaunch(e: React.MouseEvent, game: Game) {
    e.stopPropagation();
    try { await launchGame(game); }
    catch (err) { toast.error(typeof err === "string" ? err : "Failed to launch game"); }
  }

  function canLaunch(game: Game) {
    return !!(game.exePath || (game.source === "steam" && game.sourceId) || (game.source === "epic" && game.sourceId));
  }

  const totalPlaySecs = games.reduce((sum, g) => sum + (g.totalPlaySecs ?? 0), 0);

  if (!collection) {
    return (
      <div className="flex items-center justify-center h-full text-white/30 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Ambient background from collection color */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background:
            `radial-gradient(ellipse at 50% -10%, ${collection.color}28 0%, transparent 50%), ` +
            "radial-gradient(ellipse at 0% 100%, rgba(20,20,60,0.25) 0%, transparent 50%), " +
            "#050505",
        }}
      />

      {/* Header */}
      <div
        className="relative z-10 flex items-center gap-3 px-6 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <button
          onClick={() => navigate("/collections")}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/6 transition-colors cursor-pointer flex-shrink-0"
        >
          <ArrowLeft size={16} />
        </button>

        {/* Collection icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: collection.color + "25", border: `1px solid ${collection.color}40` }}
        >
          <CollectionIcon iconKey={collection.icon} size={18} style={{ color: collection.color } as React.CSSProperties} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white truncate">{collection.name}</h1>
          {collection.description && (
            <p className="text-xs text-white/35 truncate">{collection.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className="text-xs px-2.5 py-1 rounded-lg font-medium"
            style={{ background: collection.color + "20", color: collection.color }}
          >
            {games.length} {games.length === 1 ? "game" : "games"}
          </span>
          {totalPlaySecs > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-white/30">
              <Clock size={11} />
              {formatHours(totalPlaySecs)}
            </span>
          )}
        </div>

        {/* View toggle */}
        <div
          className="flex gap-0.5 rounded-xl p-1 flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={() => setViewMode("grid")}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: viewMode === "grid" ? "rgba(255,255,255,0.12)" : "transparent",
              color: viewMode === "grid" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.30)",
            }}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{
              background: viewMode === "list" ? "rgba(255,255,255,0.12)" : "transparent",
              color: viewMode === "list" ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.30)",
            }}
          >
            <List size={14} />
          </button>
        </div>

        <button
          onClick={() => setShowAddPanel((v) => !v)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm transition-colors flex-shrink-0 cursor-pointer"
          style={
            showAddPanel
              ? { background: `${collection.color}22`, border: `1px solid ${collection.color}40`, color: collection.color }
              : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.50)" }
          }
        >
          <Plus size={14} />
          Add games
        </button>
      </div>

      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Main game area */}
        <div className="flex-1 overflow-auto px-6 py-6">
          {/* Empty state */}
          {games.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-4 animate-ps5-fade">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: collection.color + "15", border: `1px solid ${collection.color}25` }}
              >
                <CollectionIcon iconKey={collection.icon} size={24} style={{ color: collection.color, opacity: 0.6 }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white/70">This collection is empty</p>
                <p className="text-xs text-white/30 mt-0.5">Add games to get started</p>
              </div>
              <button
                onClick={() => setShowAddPanel(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 cursor-pointer"
                style={{ background: collection.color + "25", border: `1px solid ${collection.color}40`, color: collection.color }}
              >
                <Plus size={13} />
                Add games
              </button>
            </div>
          )}

          {/* Grid view */}
          {viewMode === "grid" && games.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {games.map((game) => (
                <div
                  key={game.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, game.id)}
                  onDragOver={(e) => handleDragOver(e, game.id)}
                  onDrop={(e) => handleDrop(e, game.id)}
                  onDragEnd={handleDragEnd}
                  className={`relative group transition-all ${
                    dragOverId === game.id ? "ring-2 ring-white/30 rounded-lg" : ""
                  } ${dragId === game.id ? "opacity-40" : ""}`}
                >
                  <GameCard game={game} onClick={() => navigate(`/library/${game.id}`)} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmRemoveId(game.id); }}
                    className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-white/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove from collection"
                  >
                    <X size={11} />
                  </button>
                  <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                    <GripVertical size={11} className="text-white/70" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* List view */}
          {viewMode === "list" && games.length > 0 && (
            <div className="space-y-1">
              {games.map((game) => (
                <div
                  key={game.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, game.id)}
                  onDragOver={(e) => handleDragOver(e, game.id)}
                  onDrop={(e) => handleDrop(e, game.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors group ${
                    dragId === game.id ? "opacity-40" : ""
                  }`}
                  style={
                    dragOverId === game.id
                      ? { background: `${collection.color}15`, outline: `1px solid ${collection.color}40` }
                      : { background: "rgba(255,255,255,0.03)" }
                  }
                  onMouseEnter={(e) => {
                    if (dragOverId !== game.id) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    if (dragOverId !== game.id) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }}
                >
                  <GripVertical
                    size={14}
                    className="text-white/20 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                  />

                  <div
                    className="w-9 h-9 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden"
                    onClick={() => navigate(`/library/${game.id}`)}
                  >
                    {game.coverUrl && (
                      <img src={game.coverUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>

                  <p
                    className="flex-1 text-sm text-white font-medium truncate"
                    onClick={() => navigate(`/library/${game.id}`)}
                  >
                    {game.name}
                  </p>

                  <span className="text-xs text-white/25 w-14 text-center flex-shrink-0">
                    {sourceLabel(game.source)}
                  </span>
                  <span className="text-xs text-white/40 w-16 text-right flex-shrink-0">
                    {game.totalPlaySecs ? formatHours(game.totalPlaySecs) : "—"}
                  </span>
                  <span className="text-xs text-white/25 w-24 text-right flex-shrink-0">
                    {game.lastPlayedAt ? formatRelative(game.lastPlayedAt) : "Never"}
                  </span>

                  {canLaunch(game) && (
                    <button
                      onClick={(e) => handleLaunch(e, game)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-pointer"
                      style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.70)" }}
                    >
                      <Play size={10} className="fill-current" />
                      Launch
                    </button>
                  )}

                  {confirmRemoveId === game.id ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-red-400">Remove?</span>
                      <button
                        onClick={() => removeMutation.mutate(game.id)}
                        disabled={removeMutation.isPending}
                        className="px-2 py-0.5 rounded-lg text-xs text-white disabled:opacity-50 cursor-pointer"
                        style={{ background: "rgba(243,139,168,0.25)", border: "1px solid rgba(243,139,168,0.35)" }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="px-2 py-0.5 rounded-lg text-xs text-white/40 hover:text-white transition-colors cursor-pointer"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmRemoveId(game.id); }}
                      className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 cursor-pointer"
                      title="Remove from collection"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {games.length > 1 && (
            <p className="text-xs text-white/20 text-center pt-4">
              Drag to reorder
            </p>
          )}
        </div>

        {/* Add-game side panel */}
        {showAddPanel && (
          <div
            className="w-72 flex-shrink-0 flex flex-col"
            style={{ borderLeft: "1px solid rgba(255,255,255,0.07)", background: "rgba(0,0,0,0.30)" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <span className="text-xs text-white/50 uppercase tracking-[0.12em] font-semibold">Add Games</span>
              <button
                onClick={() => { setShowAddPanel(false); setAddSearch(""); }}
                className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>

            <div className="px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type="text"
                  placeholder="Search games…"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs text-white placeholder-white/25 focus:outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto py-1">
              {filteredForAdd.length === 0 && (
                <p className="text-xs text-white/25 text-center py-8 px-4 leading-relaxed">
                  {addSearch ? `No matches for "${addSearch}"` : "All games are already in this collection"}
                </p>
              )}
              {filteredForAdd.map((game) => (
                <button
                  key={game.id}
                  onClick={() => addMutation.mutate(game.id)}
                  disabled={addMutation.isPending}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left group transition-colors cursor-pointer"
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="w-7 h-7 rounded-lg bg-white/6 flex-shrink-0 overflow-hidden">
                    {game.coverUrl && (
                      <img src={game.coverUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="flex-1 text-xs text-white/70 group-hover:text-white truncate transition-colors">{game.name}</span>
                  <Plus size={12} className="text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm remove modal (grid mode) */}
      {confirmRemoveId && viewMode === "grid" && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div
            className="w-80 rounded-2xl p-6 shadow-2xl animate-ps5-up"
            style={{ background: "rgba(10,10,20,0.97)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <p className="text-sm text-white/80 mb-5 leading-relaxed">
              Remove{" "}
              <span className="font-semibold text-white">
                {games.find((g) => g.id === confirmRemoveId)?.name}
              </span>{" "}
              from this collection?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="flex-1 py-2 rounded-xl text-sm text-white/50 hover:text-white transition-colors cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => removeMutation.mutate(confirmRemoveId)}
                disabled={removeMutation.isPending}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity cursor-pointer"
                style={{ background: "rgba(243,139,168,0.25)", border: "1px solid rgba(243,139,168,0.40)" }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
