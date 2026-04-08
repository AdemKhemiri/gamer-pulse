import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Trash2, CheckSquare, Square, X } from "lucide-react";
import { getGames, deleteGame } from "../api/client";
import { formatHours, formatDate, sourceLabel } from "../utils/format";
import toast from "react-hot-toast";

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='60' viewBox='0 0 40 60'%3E%3Crect fill='%23313244' width='40' height='60'/%3E%3Ctext fill='%236c7086' font-size='16' text-anchor='middle' x='20' y='36'%3E🎮%3C/text%3E%3C/svg%3E";

export default function History() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const { data: games, isLoading } = useQuery({
    queryKey: ["games", { status: "deleted" }],
    queryFn: () => getGames({ status: "deleted", sortBy: "added" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGame(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setConfirmId(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteGame(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setSelected(new Set());
      setSelecting(false);
      setConfirmBulkDelete(false);
      toast.success("Games permanently deleted");
    },
    onError: () => toast.error("Failed to delete games"),
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

  function handleDeleteClick(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (confirmId === id) {
      deleteMutation.mutate(id);
    } else {
      setConfirmId(id);
    }
  }

  function handleRowClick(id: string) {
    if (selecting) { toggleSelect(id); return; }
    if (confirmId) { setConfirmId(null); return; }
    navigate(`/library/${id}`);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--gt-text)]">Game History</h1>
          <p className="text-sm text-[var(--gt-muted)] mt-1">
            Games you've removed — playtime is preserved forever
          </p>
        </div>
        {(games?.length ?? 0) > 0 && (
          <button
            onClick={() => selecting ? exitSelect() : setSelecting(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors cursor-pointer ${
              selecting
                ? "bg-[var(--gt-red)]/10 border-[var(--gt-red)]/30 text-[var(--gt-red)]"
                : "border-[var(--gt-overlay)] text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
            }`}
          >
            {selecting ? <><X size={14} /> Cancel</> : <><CheckSquare size={14} /> Select</>}
          </button>
        )}
      </div>

      {selecting && (games?.length ?? 0) > 0 && (
        <div className="flex items-center gap-3 mb-3 text-xs text-[var(--gt-muted)]">
          <button onClick={() => setSelected(new Set(games?.map((g) => g.id) ?? []))} className="text-[var(--gt-accent)] hover:underline cursor-pointer">
            Select all
          </button>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="hover:underline cursor-pointer">
              Deselect all
            </button>
          )}
        </div>
      )}

      {isLoading && <div className="text-[var(--gt-muted)] text-sm">Loading…</div>}

      {!isLoading && games?.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-[var(--gt-muted)] gap-2">
          <Trash2 size={32} className="opacity-30" />
          <p className="text-sm">No removed games yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {games?.map((game) => {
          const isSelected = selected.has(game.id);
          return (
            <div
              key={game.id}
              onClick={() => handleRowClick(game.id)}
              className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors group ${
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

              <div className="w-10 h-14 rounded bg-[var(--gt-overlay)] flex-shrink-0 overflow-hidden">
                <img
                  src={game.coverUrl ?? PLACEHOLDER}
                  alt={game.name}
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                  onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--gt-sub)] group-hover:text-[var(--gt-text)] transition-colors truncate">
                    {game.name}
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--gt-red)]/10 text-[var(--gt-red)] border border-[var(--gt-red)]/20 flex-shrink-0">
                    Removed
                  </span>
                </div>
                <p className="text-xs text-[var(--gt-muted)] mt-0.5">
                  {sourceLabel(game.source)}
                  {game.deletedAt && <span className="ml-2">· Removed {formatDate(game.deletedAt)}</span>}
                </p>
              </div>

              <div className="text-right flex-shrink-0 mr-2">
                <p className="text-sm font-semibold text-[var(--gt-text)]">
                  {game.totalPlaySecs ? formatHours(game.totalPlaySecs) : "—"}
                </p>
                <p className="text-xs text-[var(--gt-muted)]">
                  {game.totalPlaySecs ? "played" : "no sessions"} · {game.sessionCount ?? 0} sessions
                </p>
              </div>

              {!selecting && (
                <button
                  onClick={(e) => handleDeleteClick(e, game.id)}
                  disabled={deleteMutation.isPending}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors ${
                    confirmId === game.id
                      ? "bg-[var(--gt-red)] text-[var(--gt-base)] hover:bg-[var(--gt-red)]/80"
                      : "text-[var(--gt-muted)] hover:text-[var(--gt-red)] hover:bg-[var(--gt-red)]/10"
                  }`}
                  title="Permanently delete this game and all its data"
                >
                  <Trash2 size={13} />
                  {confirmId === game.id ? "Confirm?" : "Delete"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {confirmId && !selecting && (
        <p className="mt-3 text-xs text-center text-[var(--gt-muted)]">
          Click "Confirm?" to permanently delete — this cannot be undone. Click elsewhere to cancel.
        </p>
      )}

      {/* Floating action bar */}
      {selecting && selected.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-xl bg-[var(--gt-surface)] border border-[var(--gt-overlay)] shadow-2xl z-40">
          <span className="text-sm text-[var(--gt-text)] font-medium">{selected.size} selected</span>
          <div className="w-px h-4 bg-[var(--gt-overlay)]" />
          {confirmBulkDelete ? (
            <>
              <span className="text-sm text-[var(--gt-red)]">Permanently delete {selected.size} games?</span>
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
              Delete permanently
            </button>
          )}
        </div>
      )}
    </div>
  );
}
