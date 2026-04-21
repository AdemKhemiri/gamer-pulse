import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Trash2, CheckSquare, Square, X } from "lucide-react";
import { getGames, permanentlyDeleteGame } from "../api/client";
import { formatHours, formatDate, sourceLabel } from "../utils/format";
import { gradientFromName } from "../utils/gameColor";
import toast from "react-hot-toast";

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
    mutationFn: (id: string) => permanentlyDeleteGame(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["games"] }); setConfirmId(null); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => { await Promise.all(ids.map((id) => permanentlyDeleteGame(id))); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      setSelected(new Set()); setSelecting(false); setConfirmBulkDelete(false);
      toast.success("Games permanently deleted");
    },
    onError: () => toast.error("Failed to delete games"),
  });

  function toggleSelect(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function exitSelect() { setSelecting(false); setSelected(new Set()); setConfirmBulkDelete(false); }
  function handleDeleteClick(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (confirmId === id) deleteMutation.mutate(id);
    else setConfirmId(id);
  }
  function handleRowClick(id: string) {
    if (selecting) { toggleSelect(id); return; }
    if (confirmId) { setConfirmId(null); return; }
    navigate(`/library/${id}`);
  }

  return (
    <div className="h-full overflow-auto">
      <div className="fixed inset-0 z-0" style={{ background: "#050505" }} />
      <div className="relative z-10 p-6 max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex items-start justify-between animate-ps5-fade">
          <div>
            <p className="text-xs text-white/35 uppercase tracking-[0.15em] mb-1">Removed</p>
            <h1 className="text-3xl font-bold text-white">Game History</h1>
            <p className="text-sm text-white/40 mt-1">Games you've removed — playtime is preserved forever</p>
          </div>
          {(games?.length ?? 0) > 0 && (
            <button
              onClick={() => selecting ? exitSelect() : setSelecting(true)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors cursor-pointer mt-2 ${
                selecting
                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : "border-white/12 text-white/50 hover:text-white hover:border-white/25"
              }`}
            >
              {selecting ? <><X size={14} /> Cancel</> : <><CheckSquare size={14} /> Select</>}
            </button>
          )}
        </div>

        {selecting && (games?.length ?? 0) > 0 && (
          <div className="flex items-center gap-3 mb-3 text-xs text-white/40">
            <button onClick={() => setSelected(new Set(games?.map((g) => g.id) ?? []))} className="text-[var(--gt-accent)] hover:underline cursor-pointer">Select all</button>
            {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="hover:underline cursor-pointer">Deselect all</button>}
          </div>
        )}

        {isLoading && <div className="text-white/40 text-sm">Loading…</div>}

        {!isLoading && games?.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-white/25 gap-3">
            <Trash2 size={32} className="opacity-40" />
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
                className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all group"
                style={{
                  background: isSelected ? "rgba(203,166,247,0.08)" : "rgba(255,255,255,0.04)",
                  border: isSelected ? "1px solid rgba(203,166,247,0.3)" : "1px solid rgba(255,255,255,0.07)",
                }}
              >
                {selecting && (
                  <div className="flex-shrink-0">
                    {isSelected
                      ? <CheckSquare size={15} className="text-[var(--gt-accent)]" />
                      : <Square size={15} className="text-white/30" />}
                  </div>
                )}

                <div className="w-10 h-14 rounded-lg flex-shrink-0 overflow-hidden">
                  {game.coverUrl ? (
                    <img src={game.coverUrl} alt={game.name} className="w-full h-full object-cover opacity-50 group-hover:opacity-70 transition-opacity" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white/40 opacity-50 group-hover:opacity-70 transition-opacity"
                      style={{ background: gradientFromName(game.name) }}>
                      {game.name.charAt(0)}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white/60 group-hover:text-white/90 transition-colors truncate">{game.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(248,113,113,0.1)", color: "rgb(248,113,113)", border: "1px solid rgba(248,113,113,0.2)" }}>
                      Removed
                    </span>
                  </div>
                  <p className="text-xs text-white/30 mt-0.5">
                    {sourceLabel(game.source)}
                    {game.deletedAt && <span className="ml-2">· Removed {formatDate(game.deletedAt)}</span>}
                  </p>
                </div>

                <div className="text-right flex-shrink-0 mr-2">
                  <p className="text-sm font-semibold text-white/70">{game.totalPlaySecs ? formatHours(game.totalPlaySecs) : "—"}</p>
                  <p className="text-xs text-white/30">{game.totalPlaySecs ? "played" : "no sessions"} · {game.sessionCount ?? 0} sessions</p>
                </div>

                {!selecting && (
                  <button
                    onClick={(e) => handleDeleteClick(e, game.id)}
                    disabled={deleteMutation.isPending}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                      confirmId === game.id
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "text-white/35 hover:text-red-400 hover:bg-red-500/10"
                    }`}
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
          <p className="mt-3 text-xs text-center text-white/30">Click "Confirm?" to permanently delete — this cannot be undone.</p>
        )}

        {/* Floating action bar */}
        {selecting && selected.size > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl z-40"
            style={{ background: "rgba(15,15,20,0.95)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <span className="text-sm text-white font-medium">{selected.size} selected</span>
            <div className="w-px h-4 bg-white/10" />
            {confirmBulkDelete ? (
              <>
                <span className="text-sm text-red-400">Permanently delete {selected.size} games?</span>
                <button onClick={() => bulkDeleteMutation.mutate([...selected])} disabled={bulkDeleteMutation.isPending}
                  className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-sm font-medium cursor-pointer hover:bg-red-600 disabled:opacity-50 transition-colors">
                  Confirm
                </button>
                <button onClick={() => setConfirmBulkDelete(false)}
                  className="px-3 py-1.5 rounded-xl border border-white/12 text-sm text-white/60 cursor-pointer hover:text-white transition-colors">
                  Cancel
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmBulkDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-red-400 text-sm cursor-pointer hover:bg-red-500/10 transition-colors">
                <Trash2 size={13} />
                Delete permanently
              </button>
            )}
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
