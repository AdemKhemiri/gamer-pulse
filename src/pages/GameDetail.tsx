import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star, Calendar, EyeOff, Eye, Pencil, Link, Upload, X, Trash2, FolderOpen, Target, Plus, Check, MessageSquare } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import toast from "react-hot-toast";
import {
  getGame, getGameStats, getSessions, getAchievements,
  getHeatmap, setFavorite, updateGame, searchCovers, getSettings,
  deleteSession, updateSession, updateSessionNotes, GamePatch,
  getGoals, setGoal, deleteGoal, GameGoal, GoalPeriod,
  getCollections, getGameCollections, addGameToCollection, removeGameFromCollection,
} from "../api/client";
import { CollectionIcon } from "./Collections";
import {
  formatHours, formatDuration, formatDate, formatRelative, sourceLabel,
} from "../utils/format";
import AchievementBadge from "../components/stats/AchievementBadge";
import HeatmapCalendar from "../components/stats/HeatmapCalendar";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect fill='%23313244' width='300' height='450'/%3E%3Ctext fill='%236c7086' font-size='80' text-anchor='middle' x='150' y='260'%3E🎮%3C/text%3E%3C/svg%3E";

const CURRENT_YEAR = new Date().getFullYear();

/** Convert a UTC ISO timestamp to the value expected by <input type="datetime-local">. */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

type Tab = "overview" | "sessions" | "history" | "achievements";

const PER_GAME_BADGES: { key: string; label: string; description: string; icon: string }[] = [
  { key: "first_hour",       label: "First Hour",    description: "Play for 1 hour",                         icon: "⏱️" },
  { key: "ten_hours",        label: "Veteran",       description: "Play for 10 hours",                       icon: "🎯" },
  { key: "fifty_hours",      label: "Veteran",       description: "Play for 50 hours",                       icon: "🏆" },
  { key: "hundred_hours",    label: "Century",       description: "Play for 100 hours",                      icon: "💎" },
  { key: "marathon",         label: "Marathon",      description: "Play 3+ hours in a single session",       icon: "🏃" },
  { key: "dedicated_streak", label: "Dedicated",     description: "Play 7 days in a row",                    icon: "🔥" },
  { key: "speed_runner",     label: "Speed Runner",  description: "Complete a session under 30 minutes",     icon: "⚡" },
  { key: "night_owl",        label: "Night Owl",     description: "Play past midnight",                      icon: "🦉" },
  { key: "early_bird",       label: "Early Bird",    description: "Start a session between 4am and 7am",     icon: "🌅" },
];

export default function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notesValue, setNotesValue] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>("weekly");
  const [goalHours, setGoalHours] = useState("");
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [heatmapYear, setHeatmapYear] = useState(CURRENT_YEAR);
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [editSessionId, setEditSessionId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [noteSessionId, setNoteSessionId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [coverTab, setCoverTab] = useState<"url" | "search">("url");
  const [coverSearchResults, setCoverSearchResults] = useState<string[]>([]);
  const [coverSearching, setCoverSearching] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: game } = useQuery({
    queryKey: ["game", id],
    queryFn: () => getGame(id!),
    enabled: !!id,
  });

  const { data: stats } = useQuery({
    queryKey: ["gameStats", id],
    queryFn: () => getGameStats(id!),
    enabled: !!id,
  });

  const { data: sessions } = useQuery({
    queryKey: ["sessions", id],
    queryFn: () => getSessions(id!),
    enabled: !!id,
  });

  const { data: achievements } = useQuery({
    queryKey: ["achievements", id],
    queryFn: () => getAchievements(id!),
    enabled: !!id,
  });

  const { data: heatmap } = useQuery({
    queryKey: ["heatmap", heatmapYear, id],
    queryFn: () => getHeatmap(heatmapYear, id!),
    enabled: !!id,
  });

  const { data: goals } = useQuery({
    queryKey: ["goals", id],
    queryFn: () => getGoals(id!),
    enabled: !!id,
  });

  const { data: gameCollections = [] } = useQuery({
    queryKey: ["gameCollections", id],
    queryFn: () => getGameCollections(id!),
    enabled: !!id,
  });

  const { data: allCollections = [] } = useQuery({
    queryKey: ["collections"],
    queryFn: getCollections,
    enabled: showCollectionPicker,
  });

  const addToCollectionMutation = useMutation({
    mutationFn: (collectionId: string) => addGameToCollection(collectionId, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gameCollections", id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["collectionGames"] });
    },
    onError: () => toast.error("Failed to add to collection"),
  });

  const removeFromCollectionMutation = useMutation({
    mutationFn: (collectionId: string) => removeGameFromCollection(collectionId, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gameCollections", id] });
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["collectionGames"] });
    },
    onError: () => toast.error("Failed to remove from collection"),
  });

  const setGoalMutation = useMutation({
    mutationFn: ({ period, targetSecs }: { period: GoalPeriod; targetSecs: number }) =>
      setGoal(id!, period, targetSecs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", id] });
      setShowGoalForm(false);
      setGoalHours("");
      toast.success("Goal saved");
    },
    onError: () => toast.error("Failed to save goal"),
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (period: GoalPeriod) => deleteGoal(id!, period),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals", id] }),
    onError: () => toast.error("Failed to delete goal"),
  });

  const favMutation = useMutation({
    mutationFn: (fav: boolean) => setFavorite(id!, fav),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["game", id] }),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: GamePatch) => updateGame(id!, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["game", id] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      toast.success("Saved");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => updateGame(id!, { status: "deleted" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      navigate("/library");
    },
    onError: () => toast.error("Failed to remove game"),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: () => {
      setConfirmDeleteSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["sessions", id] });
      queryClient.invalidateQueries({ queryKey: ["game-stats", id] });
      queryClient.invalidateQueries({ queryKey: ["global-stats"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      toast.success("Session deleted");
    },
    onError: () => toast.error("Failed to delete session"),
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, startedAt, endedAt }: { sessionId: string; startedAt: string; endedAt: string }) =>
      updateSession(sessionId, startedAt, endedAt),
    onSuccess: () => {
      setEditSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["sessions", id] });
      queryClient.invalidateQueries({ queryKey: ["gameStats", id] });
      queryClient.invalidateQueries({ queryKey: ["globalStats"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      toast.success("Session updated");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to update session"),
  });

  const updateSessionNotesMutation = useMutation({
    mutationFn: ({ sessionId, notes }: { sessionId: string; notes: string }) =>
      updateSessionNotes(sessionId, notes),
    onSuccess: () => {
      setNoteSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["sessions", id] });
      toast.success("Note saved");
    },
    onError: () => toast.error("Failed to save note"),
  });

  if (!game) {
    return (
      <div className="flex items-center justify-center h-full text-white/40">
        Loading…
      </div>
    );
  }

  const notes = notesValue !== null ? notesValue : (game.notes ?? "");
  const isHidden = game.status === "hidden";
  const monthlyData = buildMonthlyData(sessions ?? []);

  function openCoverEditor() {
    setCoverUrlInput(game?.coverUrl ?? "");
    setShowCoverEditor(true);
  }

  function saveCoverUrl(url: string) {
    updateMutation.mutate({ coverUrl: url || undefined });
    setShowCoverEditor(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      saveCoverUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#050505" }}>
      {/* Left panel */}
      <div className="w-52 flex-shrink-0 flex flex-col overflow-auto" style={{ background: "rgba(255,255,255,0.03)", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
        {/* Cover image with edit overlay */}
        <div className="relative group/cover">
          <img
            src={game.coverUrl ?? PLACEHOLDER}
            alt={game.name}
            className={`w-full object-cover ${isHidden ? "opacity-40" : ""}`}
            onError={(e) => {
              (e.target as HTMLImageElement).src = PLACEHOLDER;
            }}
          />
          <button
            onClick={openCoverEditor}
            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/cover:opacity-100 transition-opacity"
            title="Change cover image"
          >
            <Pencil size={20} className="text-white" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <EditableName name={game.name} onSave={(name) => updateMutation.mutate({ name })} />
          <p className="text-xs text-white/40">{sourceLabel(game.source)}</p>

          <button
            onClick={() => favMutation.mutate(!game.isFavorite)}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors w-full ${
              game.isFavorite
                ? "border-yellow-400/30 text-yellow-400"
                : "border-white/10 text-white/40 hover:text-white"
            }`}
            style={game.isFavorite ? { background: "rgba(250,204,21,0.1)" } : {}}
          >
            <Star size={13} className={game.isFavorite ? "fill-yellow-400" : ""} />
            {game.isFavorite ? "Favorited" : "Add to Favorites"}
          </button>

          <button
            onClick={() =>
              updateMutation.mutate({ status: isHidden ? "installed" : "hidden" })
            }
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors w-full ${
              isHidden
                ? "border-blue-400/30 text-blue-400"
                : "border-white/10 text-white/40 hover:text-white"
            }`}
            style={isHidden ? { background: "rgba(96,165,250,0.1)" } : {}}
          >
            {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            {isHidden ? "Unhide Game" : "Hide Game"}
          </button>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border border-red-500/30 text-red-400/70 hover:text-red-400 hover:border-red-500/50 transition-colors w-full"
            >
              <Trash2 size={13} />
              Remove Game
            </button>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] text-red-400 px-1">Remove permanently?</p>
              <div className="flex gap-1">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex-1 text-xs py-1.5 rounded-md bg-red-500 text-white font-medium hover:bg-red-500/80 disabled:opacity-50 transition-colors"
                >
                  Remove
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 text-xs py-1.5 rounded-md border border-white/10 text-white/50 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-white/8">
            <Stat label="Total Playtime" value={stats ? formatHours(stats.totalSecs) : "—"} />
            <Stat label="Sessions" value={String(stats?.sessionCount ?? 0)} />
            <Stat
              label="Avg Session"
              value={stats?.avgSessionSecs ? formatDuration(stats.avgSessionSecs) : "—"}
            />
            <Stat
              label="Longest Session"
              value={stats?.longestSessionSecs ? formatDuration(stats.longestSessionSecs) : "—"}
            />
            <Stat
              label="First Played"
              value={stats?.firstPlayedAt ? formatDate(stats.firstPlayedAt) : "—"}
            />
            <Stat
              label="Last Played"
              value={stats?.lastPlayedAt ? formatRelative(stats.lastPlayedAt) : "—"}
            />
          </div>

          <div className="pt-2 border-t border-white/8">
            <p className="text-[10px] text-white/40 mb-1">Executable Path</p>
            <ExePathEditor
              exePath={game.exePath ?? ""}
              onSave={(exePath) => updateMutation.mutate({ exePath })}
            />
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3 px-6 pt-4 pb-0">
            <button
              onClick={() => navigate(-1)}
              className="text-white/40 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-white">{game.name}</h1>
              <p className="text-xs text-white/40">
                {isHidden ? "Hidden" : game.status === "deleted" ? "Removed" : "Installed"}
              </p>
            </div>
          </div>
          <div className="flex gap-0 px-6 mt-3">
            {(["overview", "sessions", "history", "achievements"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2 text-sm capitalize border-b-2 transition-colors ${
                  activeTab === t
                    ? "border-white text-white"
                    : "border-transparent text-white/40 hover:text-white/60"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <>
              {stats && (stats.currentStreak > 0 || stats.longestStreak > 0) && (
                <div className="flex gap-3">
                  <div className="flex-1 flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,160,50,0.15)" }}>
                    <span className="text-2xl">🔥</span>
                    <div>
                      <p className="text-xl font-bold text-orange-400">{stats.currentStreak}d</p>
                      <p className="text-[10px] text-white/40">Current Streak</p>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(250,204,21,0.15)" }}>
                    <span className="text-2xl">🏆</span>
                    <div>
                      <p className="text-xl font-bold text-yellow-400">{stats.longestStreak}d</p>
                      <p className="text-[10px] text-white/40">Longest Streak</p>
                    </div>
                  </div>
                </div>
              )}

              <GoalsSection
                goals={goals ?? []}
                showForm={showGoalForm}
                goalPeriod={goalPeriod}
                goalHours={goalHours}
                onOpenForm={() => {
                  // Default to first unset period
                  const setPeriods = new Set((goals ?? []).map((g) => g.period));
                  const next = (["weekly", "monthly", "total"] as GoalPeriod[]).find((p) => !setPeriods.has(p)) ?? "weekly";
                  setGoalPeriod(next);
                  setGoalHours("");
                  setShowGoalForm(true);
                }}
                onCloseForm={() => setShowGoalForm(false)}
                onPeriodChange={setGoalPeriod}
                onHoursChange={setGoalHours}
                onSave={() => {
                  const h = parseFloat(goalHours);
                  if (!h || h <= 0) { toast.error("Enter a valid number of hours"); return; }
                  setGoalMutation.mutate({ period: goalPeriod, targetSecs: Math.round(h * 3600) });
                }}
                onDelete={(period) => deleteGoalMutation.mutate(period)}
                saving={setGoalMutation.isPending}
              />

              <section className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={13} /> Activity Heatmap
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setHeatmapYear((y) => y - 1)}
                      className="text-white/40 hover:text-white px-1 text-sm"
                    >
                      ‹
                    </button>
                    <span className="text-xs text-white/55 w-10 text-center">{heatmapYear}</span>
                    <button
                      onClick={() => setHeatmapYear((y) => Math.min(y + 1, CURRENT_YEAR))}
                      className="text-white/40 hover:text-white px-1 text-sm"
                    >
                      ›
                    </button>
                  </div>
                </div>
                <HeatmapCalendar data={heatmap ?? []} year={heatmapYear} />
              </section>

              {monthlyData.length > 0 && (
                <section className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">
                    Monthly Playtime
                  </h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={monthlyData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                      <Tooltip
                        formatter={(v) => [`${Number(v).toFixed(1)}h`, "Playtime"]}
                        contentStyle={{ background: "rgba(15,15,20,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                        itemStyle={{ color: "#60a5fa" }}
                      />
                      <Bar dataKey="hours" radius={[3, 3, 0, 0]}>
                        {monthlyData.map((_, i) => (
                          <Cell key={i} fill="#60a5fa" opacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              )}

              {/* Collections */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-white/55 uppercase tracking-wider">
                    Collections
                  </h3>
                  <div className="relative">
                    <button
                      onClick={() => setShowCollectionPicker((v) => !v)}
                      className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
                    >
                      <Plus size={12} />
                      Add
                    </button>
                    {showCollectionPicker && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowCollectionPicker(false)}
                        />
                      <div className="absolute right-0 top-full mt-1 w-52 rounded-xl shadow-2xl z-20 py-1" style={{ background: "rgba(15,15,20,0.97)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        {allCollections.length === 0 && (
                          <p className="px-3 py-2 text-xs text-white/40">No collections yet</p>
                        )}
                        {allCollections.map((col) => {
                          const inCol = gameCollections.some((c) => c.id === col.id);
                          return (
                            <button
                              key={col.id}
                              onClick={() => {
                                if (inCol) {
                                  removeFromCollectionMutation.mutate(col.id);
                                } else {
                                  addToCollectionMutation.mutate(col.id);
                                }
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/6 transition-colors text-left"
                            >
                              <span style={{ color: col.color }}>
                                <CollectionIcon iconKey={col.icon} size={13} />
                              </span>
                              <span className="flex-1 text-xs text-white truncate">{col.name}</span>
                              {inCol && <Check size={11} className="text-white flex-shrink-0" />}
                            </button>
                          );
                        })}
                        <div className="mt-1 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <button
                            onClick={() => { setShowCollectionPicker(false); navigate("/collections"); }}
                            className="w-full px-3 py-1.5 text-xs text-white/40 hover:text-white text-left transition-colors"
                          >
                            Manage collections…
                          </button>
                        </div>
                      </div>
                      </>
                    )}
                  </div>
                </div>

                {gameCollections.length === 0 ? (
                  <p className="text-xs text-white/40 italic">Not in any collection</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {gameCollections.map((col) => (
                      <button
                        key={col.id}
                        onClick={() => navigate(`/collections/${col.id}`)}
                        className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors hover:opacity-90"
                        style={{
                          background: col.color + "22",
                          borderColor: col.color + "55",
                          color: col.color,
                        }}
                      >
                        <CollectionIcon iconKey={col.icon} size={11} />
                        {col.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold text-white/55 uppercase tracking-wider mb-3">Notes</h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotesValue(e.target.value)}
                  onBlur={() => {
                    if (notesValue !== null && notesValue !== game.notes) {
                      updateMutation.mutate({ notes: notesValue });
                    }
                  }}
                  placeholder="Add notes, tips, progress…"
                  rows={4}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none resize-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </section>

            </>
          )}

          {activeTab === "sessions" && (
            <section>
              <h3 className="text-xs font-semibold text-white/55 uppercase tracking-wider mb-3">
                All Sessions ({sessions?.length ?? 0})
              </h3>
              {sessions?.length === 0 && (
                <p className="text-sm text-white/40">No sessions recorded.</p>
              )}
              <div className="space-y-1">
                {sessions?.map((s) => {
                  const isCompleted = !!s.endedAt && !!s.durationSecs;
                  const isEditing = editSessionId === s.id;
                  const isConfirmingDelete = confirmDeleteSessionId === s.id;

                  const previewDuration = isEditing && editStart && editEnd
                    ? (() => {
                        const ms = new Date(editEnd).getTime() - new Date(editStart).getTime();
                        return ms > 0 ? formatDuration(Math.round(ms / 1000)) : null;
                      })()
                    : null;

                  return (
                    <div
                      key={s.id}
                      className="rounded-xl text-sm group"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      {isEditing ? (
                        <div className="p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-white/40 block mb-1">Start</label>
                              <input
                                type="datetime-local"
                                value={editStart}
                                onChange={(e) => setEditStart(e.target.value)}
                                className="w-full rounded px-2 py-1 text-xs text-white focus:outline-none"
                                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-white/40 block mb-1">End</label>
                              <input
                                type="datetime-local"
                                value={editEnd}
                                onChange={(e) => setEditEnd(e.target.value)}
                                className="w-full rounded px-2 py-1 text-xs text-white focus:outline-none"
                                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-white/40">
                              {previewDuration ?? (editStart && editEnd ? "Invalid range" : "—")}
                            </span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  const startIso = new Date(editStart).toISOString();
                                  const endIso   = new Date(editEnd).toISOString();
                                  updateSessionMutation.mutate({ sessionId: s.id, startedAt: startIso, endedAt: endIso });
                                }}
                                disabled={updateSessionMutation.isPending || !previewDuration}
                                className="px-3 py-1 rounded text-xs bg-white text-black font-medium disabled:opacity-50 transition-colors"
                              >
                                {updateSessionMutation.isPending ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => setEditSessionId(null)}
                                className="px-3 py-1 rounded text-xs border border-white/10 text-white/50 hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-4 px-4 py-3">
                            <span className="flex-1 text-xs text-white/55">
                              {new Date(s.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              {s.endedAt
                                ? ` → ${new Date(s.endedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                                : <span className="text-blue-400"> — Active</span>}
                            </span>
                            <span className="text-white font-medium text-sm flex-shrink-0">
                              {s.durationSecs ? formatDuration(s.durationSecs) : "—"}
                            </span>
                            {isConfirmingDelete ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => deleteSessionMutation.mutate(s.id)}
                                  disabled={deleteSessionMutation.isPending}
                                  className="px-2 py-1 rounded text-xs bg-red-500 text-white cursor-pointer hover:bg-red-500/80 transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteSessionId(null)}
                                  className="px-2 py-1 rounded text-xs border border-white/10 text-white/50 cursor-pointer hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => {
                                    setConfirmDeleteSessionId(null);
                                    setEditSessionId(null);
                                    if (noteSessionId === s.id) {
                                      setNoteSessionId(null);
                                    } else {
                                      setNoteValue(s.notes ?? "");
                                      setNoteSessionId(s.id);
                                    }
                                  }}
                                  className={`p-1 rounded cursor-pointer transition-colors hover:text-white hover:bg-white/10 ${
                                    s.notes
                                      ? "text-white/70"
                                      : "text-white/40 opacity-0 group-hover:opacity-100"
                                  }`}
                                  title={s.notes ? "Edit note" : "Add note"}
                                >
                                  <MessageSquare size={14} />
                                </button>
                                {isCompleted && (
                                  <button
                                    onClick={() => {
                                      setConfirmDeleteSessionId(null);
                                      setNoteSessionId(null);
                                      setEditStart(toDatetimeLocal(s.startedAt));
                                      setEditEnd(toDatetimeLocal(s.endedAt!));
                                      setEditSessionId(s.id);
                                    }}
                                    className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 cursor-pointer transition-colors opacity-0 group-hover:opacity-100"
                                    title="Edit session times"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                                <button
                                  onClick={() => setConfirmDeleteSessionId(s.id)}
                                  className="p-1 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors opacity-0 group-hover:opacity-100"
                                  title="Delete session"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                          {s.notes && noteSessionId !== s.id && (
                            <p className="px-4 pb-2 text-xs text-white/40 italic line-clamp-2">
                              {s.notes}
                            </p>
                          )}
                          {noteSessionId === s.id && (
                            <div className="px-4 pb-3 space-y-2">
                              <textarea
                                autoFocus
                                value={noteValue}
                                onChange={(e) => setNoteValue(e.target.value)}
                                placeholder="What happened this session? Where did you leave off?"
                                rows={2}
                                className="w-full rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none resize-none"
                                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                              />
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => updateSessionNotesMutation.mutate({ sessionId: s.id, notes: noteValue })}
                                  disabled={updateSessionNotesMutation.isPending}
                                  className="px-3 py-1 rounded text-xs bg-white text-black font-medium disabled:opacity-50 transition-colors"
                                >
                                  {updateSessionNotesMutation.isPending ? "Saving…" : "Save"}
                                </button>
                                <button
                                  onClick={() => setNoteSessionId(null)}
                                  className="px-3 py-1 rounded text-xs border border-white/10 text-white/50 hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === "history" && (
            <section>
              <h3 className="text-xs font-semibold text-white/55 uppercase tracking-wider mb-3">Daily Breakdown</h3>
              <DailyBreakdown
                sessions={sessions ?? []}
                confirmDeleteSessionId={confirmDeleteSessionId}
                onRequestDelete={(sid) => setConfirmDeleteSessionId(sid)}
                onConfirmDelete={(sid) => deleteSessionMutation.mutate(sid)}
                onCancelDelete={() => setConfirmDeleteSessionId(null)}
              />
            </section>
          )}

          {activeTab === "achievements" && (() => {
            const earnedKeys = new Set((achievements ?? []).map((a) => a.badgeKey));
            const unlocked = achievements ?? [];
            const locked = PER_GAME_BADGES.filter((b) => !earnedKeys.has(b.key));

            return (
              <div className="space-y-6">
                {/* Unlocked */}
                <section>
                  <h3 className="text-xs font-semibold text-white/55 uppercase tracking-wider mb-3">
                    Unlocked
                    <span className="ml-2 font-normal normal-case text-white/40">
                      {unlocked.length} / {PER_GAME_BADGES.length}
                    </span>
                  </h3>
                  {unlocked.length === 0 ? (
                    <p className="text-sm text-white/40">No achievements earned yet — keep playing!</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {unlocked.map((a) => (
                        <AchievementBadge key={a.id} achievement={a} />
                      ))}
                    </div>
                  )}
                </section>

                {/* Locked */}
                {locked.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold text-white/55 uppercase tracking-wider mb-3">Locked</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {locked.map((b) => (
                        <div
                          key={b.key}
                          className="flex items-center gap-3 p-3 rounded-xl opacity-40"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", filter: "grayscale(1)" }}
                        >
                          <div className="w-10 h-10 flex items-center justify-center rounded-full text-xl flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                            {b.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">{b.label}</p>
                            <p className="text-xs text-white/40">{b.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Cover image editor modal */}
      {showCoverEditor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowCoverEditor(false)}>
          <div className="rounded-2xl p-5 w-96 shadow-2xl" style={{ background: "rgba(15,15,20,0.98)", border: "1px solid rgba(255,255,255,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Change Cover Image</h2>
              <button onClick={() => setShowCoverEditor(false)} className="text-white/40 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 mb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              {(["url", "search"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCoverTab(tab)}
                  className={`px-4 py-1.5 text-xs capitalize border-b-2 transition-colors -mb-px ${
                    coverTab === tab
                      ? "border-white text-white"
                      : "border-transparent text-white/40 hover:text-white/60"
                  }`}
                >
                  {tab === "url" ? "URL / File" : "Search SteamGridDB"}
                </button>
              ))}
            </div>

            {coverTab === "url" && (
              <>
                <div className="w-24 h-36 mx-auto mb-4 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <img
                    src={coverUrlInput || game.coverUrl || PLACEHOLDER}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                  />
                </div>

                <label className="text-xs text-white/55 mb-1 block">Image URL</label>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Link size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="text"
                      value={coverUrlInput}
                      onChange={(e) => setCoverUrlInput(e.target.value)}
                      placeholder="https://…"
                      className="w-full rounded-md pl-7 pr-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                    />
                  </div>
                  <button
                    onClick={() => saveCoverUrl(coverUrlInput)}
                    className="px-3 py-1.5 rounded-md bg-white text-black text-xs font-medium transition-colors hover:bg-white/90"
                  >
                    Set
                  </button>
                </div>

                <div className="flex items-center gap-2 text-white/30 text-xs mb-3">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <span>or</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs text-white/50 hover:text-white transition-colors"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <Upload size={13} />
                  Upload from file
                </button>

                {game.coverUrl && (
                  <button
                    onClick={() => saveCoverUrl("")}
                    className="w-full mt-2 py-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    Remove cover
                  </button>
                )}
              </>
            )}

            {coverTab === "search" && (
              <>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    defaultValue={game.name}
                    id="cover-search-input"
                    placeholder="Game name…"
                    className="flex-1 rounded-md px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                  <button
                    disabled={coverSearching}
                    onClick={async () => {
                      const input = document.getElementById("cover-search-input") as HTMLInputElement;
                      const query = input?.value || game.name;
                      setCoverSearching(true);
                      setCoverSearchResults([]);
                      try {
                        const settings = await getSettings();
                        const results = await searchCovers(query, settings.steamgriddbApiKey);
                        setCoverSearchResults(results);
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : String(e));
                      } finally {
                        setCoverSearching(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-md bg-white text-black text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    {coverSearching ? "…" : "Search"}
                  </button>
                </div>

                {coverSearchResults.length === 0 && !coverSearching && (
                  <p className="text-xs text-white/40 text-center py-6">
                    Search to see covers
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                  {coverSearchResults.map((url) => (
                    <button
                      key={url}
                      onClick={() => saveCoverUrl(url)}
                      className="rounded-lg overflow-hidden border-2 border-transparent hover:border-white transition-colors"
                    >
                      <img
                        src={url}
                        alt=""
                        className="w-full h-24 object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-white/30 mt-2 text-center">
                  Requires a SteamGridDB API key in Settings
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EditableName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) onSave(trimmed);
    else setValue(name);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(name); setEditing(false); } }}
        className="w-full text-sm font-bold rounded px-2 py-1 text-white focus:outline-none"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)" }}
      />
    );
  }

  return (
    <div
      className="group flex items-center gap-1 cursor-pointer"
      onClick={() => { setValue(name); setEditing(true); }}
      title="Click to rename"
    >
      <h2 className="text-sm font-bold text-white">{name}</h2>
      <Pencil size={11} className="text-white/40 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </div>
  );
}

function ExePathEditor({ exePath, onSave }: { exePath: string; onSave: (path: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(exePath);

  async function browse() {
    const selected = await openFileDialog({
      title: "Select Game Executable",
      filters: [{ name: "Executable", extensions: ["exe"] }],
      multiple: false,
    });
    if (selected) {
      const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
      setValue(path);
      onSave(path);
      setEditing(false);
    }
  }

  function commit() {
    const trimmed = value.trim();
    if (trimmed !== exePath) onSave(trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(exePath); setEditing(false); } }}
          className="flex-1 min-w-0 text-[10px] rounded px-2 py-1 text-white focus:outline-none"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)" }}
          placeholder="C:\Games\game.exe"
        />
        <button
          onMouseDown={(e) => { e.preventDefault(); browse(); }}
          className="flex-shrink-0 px-2 py-1 rounded border border-white/10 text-white/40 hover:text-white cursor-pointer transition-colors"
          title="Browse"
        >
          <FolderOpen size={12} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-1 cursor-pointer"
      onClick={() => { setValue(exePath); setEditing(true); }}
      title="Click to edit path"
    >
      <p className="text-[10px] text-white/55 truncate flex-1">
        {exePath || <span className="text-white/30 italic">Not set — click to add</span>}
      </p>
      <Pencil size={10} className="flex-shrink-0 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-white/40">{label}</p>
      <p className="text-xs font-medium text-white">{value}</p>
    </div>
  );
}

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  weekly: "This Week",
  monthly: "This Month",
  total: "All Time",
};

function GoalsSection({
  goals,
  showForm,
  goalPeriod,
  goalHours,
  onOpenForm,
  onCloseForm,
  onPeriodChange,
  onHoursChange,
  onSave,
  onDelete,
  saving,
}: {
  goals: GameGoal[];
  showForm: boolean;
  goalPeriod: GoalPeriod;
  goalHours: string;
  onOpenForm: () => void;
  onCloseForm: () => void;
  onPeriodChange: (p: GoalPeriod) => void;
  onHoursChange: (h: string) => void;
  onSave: () => void;
  onDelete: (p: GoalPeriod) => void;
  saving: boolean;
}) {
  const setPeriods = new Set(goals.map((g) => g.period));
  const availablePeriods = (["weekly", "monthly", "total"] as GoalPeriod[]).filter(
    (p) => !setPeriods.has(p) || p === goalPeriod,
  );
  const canAddMore = setPeriods.size < 3;

  return (
    <section className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-white/55 uppercase tracking-wider flex items-center gap-2">
          <Target size={13} /> Playtime Goals
        </h3>
        {canAddMore && !showForm && (
          <button
            onClick={onOpenForm}
            className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
          >
            <Plus size={13} /> Add Goal
          </button>
        )}
      </div>

      {goals.length === 0 && !showForm && (
        <p className="text-xs text-white/40">
          No goals set. Add one to track your progress.
        </p>
      )}

      <div className="space-y-3">
        {goals.map((g) => {
          const pct = Math.min((g.currentSecs / g.targetSecs) * 100, 100);
          const done = g.currentSecs >= g.targetSecs;
          const currentH = (g.currentSecs / 3600).toFixed(1);
          const targetH = (g.targetSecs / 3600 % 1 === 0)
            ? String(g.targetSecs / 3600)
            : (g.targetSecs / 3600).toFixed(1);

          return (
            <div key={g.period} className="group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-white">
                  {PERIOD_LABELS[g.period as GoalPeriod]}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${done ? "text-green-400" : "text-white/55"}`}>
                    {done ? "✓ " : ""}{currentH}h / {targetH}h
                  </span>
                  <button
                    onClick={() => onDelete(g.period as GoalPeriod)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/40 hover:text-red-400 transition-all"
                    title="Remove goal"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: done ? "#4ade80" : "rgba(255,255,255,0.7)",
                  }}
                />
              </div>
              {done && (
                <p className="text-[10px] text-green-400 mt-0.5">Goal reached!</p>
              )}
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-white/40">Period</label>
              <select
                value={goalPeriod}
                onChange={(e) => onPeriodChange(e.target.value as GoalPeriod)}
                className="w-full rounded px-2 py-1.5 text-xs text-white focus:outline-none"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {availablePeriods.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-white/40">Target (hours)</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={goalHours}
                onChange={(e) => onHoursChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCloseForm(); }}
                placeholder="e.g. 10"
                autoFocus
                className="w-full rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
            </div>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-white text-black text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <Check size={12} /> Save
            </button>
            <button
              onClick={onCloseForm}
              className="px-2 py-1.5 rounded border border-white/10 text-white/40 hover:text-white text-xs transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function buildMonthlyData(sessions: { startedAt: string; durationSecs?: number | null }[]) {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (!s.durationSecs) continue;
    const month = s.startedAt.slice(0, 7);
    map.set(month, (map.get(month) ?? 0) + s.durationSecs);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, secs]) => ({
      month: month.slice(5) + "/" + month.slice(2, 4),
      hours: Math.round((secs / 3600) * 10) / 10,
      secs,
    }));
}

function DailyBreakdown({
  sessions,
  confirmDeleteSessionId,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  sessions: { startedAt: string; endedAt?: string | null; durationSecs?: number | null; id: string }[];
  confirmDeleteSessionId: string | null;
  onRequestDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const byDay = new Map<string, { count: number; totalSecs: number; sessions: typeof sessions }>();
  for (const s of sessions) {
    const day = s.startedAt.slice(0, 10);
    const existing = byDay.get(day) ?? { count: 0, totalSecs: 0, sessions: [] };
    existing.count += 1;
    existing.totalSecs += s.durationSecs ?? 0;
    existing.sessions.push(s);
    byDay.set(day, existing);
  }

  const sorted = Array.from(byDay.entries()).sort(([a], [b]) => b.localeCompare(a));
  if (sorted.length === 0) return <p className="text-sm text-white/40">No session data yet.</p>;

  const byMonth = new Map<string, typeof sorted>();
  for (const entry of sorted) {
    const month = entry[0].slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(entry);
  }

  return (
    <div className="space-y-4">
      {Array.from(byMonth.entries()).map(([month, days]) => {
        const monthTotal = days.reduce((acc, [, d]) => acc + d.totalSecs, 0);
        const monthSessions = days.reduce((acc, [, d]) => acc + d.count, 0);
        const [y, m] = month.split("-");
        const label = new Date(Number(y), Number(m) - 1).toLocaleString("default", { month: "long", year: "numeric" });

        return (
          <div key={month}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-white">{label}</h4>
              <div className="text-xs text-white/40">
                {formatHours(monthTotal)} · {monthSessions} session{monthSessions !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="space-y-1">
              {days.map(([day, data]) => (
                <div key={day}>
                  <div
                    className="flex items-center gap-4 px-3 py-2 rounded-xl cursor-pointer transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    onClick={() => setExpanded(expanded === day ? null : day)}
                  >
                    <span className="text-xs text-white/55 w-24 flex-shrink-0">{day}</span>
                    <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.min((data.totalSecs / 14400) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-white w-12 text-right flex-shrink-0">{formatHours(data.totalSecs)}</span>
                    <span className="text-xs text-white/40 w-16 text-right flex-shrink-0">{data.count} session{data.count !== 1 ? "s" : ""}</span>
                  </div>
                  {expanded === day && (
                    <div className="ml-4 mt-1 space-y-1">
                      {data.sessions.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs group" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                          <span className="text-white/55 flex-1">
                            {new Date(s.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                            {s.endedAt
                              ? ` → ${new Date(s.endedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
                              : <span className="text-blue-400"> — Active</span>}
                          </span>
                          <span className="text-white font-medium">{s.durationSecs ? formatDuration(s.durationSecs) : "—"}</span>
                          {confirmDeleteSessionId === s.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); onConfirmDelete(s.id); }}
                                className="px-2 py-0.5 rounded text-xs bg-red-500 text-white cursor-pointer hover:bg-red-500/80 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
                                className="px-2 py-0.5 rounded text-xs border border-white/10 text-white/50 cursor-pointer hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); onRequestDelete(s.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all"
                              title="Delete session"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
