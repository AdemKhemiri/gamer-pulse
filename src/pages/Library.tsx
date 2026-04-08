import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, LayoutGrid, List, Plus, Star, Play, EyeOff, FolderOpen, CheckSquare, Square, Trash2, X } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { getGames, addManualGame, launchGame, updateGame, GameFilter, Game } from "../api/client";
import { useUiStore } from "../store/uiStore";
import GameCard from "../components/games/GameCard";
import { formatHours, formatRelative, sourceLabel } from "../utils/format";
import toast from "react-hot-toast";

const SOURCES = ["steam", "epic", "gog", "xbox", "riot", "manual"];

export default function Library() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);

  const [showHidden, setShowHidden] = useState(false);
  const [filter, setFilter] = useState<GameFilter>({
    status: "installed",
    sortBy: "name",
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGame, setNewGame] = useState({ name: "", exePath: "" });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const activeFilter = showHidden ? { ...filter, status: "hidden" } : filter;

  const { data: games, isLoading } = useQuery({
    queryKey: ["games", activeFilter],
    queryFn: () => getGames(activeFilter),
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => updateGame(id, { status: "deleted" })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setSelected(new Set());
      setSelecting(false);
      setConfirmBulkDelete(false);
      toast.success("Games removed");
    },
    onError: () => toast.error("Failed to remove games"),
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
    setConfirmBulkDelete(false);
  }

  async function handleLaunch(e: React.MouseEvent, game: Game) {
    e.stopPropagation();
    try {
      await launchGame(game);
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Failed to launch game");
    }
  }

  function canLaunch(game: Game): boolean {
    return !!(game.exePath || (game.source === "steam" && game.sourceId) || (game.source === "epic" && game.sourceId));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--gt-overlay)] flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--gt-muted)]" />
          <input
            type="text"
            placeholder="Search games…"
            value={filter.search ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value || undefined }))}
            className="w-full bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md pl-8 pr-3 py-1.5 text-sm text-[var(--gt-text)] placeholder-[var(--gt-muted)] focus:outline-none focus:border-[var(--gt-accent)]"
          />
        </div>

        {/* Source filter */}
        <select
          value={filter.source ?? ""}
          onChange={(e) => setFilter((f) => ({ ...f, source: e.target.value || undefined }))}
          className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md px-2 py-1.5 text-sm text-[var(--gt-text)] focus:outline-none focus:border-[var(--gt-accent)]"
        >
          <option value="">All Sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{sourceLabel(s)}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={filter.sortBy ?? "name"}
          onChange={(e) => setFilter((f) => ({ ...f, sortBy: e.target.value as any }))}
          className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md px-2 py-1.5 text-sm text-[var(--gt-text)] focus:outline-none focus:border-[var(--gt-accent)]"
        >
          <option value="name">Name</option>
          <option value="playtime">Playtime</option>
          <option value="last_played">Last Played</option>
          <option value="added">Date Added</option>
        </select>

        {/* Favorites toggle */}
        <button
          onClick={() => setFilter((f) => ({ ...f, favoritesOnly: !f.favoritesOnly }))}
          className={`p-2 rounded-md border transition-colors ${
            filter.favoritesOnly
              ? "bg-[var(--gt-yellow)]/10 border-[var(--gt-yellow)]/40 text-[var(--gt-yellow)]"
              : "border-[var(--gt-overlay)] text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
          }`}
          title="Favorites only"
        >
          <Star size={15} />
        </button>

        {/* Show hidden toggle */}
        <button
          onClick={() => setShowHidden((v) => !v)}
          className={`p-2 rounded-md border transition-colors ${
            showHidden
              ? "bg-[var(--gt-accent)]/10 border-[var(--gt-accent)]/40 text-[var(--gt-accent)]"
              : "border-[var(--gt-overlay)] text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
          }`}
          title="Show hidden games"
        >
          <EyeOff size={15} />
        </button>

        <div className="h-5 w-px bg-[var(--gt-overlay)]" />

        {/* View mode */}
        <button
          onClick={() => setViewMode("grid")}
          className={`p-2 rounded-md transition-colors ${
            viewMode === "grid" ? "text-[var(--gt-accent)]" : "text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
          }`}
        >
          <LayoutGrid size={15} />
        </button>
        <button
          onClick={() => setViewMode("list")}
          className={`p-2 rounded-md transition-colors ${
            viewMode === "list" ? "text-[var(--gt-accent)]" : "text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
          }`}
        >
          <List size={15} />
        </button>

        <div className="h-5 w-px bg-[var(--gt-overlay)]" />

        <button
          onClick={() => selecting ? exitSelect() : setSelecting(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors ${
            selecting
              ? "bg-[var(--gt-red)]/10 border-[var(--gt-red)]/30 text-[var(--gt-red)]"
              : "border-[var(--gt-overlay)] text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
          }`}
        >
          {selecting ? <><X size={14} /> Cancel</> : <><CheckSquare size={14} /> Select</>}
        </button>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--gt-accent)]/10 border border-[var(--gt-accent)]/30 text-[var(--gt-accent)] text-sm hover:bg-[var(--gt-accent)]/20 transition-colors"
        >
          <Plus size={14} />
          Add Game
        </button>
      </div>

      {/* Count / select-all bar */}
      <div className="px-6 py-2 text-xs text-[var(--gt-muted)] flex-shrink-0 flex items-center gap-3">
        <span>{games?.length ?? 0} games</span>
        {selecting && (
          <>
            <button
              onClick={() => setSelected(new Set(games?.map((g) => g.id) ?? []))}
              className="text-[var(--gt-accent)] hover:underline cursor-pointer"
            >
              Select all
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="text-[var(--gt-muted)] hover:underline cursor-pointer"
              >
                Deselect all
              </button>
            )}
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-[var(--gt-muted)]">
            Loading…
          </div>
        )}

        {!isLoading && games?.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--gt-muted)] gap-2">
            <span className="text-4xl">🎮</span>
            <p className="text-sm">No games found. Try scanning your library.</p>
          </div>
        )}

        {viewMode === "grid" ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {games?.map((game) => {
              const isSelected = selected.has(game.id);
              return (
                <div key={game.id} className="relative">
                  <GameCard
                    game={game}
                    onClick={() => selecting ? toggleSelect(game.id) : navigate(`/library/${game.id}`)}
                  />
                  {selecting && (
                    <div
                      className={`absolute inset-0 rounded-lg border-2 transition-colors cursor-pointer ${
                        isSelected ? "border-[var(--gt-accent)] bg-[var(--gt-accent)]/10" : "border-transparent hover:border-[var(--gt-overlay)]"
                      }`}
                      onClick={() => toggleSelect(game.id)}
                    >
                      <div className="absolute top-1.5 left-1.5">
                        {isSelected
                          ? <CheckSquare size={16} className="text-[var(--gt-accent)] drop-shadow" />
                          : <Square size={16} className="text-white/70 drop-shadow" />}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {games?.map((game) => {
              const isSelected = selected.has(game.id);
              return (
                <div
                  key={game.id}
                  onClick={() => selecting ? toggleSelect(game.id) : navigate(`/library/${game.id}`)}
                  className={`flex items-center gap-4 p-3 rounded-lg border cursor-pointer transition-colors group ${
                    isSelected
                      ? "bg-[var(--gt-accent)]/10 border-[var(--gt-accent)]/50"
                      : "bg-[var(--gt-surface)] border-[var(--gt-overlay)] hover:border-[var(--gt-hover)]"
                  }`}
                >
                  {selecting && (
                    <div className="flex-shrink-0">
                      {isSelected
                        ? <CheckSquare size={15} className="text-[var(--gt-accent)]" />
                        : <Square size={15} className="text-[var(--gt-muted)]" />}
                    </div>
                  )}
                  <div className="w-10 h-10 rounded bg-[var(--gt-overlay)] flex-shrink-0 overflow-hidden">
                    {game.coverUrl && <img src={game.coverUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <p className="flex-1 text-sm text-[var(--gt-text)] font-medium">{game.name}</p>
                  <span className="text-xs text-[var(--gt-muted)]">{sourceLabel(game.source)}</span>
                  <span className="text-xs text-[var(--gt-sub)] w-20 text-right">
                    {game.totalPlaySecs ? formatHours(game.totalPlaySecs) : "—"}
                  </span>
                  <span className="text-xs text-[var(--gt-muted)] w-24 text-right">
                    {game.lastPlayedAt ? formatRelative(game.lastPlayedAt) : "Never"}
                  </span>
                  {!selecting && (canLaunch(game) ? (
                    <button
                      onClick={(e) => handleLaunch(e, game)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--gt-accent)]/10 border border-[var(--gt-accent)]/30 text-[var(--gt-accent)] text-xs hover:bg-[var(--gt-accent)]/20 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    >
                      <Play size={10} className="fill-[var(--gt-accent)]" />
                      Launch
                    </button>
                  ) : (
                    <div className="w-[68px] flex-shrink-0" />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Floating action bar */}
        {selecting && selected.size > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-xl bg-[var(--gt-surface)] border border-[var(--gt-overlay)] shadow-2xl z-40">
            <span className="text-sm text-[var(--gt-text)] font-medium">{selected.size} selected</span>
            <div className="w-px h-4 bg-[var(--gt-overlay)]" />
            {confirmBulkDelete ? (
              <>
                <span className="text-sm text-[var(--gt-red)]">Remove {selected.size} games?</span>
                <button
                  onClick={() => bulkDeleteMutation.mutate([...selected])}
                  disabled={bulkDeleteMutation.isPending}
                  className="px-3 py-1.5 rounded-md bg-[var(--gt-red)] text-white text-sm font-medium cursor-pointer hover:bg-[var(--gt-red)]/80 disabled:opacity-50 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmBulkDelete(false)}
                  className="px-3 py-1.5 rounded-md border border-[var(--gt-overlay)] text-sm text-[var(--gt-sub)] cursor-pointer hover:text-[var(--gt-text)] transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmBulkDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--gt-red)]/10 border border-[var(--gt-red)]/30 text-[var(--gt-red)] text-sm cursor-pointer hover:bg-[var(--gt-red)]/20 transition-colors"
              >
                <Trash2 size={13} />
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add game modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[var(--gt-base)] border border-[var(--gt-overlay)] rounded-xl p-6 w-96 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--gt-text)] mb-4">Add Game Manually</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[var(--gt-sub)] mb-1 block">Game Name *</label>
                <input
                  type="text"
                  value={newGame.name}
                  onChange={(e) => setNewGame((g) => ({ ...g, name: e.target.value }))}
                  placeholder="e.g. Elden Ring"
                  className="w-full bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md px-3 py-2 text-sm text-[var(--gt-text)] focus:outline-none focus:border-[var(--gt-accent)]"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--gt-sub)] mb-1 block">Executable Path (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGame.exePath}
                    onChange={(e) => setNewGame((g) => ({ ...g, exePath: e.target.value }))}
                    placeholder="C:\Games\game.exe"
                    className="flex-1 min-w-0 bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md px-3 py-2 text-sm text-[var(--gt-text)] focus:outline-none focus:border-[var(--gt-accent)]"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await openFileDialog({
                        title: "Select Game Executable",
                        filters: [{ name: "Executable", extensions: ["exe"] }],
                        multiple: false,
                      });
                      if (selected) {
                        const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
                        setNewGame((g) => ({ ...g, exePath: path }));
                        if (!newGame.name) {
                          const fileName = path.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") ?? "";
                          setNewGame((g) => ({ ...g, exePath: path, name: g.name || fileName }));
                        }
                      }
                    }}
                    className="flex-shrink-0 px-3 py-2 bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md text-[var(--gt-sub)] hover:text-[var(--gt-text)] hover:border-[var(--gt-accent)] transition-colors"
                    title="Browse for executable"
                  >
                    <FolderOpen size={16} />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 rounded-md border border-[var(--gt-overlay)] text-sm text-[var(--gt-sub)] hover:text-[var(--gt-text)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => addMutation.mutate()}
                disabled={!newGame.name || addMutation.isPending}
                className="flex-1 py-2 rounded-md bg-[var(--gt-accent)] text-[var(--gt-base)] text-sm font-medium hover:bg-[var(--gt-accent-dim)] disabled:opacity-50 transition-colors"
              >
                Add Game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
