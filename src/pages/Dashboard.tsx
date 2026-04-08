import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Clock, Gamepad2, Calendar, Star } from "lucide-react";
import { getGlobalStats, getRecentSessions, getAchievements, getTopGames, getGameStreaks } from "../api/client";
import { formatHours, formatDuration, formatDate } from "../utils/format";
import AchievementBadge from "../components/stats/AchievementBadge";

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Crect fill='%23313244' width='60' height='60'/%3E%3Ctext fill='%236c7086' font-size='24' text-anchor='middle' x='30' y='40'%3E🎮%3C/text%3E%3C/svg%3E";

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["globalStats"],
    queryFn: getGlobalStats,
  });

  const { data: recentSessions } = useQuery({
    queryKey: ["sessions", "recent"],
    queryFn: () => getRecentSessions(8),
  });

  const { data: achievements } = useQuery({
    queryKey: ["achievements"],
    queryFn: () => getAchievements(),
  });

  const { data: topGames } = useQuery({
    queryKey: ["topGames"],
    queryFn: () => getTopGames(5),
  });

  const { data: gameStreaks } = useQuery({
    queryKey: ["gameStreaks"],
    queryFn: () => getGameStreaks(5),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--gt-text)]">Dashboard</h1>
        <p className="text-sm text-[var(--gt-muted)] mt-1">Your gaming overview</p>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Clock size={18} className="text-[var(--gt-blue)]" />}
          label="Total Playtime"
          value={stats ? formatHours(stats.totalPlaySecs) : "—"}
          sub={`${stats?.totalSessions ?? 0} sessions`}
          color="blue"
        />
        <StatCard
          icon={<Gamepad2 size={18} className="text-[var(--gt-accent)]" />}
          label="Games"
          value={String(stats?.installedGames ?? "—")}
          sub={`${stats?.deletedGames ?? 0} removed`}
          color="purple"
        />
        <StatCard
          icon={<Star size={18} className="text-[var(--gt-yellow)]" />}
          label="Most Played"
          value={stats?.mostPlayedGameName ?? "—"}
          sub={stats?.totalPlaySecs && stats?.mostPlayedGameName ? formatHours(stats.totalPlaySecs) : "no data yet"}
          color="yellow"
        />
        <StatCard
          icon={<Calendar size={18} className="text-[var(--gt-green)]" />}
          label="Days Played"
          value={String(stats?.uniqueDaysPlayed ?? "—")}
          sub="unique days"
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent sessions */}
        <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-4">
          <h2 className="text-sm font-semibold text-[var(--gt-text)] mb-3">Recent Sessions</h2>
          {recentSessions?.length === 0 && (
            <p className="text-sm text-[var(--gt-muted)]">No sessions yet. Play a game!</p>
          )}
          <div className="space-y-2">
            {recentSessions?.map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/library/${s.gameId}`)}
                className="flex items-center gap-3 p-2 rounded hover:bg-[var(--gt-overlay)]/50 cursor-pointer transition-colors"
              >
                <div className="w-8 h-8 rounded bg-[var(--gt-overlay)] flex items-center justify-center text-xs flex-shrink-0">
                  🎮
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--gt-text)] truncate">{s.gameName}</p>
                  <p className="text-xs text-[var(--gt-muted)]">{formatDate(s.startedAt)}</p>
                </div>
                <span className="text-xs text-[var(--gt-sub)] flex-shrink-0">
                  {s.durationSecs ? formatDuration(s.durationSecs) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top games */}
        <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-4">
          <h2 className="text-sm font-semibold text-[var(--gt-text)] mb-3">Most Played</h2>
          {topGames?.length === 0 && (
            <p className="text-sm text-[var(--gt-muted)]">No playtime recorded yet.</p>
          )}
          <div className="space-y-2">
            {topGames?.map((g, i) => (
              <div
                key={g.gameId}
                onClick={() => navigate(`/library/${g.gameId}`)}
                className="flex items-center gap-3 p-2 rounded hover:bg-[var(--gt-overlay)]/50 cursor-pointer transition-colors"
              >
                <span className="text-xs text-[var(--gt-muted)] w-4 text-right flex-shrink-0">{i + 1}</span>
                <img
                  src={g.coverUrl ?? PLACEHOLDER}
                  alt={g.gameName}
                  className="w-8 h-8 rounded object-cover flex-shrink-0 bg-[var(--gt-overlay)]"
                  onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                />
                <p className="flex-1 text-sm text-[var(--gt-text)] truncate">{g.gameName}</p>
                <span className="text-xs text-[var(--gt-sub)] flex-shrink-0">
                  {formatHours(g.totalSecs)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Streak */}
      <div className="flex gap-3">
        <div className="flex-1 flex items-center gap-3 bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg px-4 py-3">
          <span className="text-2xl">🔥</span>
          <div>
            <p className="text-xl font-bold text-[var(--gt-orange)]">{stats?.currentStreak ?? 0}d</p>
            <p className="text-[10px] text-[var(--gt-muted)]">Current Streak</p>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-3 bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg px-4 py-3">
          <span className="text-2xl">🏆</span>
          <div>
            <p className="text-xl font-bold text-[var(--gt-yellow)]">{stats?.longestStreak ?? 0}d</p>
            <p className="text-[10px] text-[var(--gt-muted)]">Longest Streak</p>
          </div>
        </div>
      </div>

      {/* Per-game streaks */}
      {gameStreaks && gameStreaks.length > 0 && (
        <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-4">
          <h2 className="text-sm font-semibold text-[var(--gt-text)] mb-3">Game Streaks</h2>
          <div className="space-y-2">
            {gameStreaks.map((g) => (
              <div
                key={g.gameId}
                onClick={() => navigate(`/library/${g.gameId}`)}
                className="flex items-center gap-3 p-2 rounded hover:bg-[var(--gt-overlay)]/50 cursor-pointer transition-colors"
              >
                <span className="text-lg w-6 text-center">{g.currentStreak > 0 ? "🔥" : "🏆"}</span>
                <p className="flex-1 text-sm text-[var(--gt-text)] truncate">{g.gameName}</p>
                <div className="flex items-center gap-3 text-xs flex-shrink-0">
                  {g.currentStreak > 0 && (
                    <span className="text-[var(--gt-orange)] font-medium">{g.currentStreak}d streak</span>
                  )}
                  <span className="text-[var(--gt-muted)]">best {g.longestStreak}d</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent achievements */}
      {achievements && achievements.length > 0 && (
        <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-4">
          <h2 className="text-sm font-semibold text-[var(--gt-text)] mb-3">Recent Achievements</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {achievements.slice(0, 4).map((a) => (
              <AchievementBadge key={a.id} achievement={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  const borders: Record<string, string> = {
    blue: "border-[var(--gt-blue)]/30",
    purple: "border-[var(--gt-accent)]/30",
    orange: "border-[var(--gt-orange)]/30",
    green: "border-[var(--gt-green)]/30",
    yellow: "border-[var(--gt-yellow)]/30",
  };

  return (
    <div
      className={`bg-[var(--gt-surface)] rounded-lg border p-4 ${borders[color] ?? "border-[var(--gt-overlay)]"}`}
    >
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-[var(--gt-sub)]">{label}</span></div>
      <p className="text-2xl font-bold text-[var(--gt-text)] truncate">{value}</p>
      <p className="text-xs text-[var(--gt-muted)] mt-0.5">{sub}</p>
    </div>
  );
}
