import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Clock, Gamepad2, Calendar, Star, Flame, Trophy } from "lucide-react";
import { getGlobalStats, getRecentSessions, getAchievements, getTopGames, getGameStreaks, getGames } from "../api/client";
import { formatHours, formatDuration, formatDate } from "../utils/format";
import { gradientFromName, accentFromName } from "../utils/gameColor";
import AchievementBadge from "../components/stats/AchievementBadge";

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({ queryKey: ["globalStats"], queryFn: getGlobalStats });
  const { data: recentSessions } = useQuery({ queryKey: ["sessions", "recent"], queryFn: () => getRecentSessions(8) });
  const { data: achievements } = useQuery({ queryKey: ["achievements"], queryFn: () => getAchievements() });
  const { data: topGames } = useQuery({ queryKey: ["topGames"], queryFn: () => getTopGames(5) });
  const { data: gameStreaks } = useQuery({ queryKey: ["gameStreaks"], queryFn: () => getGameStreaks(5) });
  const { data: allGames } = useQuery({ queryKey: ["games", { status: "installed" }], queryFn: () => getGames({ status: "installed" }) });

  // Build a quick gameId → coverUrl lookup from the games list
  const coverMap = new Map<string, string | undefined>(
    (allGames ?? []).map((g) => [g.id, g.coverUrl])
  );

  const maxPlaySecs = topGames?.[0]?.totalSecs ?? 1;

  return (
    <div className="h-full overflow-auto">
      {/* Background */}
      <div className="fixed inset-0 z-0" style={{ background: "radial-gradient(ellipse at 60% 0%, rgba(80,40,120,0.18) 0%, transparent 60%), radial-gradient(ellipse at 0% 80%, rgba(30,60,120,0.12) 0%, transparent 60%), #050505" }} />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* ── Hero header ── */}
        <div className="animate-ps5-fade">
          <p className="text-xs text-white/35 uppercase tracking-[0.15em] mb-1">Overview</p>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-white/40 mt-1">Your gaming activity at a glance</p>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<Clock size={16} className="text-blue-400" />}
            label="Total Playtime"
            value={stats ? formatHours(stats.totalPlaySecs) : "—"}
            sub={`${stats?.totalSessions ?? 0} sessions`}
            accent="rgba(96,165,250,0.15)"
          />
          <StatCard
            icon={<Gamepad2 size={16} className="text-purple-400" />}
            label="Games"
            value={String(stats?.installedGames ?? "—")}
            sub={`${stats?.deletedGames ?? 0} removed`}
            accent="rgba(167,139,250,0.15)"
          />
          <StatCard
            icon={<Star size={16} className="text-yellow-400" />}
            label="Most Played"
            value={stats?.mostPlayedGameName ?? "—"}
            sub={stats?.mostPlayedGameId ? formatHours(stats.totalPlaySecs) + " played" : "no data yet"}
            accent="rgba(250,204,21,0.12)"
          />
          <StatCard
            icon={<Calendar size={16} className="text-green-400" />}
            label="Days Played"
            value={String(stats?.uniqueDaysPlayed ?? "—")}
            sub="unique days"
            accent="rgba(74,222,128,0.12)"
          />
        </div>

        {/* ── Middle row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent sessions */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold mb-4">Recent Sessions</h2>
            {!recentSessions?.length ? (
              <p className="text-sm text-white/25">No sessions yet. Play a game!</p>
            ) : (
              <div className="space-y-1">
                {recentSessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/library/${s.gameId}`)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/6 cursor-pointer transition-colors group"
                  >
                    <div
                      className="w-8 h-10 rounded-lg flex-shrink-0 overflow-hidden"
                      style={{ background: gradientFromName(s.gameName ?? "") }}
                    >
                      {coverMap.get(s.gameId) ? (
                        <img src={coverMap.get(s.gameId)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/60">
                          {(s.gameName ?? "?").charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{s.gameName}</p>
                      <p className="text-xs text-white/35">{formatDate(s.startedAt)}</p>
                    </div>
                    <span className="text-xs text-white/50 flex-shrink-0">
                      {s.durationSecs ? formatDuration(s.durationSecs) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Most played */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold mb-4">Most Played</h2>
            {!topGames?.length ? (
              <p className="text-sm text-white/25">No playtime recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {topGames.map((g, i) => (
                  <div
                    key={g.gameId}
                    onClick={() => navigate(`/library/${g.gameId}`)}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <span className="text-xs text-white/25 w-4 text-right flex-shrink-0 font-medium">{i + 1}</span>
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                      {g.coverUrl ? (
                        <img src={g.coverUrl} alt={g.gameName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/50"
                          style={{ background: gradientFromName(g.gameName) }}>
                          {g.gameName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate group-hover:text-white/80 transition-colors">{g.gameName}</p>
                      <div
                        className="mt-1 h-1 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.round((g.totalSecs / maxPlaySecs) * 100)}%`,
                            background: accentFromName(g.gameName),
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-white/50 flex-shrink-0 w-10 text-right">
                      {formatHours(g.totalSecs)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Streak row ── */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,160,50,0.15)" }}
          >
            <Flame size={22} className="text-orange-400 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold text-orange-400">{stats?.currentStreak ?? 0}d</p>
              <p className="text-[11px] text-white/35 mt-0.5">Current Streak</p>
            </div>
          </div>
          <div
            className="rounded-2xl px-5 py-4 flex items-center gap-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(250,204,21,0.15)" }}
          >
            <Trophy size={22} className="text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-2xl font-bold text-yellow-400">{stats?.longestStreak ?? 0}d</p>
              <p className="text-[11px] text-white/35 mt-0.5">Longest Streak</p>
            </div>
          </div>
        </div>

        {/* ── Game streaks ── */}
        {gameStreaks && gameStreaks.length > 0 && (
          <div
            className="rounded-2xl p-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold mb-4">Game Streaks</h2>
            <div className="space-y-1">
              {gameStreaks.map((g) => (
                <div
                  key={g.gameId}
                  onClick={() => navigate(`/library/${g.gameId}`)}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/6 cursor-pointer transition-colors"
                >
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {g.currentStreak > 0
                      ? <Flame size={14} className="text-orange-400" />
                      : <Trophy size={14} className="text-yellow-400" />}
                  </div>
                  <p className="flex-1 text-sm text-white truncate">{g.gameName}</p>
                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                    {g.currentStreak > 0 && (
                      <span className="text-orange-400 font-medium">{g.currentStreak}d streak</span>
                    )}
                    <span className="text-white/30">best {g.longestStreak}d</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Achievements ── */}
        {achievements && achievements.length > 0 && (
          <div
            className="rounded-2xl p-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold mb-4">Recent Achievements</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {achievements.slice(0, 4).map((a) => (
                <AchievementBadge key={a.id} achievement={a} />
              ))}
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 animate-ps5-fade"
      style={{ background: `linear-gradient(135deg, ${accent} 0%, rgba(255,255,255,0.03) 100%)`, border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-2 mb-3">{icon}<span className="text-xs text-white/40">{label}</span></div>
      <p className="text-xl font-bold text-white leading-tight break-words line-clamp-2">{value}</p>
      <p className="text-xs text-white/30 mt-1">{sub}</p>
    </div>
  );
}
