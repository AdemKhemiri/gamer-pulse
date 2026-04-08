import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star, Calendar, EyeOff, Eye, Pencil, Link, Upload, X, Trash2, FolderOpen } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import toast from "react-hot-toast";
import {
  getGame, getGameStats, getSessions, getAchievements,
  getHeatmap, setFavorite, updateGame, searchCovers, getSettings, deleteSession, GamePatch,
} from "../api/client";
import {
  formatHours, formatDuration, formatDate, formatRelative, sourceLabel,
} from "../utils/format";
import AchievementBadge from "../components/stats/AchievementBadge";
import HeatmapCalendar from "../components/stats/HeatmapCalendar";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect fill='%23313244' width='300' height='450'/%3E%3Ctext fill='%236c7086' font-size='80' text-anchor='middle' x='150' y='260'%3E🎮%3C/text%3E%3C/svg%3E";

const CURRENT_YEAR = new Date().getFullYear();

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
  const [heatmapYear, setHeatmapYear] = useState(CURRENT_YEAR);
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
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

  if (!game) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--gt-muted)]">
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
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-52 flex-shrink-0 border-r border-[var(--gt-overlay)] bg-[var(--gt-surface)] flex flex-col overflow-auto">
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
          <p className="text-xs text-[var(--gt-muted)]">{sourceLabel(game.source)}</p>

          <button
            onClick={() => favMutation.mutate(!game.isFavorite)}
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors w-full ${
              game.isFavorite
                ? "bg-[var(--gt-yellow)]/10 border-[var(--gt-yellow)]/30 text-[var(--gt-yellow)]"
                : "border-[var(--gt-overlay)] text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
            }`}
          >
            <Star size={13} className={game.isFavorite ? "fill-[var(--gt-yellow)]" : ""} />
            {game.isFavorite ? "Favorited" : "Add to Favorites"}
          </button>

          <button
            onClick={() =>
              updateMutation.mutate({ status: isHidden ? "installed" : "hidden" })
            }
            className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors w-full ${
              isHidden
                ? "bg-[var(--gt-accent)]/10 border-[var(--gt-accent)]/30 text-[var(--gt-accent)]"
                : "border-[var(--gt-overlay)] text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
            }`}
          >
            {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            {isHidden ? "Unhide Game" : "Hide Game"}
          </button>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border border-[var(--gt-red)]/30 text-[var(--gt-red)]/70 hover:text-[var(--gt-red)] hover:border-[var(--gt-red)]/50 transition-colors w-full"
            >
              <Trash2 size={13} />
              Remove Game
            </button>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--gt-red)] px-1">Remove permanently?</p>
              <div className="flex gap-1">
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="flex-1 text-xs py-1.5 rounded-md bg-[var(--gt-red)] text-[var(--gt-base)] font-medium hover:bg-[var(--gt-red)]/80 disabled:opacity-50 transition-colors"
                >
                  Remove
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 text-xs py-1.5 rounded-md border border-[var(--gt-overlay)] text-[var(--gt-sub)] hover:text-[var(--gt-text)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-[var(--gt-overlay)]">
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

          <div className="pt-2 border-t border-[var(--gt-overlay)]">
            <p className="text-[10px] text-[var(--gt-muted)] mb-1">Executable Path</p>
            <ExePathEditor
              exePath={game.exePath ?? ""}
              onSave={(exePath) => updateMutation.mutate({ exePath })}
            />
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-[var(--gt-overlay)]">
          <div className="flex items-center gap-3 px-6 pt-4 pb-0">
            <button
              onClick={() => navigate(-1)}
              className="text-[var(--gt-muted)] hover:text-[var(--gt-text)] transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-[var(--gt-text)]">{game.name}</h1>
              <p className="text-xs text-[var(--gt-muted)]">
                {isHidden ? "👁 Hidden" : game.status === "deleted" ? "🗑 Removed" : "✓ Installed"}
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
                    ? "border-[var(--gt-accent)] text-[var(--gt-accent)]"
                    : "border-transparent text-[var(--gt-muted)] hover:text-[var(--gt-sub)]"
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
                  <div className="flex-1 flex items-center gap-3 bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg px-4 py-3">
                    <span className="text-2xl">🔥</span>
                    <div>
                      <p className="text-xl font-bold text-[var(--gt-orange)]">{stats.currentStreak}d</p>
                      <p className="text-[10px] text-[var(--gt-muted)]">Current Streak</p>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-3 bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg px-4 py-3">
                    <span className="text-2xl">🏆</span>
                    <div>
                      <p className="text-xl font-bold text-[var(--gt-yellow)]">{stats.longestStreak}d</p>
                      <p className="text-[10px] text-[var(--gt-muted)]">Longest Streak</p>
                    </div>
                  </div>
                </div>
              )}

              <section className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider flex items-center gap-2">
                    <Calendar size={13} /> Activity Heatmap
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setHeatmapYear((y) => y - 1)}
                      className="text-[var(--gt-muted)] hover:text-[var(--gt-text)] px-1 text-sm"
                    >
                      ‹
                    </button>
                    <span className="text-xs text-[var(--gt-sub)] w-10 text-center">{heatmapYear}</span>
                    <button
                      onClick={() => setHeatmapYear((y) => Math.min(y + 1, CURRENT_YEAR))}
                      className="text-[var(--gt-muted)] hover:text-[var(--gt-text)] px-1 text-sm"
                    >
                      ›
                    </button>
                  </div>
                </div>
                <HeatmapCalendar data={heatmap ?? []} year={heatmapYear} />
              </section>

              {monthlyData.length > 0 && (
                <section className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-4">
                  <h3 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-4">
                    Monthly Playtime
                  </h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={monthlyData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <XAxis dataKey="month" tick={{ fill: "var(--gt-muted)", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "var(--gt-muted)", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}h`} />
                      <Tooltip
                        formatter={(v) => [`${Number(v).toFixed(1)}h`, "Playtime"]}
                        contentStyle={{ background: "var(--gt-surface)", border: "1px solid var(--gt-overlay)", borderRadius: 6, fontSize: 11 }}
                        labelStyle={{ color: "var(--gt-sub)" }}
                        itemStyle={{ color: "var(--gt-blue)" }}
                      />
                      <Bar dataKey="hours" radius={[3, 3, 0, 0]}>
                        {monthlyData.map((_, i) => (
                          <Cell key={i} fill="var(--gt-blue)" opacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </section>
              )}

              <section>
                <h3 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-3">Notes</h3>
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
                  className="w-full bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg px-3 py-2 text-sm text-[var(--gt-text)] placeholder-[var(--gt-muted)] focus:outline-none focus:border-[var(--gt-accent)] resize-none"
                />
              </section>

            </>
          )}

          {activeTab === "sessions" && (
            <section>
              <h3 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-3">
                All Sessions ({sessions?.length ?? 0})
              </h3>
              {sessions?.length === 0 && (
                <p className="text-sm text-[var(--gt-muted)]">No sessions recorded.</p>
              )}
              <div className="space-y-1">
                {sessions?.map((s) => (
                  <div key={s.id} className="flex items-center gap-4 px-4 py-3 rounded-lg bg-[var(--gt-surface)] border border-[var(--gt-overlay)] text-sm group">
                    <span className="flex-1 text-xs text-[var(--gt-sub)]">
                      {new Date(s.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {s.endedAt
                        ? ` → ${new Date(s.endedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                        : <span className="text-[var(--gt-accent)]"> — Active</span>}
                    </span>
                    <span className="text-[var(--gt-text)] font-medium text-sm flex-shrink-0">
                      {s.durationSecs ? formatDuration(s.durationSecs) : "—"}
                    </span>
                    {confirmDeleteSessionId === s.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteSessionMutation.mutate(s.id)}
                          disabled={deleteSessionMutation.isPending}
                          className="px-2 py-1 rounded text-xs bg-[var(--gt-red)] text-white cursor-pointer hover:bg-[var(--gt-red)]/80 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteSessionId(null)}
                          className="px-2 py-1 rounded text-xs border border-[var(--gt-overlay)] text-[var(--gt-sub)] cursor-pointer hover:text-[var(--gt-text)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteSessionId(s.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--gt-muted)] hover:text-[var(--gt-red)] hover:bg-[var(--gt-red)]/10 cursor-pointer transition-all"
                        title="Delete session"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "history" && (
            <section>
              <h3 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-3">Daily Breakdown</h3>
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
                  <h3 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-3">
                    Unlocked
                    <span className="ml-2 font-normal normal-case text-[var(--gt-muted)]">
                      {unlocked.length} / {PER_GAME_BADGES.length}
                    </span>
                  </h3>
                  {unlocked.length === 0 ? (
                    <p className="text-sm text-[var(--gt-muted)]">No achievements earned yet — keep playing!</p>
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
                    <h3 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-3">Locked</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {locked.map((b) => (
                        <div
                          key={b.key}
                          className="flex items-center gap-3 p-3 rounded-lg border border-[var(--gt-overlay)] opacity-50"
                          style={{ background: "var(--gt-surface)", filter: "grayscale(1)" }}
                        >
                          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--gt-overlay)] text-xl flex-shrink-0">
                            {b.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--gt-text)]">{b.label}</p>
                            <p className="text-xs text-[var(--gt-muted)]">{b.description}</p>
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
          <div className="bg-[var(--gt-base)] border border-[var(--gt-overlay)] rounded-xl p-5 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--gt-text)]">Change Cover Image</h2>
              <button onClick={() => setShowCoverEditor(false)} className="text-[var(--gt-muted)] hover:text-[var(--gt-text)]">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-[var(--gt-overlay)] mb-4">
              {(["url", "search"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCoverTab(tab)}
                  className={`px-4 py-1.5 text-xs capitalize border-b-2 transition-colors -mb-px ${
                    coverTab === tab
                      ? "border-[var(--gt-accent)] text-[var(--gt-accent)]"
                      : "border-transparent text-[var(--gt-muted)] hover:text-[var(--gt-sub)]"
                  }`}
                >
                  {tab === "url" ? "URL / File" : "Search SteamGridDB"}
                </button>
              ))}
            </div>

            {coverTab === "url" && (
              <>
                <div className="w-24 h-36 mx-auto mb-4 rounded overflow-hidden bg-[var(--gt-overlay)]">
                  <img
                    src={coverUrlInput || game.coverUrl || PLACEHOLDER}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                  />
                </div>

                <label className="text-xs text-[var(--gt-sub)] mb-1 block">Image URL</label>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <Link size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--gt-muted)]" />
                    <input
                      type="text"
                      value={coverUrlInput}
                      onChange={(e) => setCoverUrlInput(e.target.value)}
                      placeholder="https://…"
                      className="w-full bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md pl-7 pr-3 py-1.5 text-xs text-[var(--gt-text)] placeholder-[var(--gt-muted)] focus:outline-none focus:border-[var(--gt-accent)]"
                    />
                  </div>
                  <button
                    onClick={() => saveCoverUrl(coverUrlInput)}
                    className="px-3 py-1.5 rounded-md bg-[var(--gt-accent)] text-[var(--gt-base)] text-xs font-medium hover:bg-[var(--gt-accent-dim)] transition-colors"
                  >
                    Set
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[var(--gt-hover)] text-xs mb-3">
                  <div className="flex-1 h-px bg-[var(--gt-overlay)]" />
                  <span>or</span>
                  <div className="flex-1 h-px bg-[var(--gt-overlay)]" />
                </div>

                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-[var(--gt-overlay)] text-xs text-[var(--gt-sub)] hover:text-[var(--gt-text)] hover:border-[var(--gt-hover)] transition-colors"
                >
                  <Upload size={13} />
                  Upload from file
                </button>

                {game.coverUrl && (
                  <button
                    onClick={() => saveCoverUrl("")}
                    className="w-full mt-2 py-1.5 text-xs text-[var(--gt-red)]/70 hover:text-[var(--gt-red)] transition-colors"
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
                    className="flex-1 bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md px-3 py-1.5 text-xs text-[var(--gt-text)] placeholder-[var(--gt-muted)] focus:outline-none focus:border-[var(--gt-accent)]"
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
                    className="px-3 py-1.5 rounded-md bg-[var(--gt-accent)] text-[var(--gt-base)] text-xs font-medium hover:bg-[var(--gt-accent-dim)] disabled:opacity-50 transition-colors"
                  >
                    {coverSearching ? "…" : "Search"}
                  </button>
                </div>

                {coverSearchResults.length === 0 && !coverSearching && (
                  <p className="text-xs text-[var(--gt-muted)] text-center py-6">
                    {coverSearchResults.length === 0 ? "Search to see covers" : "No results found"}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                  {coverSearchResults.map((url) => (
                    <button
                      key={url}
                      onClick={() => saveCoverUrl(url)}
                      className="rounded overflow-hidden border-2 border-transparent hover:border-[var(--gt-accent)] transition-colors"
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

                <p className="text-[10px] text-[var(--gt-muted)] mt-2 text-center">
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
        className="w-full text-sm font-bold bg-[var(--gt-surface)] border border-[var(--gt-accent)] rounded px-2 py-1 text-[var(--gt-text)] focus:outline-none"
      />
    );
  }

  return (
    <div
      className="group flex items-center gap-1 cursor-pointer"
      onClick={() => { setValue(name); setEditing(true); }}
      title="Click to rename"
    >
      <h2 className="text-sm font-bold text-[var(--gt-text)]">{name}</h2>
      <Pencil size={11} className="text-[var(--gt-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
          className="flex-1 min-w-0 text-[10px] bg-[var(--gt-surface)] border border-[var(--gt-accent)] rounded px-2 py-1 text-[var(--gt-text)] focus:outline-none"
          placeholder="C:\Games\game.exe"
        />
        <button
          onMouseDown={(e) => { e.preventDefault(); browse(); }}
          className="flex-shrink-0 px-2 py-1 rounded border border-[var(--gt-overlay)] text-[var(--gt-muted)] hover:text-[var(--gt-text)] hover:border-[var(--gt-accent)] cursor-pointer transition-colors"
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
      <p className="text-[10px] text-[var(--gt-sub)] truncate flex-1">
        {exePath || <span className="text-[var(--gt-muted)] italic">Not set — click to add</span>}
      </p>
      <Pencil size={10} className="flex-shrink-0 text-[var(--gt-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-[var(--gt-muted)]">{label}</p>
      <p className="text-xs font-medium text-[var(--gt-text)]">{value}</p>
    </div>
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
  sessions: { startedAt: string; durationSecs?: number | null; id: string }[];
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
  if (sorted.length === 0) return <p className="text-sm text-[var(--gt-muted)]">No session data yet.</p>;

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
              <h4 className="text-xs font-semibold text-[var(--gt-text)]">{label}</h4>
              <div className="text-xs text-[var(--gt-muted)]">
                {formatHours(monthTotal)} · {monthSessions} session{monthSessions !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="space-y-1">
              {days.map(([day, data]) => (
                <div key={day}>
                  <div
                    className="flex items-center gap-4 px-3 py-2 rounded-lg bg-[var(--gt-surface)] border border-[var(--gt-overlay)] cursor-pointer hover:border-[var(--gt-hover)] transition-colors"
                    onClick={() => setExpanded(expanded === day ? null : day)}
                  >
                    <span className="text-xs text-[var(--gt-sub)] w-24 flex-shrink-0">{day}</span>
                    <div className="flex-1 bg-[var(--gt-overlay)] rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--gt-blue)]" style={{ width: `${Math.min((data.totalSecs / 14400) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-[var(--gt-text)] w-12 text-right flex-shrink-0">{formatHours(data.totalSecs)}</span>
                    <span className="text-xs text-[var(--gt-muted)] w-16 text-right flex-shrink-0">{data.count} session{data.count !== 1 ? "s" : ""}</span>
                  </div>
                  {expanded === day && (
                    <div className="ml-4 mt-1 space-y-1">
                      {data.sessions.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-[var(--gt-overlay)]/40 border border-[var(--gt-overlay)] text-xs group">
                          <span className="text-[var(--gt-sub)] flex-1">{formatDate(s.startedAt)}</span>
                          <span className="text-[var(--gt-text)] font-medium">{s.durationSecs ? formatDuration(s.durationSecs) : "—"}</span>
                          {confirmDeleteSessionId === s.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); onConfirmDelete(s.id); }}
                                className="px-2 py-0.5 rounded text-xs bg-[var(--gt-red)] text-white cursor-pointer hover:bg-[var(--gt-red)]/80 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
                                className="px-2 py-0.5 rounded text-xs border border-[var(--gt-overlay)] text-[var(--gt-sub)] cursor-pointer hover:text-[var(--gt-text)] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); onRequestDelete(s.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--gt-muted)] hover:text-[var(--gt-red)] hover:bg-[var(--gt-red)]/10 cursor-pointer transition-all"
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
