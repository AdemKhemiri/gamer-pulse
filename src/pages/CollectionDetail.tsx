import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, GripVertical, Trash2, Play, LayoutGrid, List, Search, X, Plus,
} from "lucide-react";
// import {
//   DndContext,
//   closestCenter,
//   PointerSensor,
//   useSensor,
//   useSensors,
//   DragEndEvent,
// } from "@dnd-kit/core";
// import {
//   SortableContext,
//   verticalListSortingStrategy,
//   rectSortingStrategy,
//   useSortable,
//   arrayMove,
// } from "@dnd-kit/sortable";
// import { CSS } from "@dnd-kit/utilities";<
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

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

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

  // All installed games for the "add game" picker
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

  // ── drag-and-drop reorder ──────────────────────────────────────────────────

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
    if (!sourceId || sourceId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
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

  // ── add panel helpers ──────────────────────────────────────────────────────

  const gameIdsInCollection = new Set(games.map((g) => g.id));

  const filteredForAdd = allGames.filter(
    (g) =>
      !gameIdsInCollection.has(g.id) &&
      (addSearch === "" || g.name.toLowerCase().includes(addSearch.toLowerCase())),
  );

  async function handleLaunch(e: React.MouseEvent, game: Game) {
    e.stopPropagation();
    try {
      await launchGame(game);
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Failed to launch game");
    }
  }

  function canLaunch(game: Game) {
    return !!(game.exePath || (game.source === "steam" && game.sourceId) || (game.source === "epic" && game.sourceId));
  }

  if (!collection) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--gt-muted)] text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[var(--gt-overlay)] flex-shrink-0">
        <button
          onClick={() => navigate("/collections")}
          className="p-1.5 rounded-md text-[var(--gt-muted)] hover:text-[var(--gt-text)] hover:bg-[var(--gt-overlay)] transition-colors"
        >
          <ArrowLeft size={16} />
        </button>

        {/* Collection icon */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: collection.color + "33" }}
        >
          <CollectionIcon iconKey={collection.icon} size={17} style={{ color: collection.color } as React.CSSProperties} />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-[var(--gt-text)] truncate">{collection.name}</h1>
          {collection.description && (
            <p className="text-xs text-[var(--gt-muted)] truncate">{collection.description}</p>
          )}
        </div>

        <span className="text-xs text-[var(--gt-muted)] flex-shrink-0">
          {games.length} {games.length === 1 ? "game" : "games"}
        </span>

        {/* View toggle */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "text-[var(--gt-accent)]" : "text-[var(--gt-muted)] hover:text-[var(--gt-text)]"}`}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "text-[var(--gt-accent)]" : "text-[var(--gt-muted)] hover:text-[var(--gt-text)]"}`}
          >
            <List size={15} />
          </button>
        </div>

        <button
          onClick={() => setShowAddPanel((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors flex-shrink-0 ${
            showAddPanel
              ? "bg-[var(--gt-accent)]/10 border-[var(--gt-accent)]/30 text-[var(--gt-accent)]"
              : "border-[var(--gt-overlay)] text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
          }`}
        >
          <Plus size={14} />
          Add games
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main game area */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {/* Empty state */}
          {games.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-[var(--gt-muted)]">
              <CollectionIcon iconKey={collection.icon} size={36} className="opacity-20" />
              <p className="text-sm">This collection is empty.</p>
              <button
                onClick={() => setShowAddPanel(true)}
                className="text-[var(--gt-accent)] text-sm hover:underline"
              >
                Add games to get started
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
                    dragOverId === game.id ? "ring-2 ring-[var(--gt-accent)] rounded-lg" : ""
                  } ${dragId === game.id ? "opacity-50" : ""}`}
                >
                  <GameCard
                    game={game}
                    onClick={() => navigate(`/library/${game.id}`)}
                  />
                  {/* Remove button overlay */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmRemoveId(game.id); }}
                    className="absolute top-1.5 right-1.5 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--gt-red)]/80"
                    title="Remove from collection"
                  >
                    <X size={11} />
                  </button>
                  {/* Drag handle */}
                  <div className="absolute top-1.5 left-1.5 p-1 rounded bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                    <GripVertical size={11} className="text-white" />
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
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors group ${
                    dragOverId === game.id
                      ? "ring-2 ring-[var(--gt-accent)] border-[var(--gt-accent)]/30"
                      : "bg-[var(--gt-surface)] border-[var(--gt-overlay)] hover:border-[var(--gt-hover)]"
                  } ${dragId === game.id ? "opacity-50" : ""}`}
                >
                  {/* Drag handle */}
                  <GripVertical
                    size={14}
                    className="text-[var(--gt-muted)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
                  />

                  <div
                    className="w-9 h-9 rounded bg-[var(--gt-overlay)] flex-shrink-0 overflow-hidden"
                    onClick={() => navigate(`/library/${game.id}`)}
                  >
                    {game.coverUrl && (
                      <img src={game.coverUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <p
                    className="flex-1 text-sm text-[var(--gt-text)] font-medium truncate"
                    onClick={() => navigate(`/library/${game.id}`)}
                  >
                    {game.name}
                  </p>
                  <span className="text-xs text-[var(--gt-muted)]">{sourceLabel(game.source)}</span>
                  <span className="text-xs text-[var(--gt-sub)] w-20 text-right flex-shrink-0">
                    {game.totalPlaySecs ? formatHours(game.totalPlaySecs) : "—"}
                  </span>
                  <span className="text-xs text-[var(--gt-muted)] w-24 text-right flex-shrink-0">
                    {game.lastPlayedAt ? formatRelative(game.lastPlayedAt) : "Never"}
                  </span>

                  {canLaunch(game) && (
                    <button
                      onClick={(e) => handleLaunch(e, game)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--gt-accent)]/10 border border-[var(--gt-accent)]/30 text-[var(--gt-accent)] text-xs hover:bg-[var(--gt-accent)]/20 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    >
                      <Play size={10} className="fill-[var(--gt-accent)]" />
                      Launch
                    </button>
                  )}

                  {/* Remove */}
                  {confirmRemoveId === game.id ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-[var(--gt-red)]">Remove?</span>
                      <button
                        onClick={() => removeMutation.mutate(game.id)}
                        disabled={removeMutation.isPending}
                        className="px-2 py-0.5 rounded bg-[var(--gt-red)] text-white text-xs hover:bg-[var(--gt-red)]/80 disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="px-2 py-0.5 rounded border border-[var(--gt-overlay)] text-xs text-[var(--gt-sub)]"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmRemoveId(game.id); }}
                      className="p-1.5 rounded-md text-[var(--gt-muted)] hover:text-[var(--gt-red)] hover:bg-[var(--gt-red)]/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
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
            <p className="text-xs text-[var(--gt-muted)] text-center pt-3">
              Drag games to reorder within this collection
            </p>
          )}
        </div>

        {/* Add-game side panel */}
        {showAddPanel && (
          <div className="w-72 flex-shrink-0 border-l border-[var(--gt-overlay)] flex flex-col bg-[var(--gt-surface)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--gt-overlay)]">
              <span className="text-sm font-medium text-[var(--gt-text)]">Add Games</span>
              <button
                onClick={() => { setShowAddPanel(false); setAddSearch(""); }}
                className="p-1 rounded-md text-[var(--gt-muted)] hover:text-[var(--gt-text)] hover:bg-[var(--gt-overlay)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-[var(--gt-overlay)]">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--gt-muted)]" />
                <input
                  type="text"
                  placeholder="Search games…"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  className="w-full bg-[var(--gt-base)] border border-[var(--gt-overlay)] rounded-md pl-7 pr-3 py-1.5 text-xs text-[var(--gt-text)] placeholder-[var(--gt-muted)] focus:outline-none focus:border-[var(--gt-accent)]"
                />
              </div>
            </div>

            {/* Game list */}
            <div className="flex-1 overflow-auto py-1">
              {filteredForAdd.length === 0 && (
                <p className="text-xs text-[var(--gt-muted)] text-center py-6">
                  {addSearch ? "No matches" : "All games are already in this collection"}
                </p>
              )}
              {filteredForAdd.map((game) => (
                <button
                  key={game.id}
                  onClick={() => addMutation.mutate(game.id)}
                  disabled={addMutation.isPending}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--gt-overlay)] transition-colors text-left group"
                >
                  <div className="w-7 h-7 rounded bg-[var(--gt-overlay)] flex-shrink-0 overflow-hidden">
                    {game.coverUrl && (
                      <img src={game.coverUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="flex-1 text-xs text-[var(--gt-text)] truncate">{game.name}</span>
                  <Plus
                    size={12}
                    className="text-[var(--gt-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm remove modal (grid mode) */}
      {confirmRemoveId && viewMode === "grid" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--gt-base)] border border-[var(--gt-overlay)] rounded-xl p-5 w-80 shadow-2xl">
            <p className="text-sm text-[var(--gt-text)] mb-4">
              Remove{" "}
              <span className="font-medium">
                {games.find((g) => g.id === confirmRemoveId)?.name}
              </span>{" "}
              from this collection?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="flex-1 py-2 rounded-md border border-[var(--gt-overlay)] text-sm text-[var(--gt-sub)] hover:text-[var(--gt-text)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => removeMutation.mutate(confirmRemoveId)}
                disabled={removeMutation.isPending}
                className="flex-1 py-2 rounded-md bg-[var(--gt-red)] text-white text-sm font-medium hover:bg-[var(--gt-red)]/80 disabled:opacity-50 transition-colors"
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
