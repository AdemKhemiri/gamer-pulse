import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, CartesianGrid,
} from "recharts";
import { getHeatmap, getDailyPlaytime, getTopGames, getStreak, getRecentSessions } from "../api/client";
import HeatmapCalendar from "../components/stats/HeatmapCalendar";
import StreakBadge from "../components/stats/StreakBadge";
import { formatHours } from "../utils/format";

const PERIOD_COLORS = {
  night:     "#6272a4",   // 00–05  soft indigo
  morning:   "#f9e2af",   // 06–11  warm yellow
  afternoon: "var(--gt-accent)",  // 12–17
  evening:   "#cba6f7",   // 18–23  soft violet
};

function periodColor(hour: number): string {
  if (hour < 6)  return PERIOD_COLORS.night;
  if (hour < 12) return PERIOD_COLORS.morning;
  if (hour < 18) return PERIOD_COLORS.afternoon;
  return PERIOD_COLORS.evening;
}

function hourLabel(h: number): string {
  if (h === 0)  return "12am";
  if (h === 6)  return "6am";
  if (h === 12) return "12pm";
  if (h === 18) return "6pm";
  return "";
}

function fmtHour(h: number): string {
  if (h === 0)  return "12:00 am";
  if (h < 12)  return `${h}:00 am`;
  if (h === 12) return "12:00 pm";
  return `${h - 12}:00 pm`;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function Stats() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [days, setDays] = useState(30);

  const { data: heatmap } = useQuery({
    queryKey: ["heatmap", year],
    queryFn: () => getHeatmap(year),
  });

  const { data: daily } = useQuery({
    queryKey: ["daily", days],
    queryFn: () => getDailyPlaytime(days),
  });

  const { data: topGames } = useQuery({
    queryKey: ["topGames", 10],
    queryFn: () => getTopGames(10),
  });

  const { data: streak } = useQuery({
    queryKey: ["streak"],
    queryFn: getStreak,
  });

  // Fetch all sessions for the time-of-day breakdown (large limit = effectively all)
  const { data: allSessions } = useQuery({
    queryKey: ["allSessions"],
    queryFn: () => getRecentSessions(99999),
  });

  const hourData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: hourLabel(h),
      sessions: 0,
      hours: 0,
    }));
    for (const s of allSessions ?? []) {
      if (!s.durationSecs) continue;
      const h = new Date(s.startedAt).getHours();
      buckets[h].sessions += 1;
      buckets[h].hours += s.durationSecs / 3600;
    }
    return buckets.map((b) => ({ ...b, hours: Math.round(b.hours * 10) / 10 }));
  }, [allSessions]);

  const chartData = daily?.map((d) => ({
    day: d.day.slice(5), // MM-DD
    hours: Math.round((d.totalSecs / 3600) * 10) / 10,
  })) ?? [];

  const maxSecs = Math.max(...(topGames?.map((g) => g.totalSecs) ?? [1]));

  return (
    <div className="h-full overflow-auto">
      <div className="fixed inset-0 z-0" style={{ background: "#050505" }} />
      <div className="relative z-10 p-6 max-w-4xl mx-auto space-y-6">
      <div className="animate-ps5-fade">
        <p className="text-xs text-white/35 uppercase tracking-[0.15em] mb-1">Analytics</p>
        <h1 className="text-3xl font-bold text-white">Stats</h1>
        <p className="text-sm text-white/40 mt-1">Your gaming statistics over time</p>
      </div>

      {/* Streak section */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold mb-4">Day Streak</h2>
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-white/35 mb-1">Current</p>
            <StreakBadge streak={streak?.currentStreak ?? 0} size="lg" />
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div>
            <p className="text-xs text-white/35 mb-1">Longest</p>
            <StreakBadge streak={streak?.longestStreak ?? 0} size="md" />
          </div>
          {streak?.lastPlayedDate && (
            <>
              <div className="h-12 w-px bg-white/10" />
              <div>
                <p className="text-xs text-white/35 mb-1">Last Played</p>
                <p className="text-sm font-medium text-white">{streak.lastPlayedDate}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Playtime trend */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold">Playtime Trend</h2>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg px-2 py-1 text-xs text-white focus:outline-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
        {chartData.length === 0 ? (
          <p className="text-sm text-white/30 py-8 text-center">No data for this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="playGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--gt-accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--gt-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fill: "var(--gt-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "var(--gt-muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(1)}h`, "Playtime"]}
                contentStyle={{ background: "rgba(15,15,20,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 }}
                labelStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}
                itemStyle={{ color: "var(--gt-accent)", fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="hours"
                stroke="var(--gt-accent)"
                strokeWidth={2}
                fill="url(#playGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Time-of-day breakdown */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold mb-1">Time of Day</h2>
        <p className="text-xs text-white/30 mb-4">When you typically start a session</p>

        {(allSessions?.length ?? 0) === 0 ? (
          <p className="text-sm text-white/30 py-8 text-center">No sessions recorded yet</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={hourData} barCategoryGap="15%" margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <CartesianGrid vertical={false} stroke="var(--gt-overlay)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="hour"
                  tickFormatter={hourLabel}
                  tick={{ fill: "var(--gt-muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: "var(--gt-muted)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}h`}
                  width={28}
                />
                <Tooltip
                  cursor={{ fill: "var(--gt-overlay)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof hourData)[number];
                    return (
                      <div className="rounded-xl px-3 py-2 text-xs shadow-lg" style={{ background: "rgba(15,15,20,0.95)", border: "1px solid rgba(255,255,255,0.12)" }}>
                        <p className="text-white/50 mb-1">{fmtHour(d.hour)}</p>
                        <p style={{ color: periodColor(d.hour) }} className="font-medium">{d.hours}h played</p>
                        <p className="text-white/35">{d.sessions} session{d.sessions !== 1 ? "s" : ""}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="hours" radius={[3, 3, 0, 0]}>
                  {hourData.map((entry) => (
                    <Cell key={entry.hour} fill={periodColor(entry.hour)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Period legend */}
            <div className="flex items-center gap-5 mt-3 justify-center flex-wrap">
              {([
                { label: "Night",     range: "12am–6am",  color: PERIOD_COLORS.night },
                { label: "Morning",   range: "6am–12pm",  color: PERIOD_COLORS.morning },
                { label: "Afternoon", range: "12pm–6pm",  color: PERIOD_COLORS.afternoon },
                { label: "Evening",   range: "6pm–12am",  color: PERIOD_COLORS.evening },
              ] as const).map(({ label, range, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
                  <span className="text-[10px] text-white/55">{label}</span>
                  <span className="text-[10px] text-white/30">({range})</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Top games */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold mb-4">Most Played Games</h2>
        <div className="space-y-2">
          {topGames?.map((g) => (
            <div key={g.gameId} className="flex items-center gap-3">
              <span className="text-xs text-white/55 w-28 truncate flex-shrink-0">{g.gameName}</span>
              <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full bg-[var(--gt-accent)]"
                  style={{ width: `${(g.totalSecs / maxSecs) * 100}%` }}
                />
              </div>
              <span className="text-xs text-white/35 w-12 text-right flex-shrink-0">
                {formatHours(g.totalSecs)}
              </span>
            </div>
          ))}
          {(!topGames || topGames.length === 0) && (
            <p className="text-sm text-white/30">No playtime recorded yet.</p>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold">Activity Heatmap</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setYear((y) => y - 1)} className="text-white/40 hover:text-white px-2 py-1 text-sm cursor-pointer">‹</button>
            <span className="text-sm text-white/60">{year}</span>
            <button onClick={() => setYear((y) => Math.min(y + 1, CURRENT_YEAR))} className="text-white/40 hover:text-white px-2 py-1 text-sm cursor-pointer">›</button>
          </div>
        </div>
        <HeatmapCalendar data={heatmap ?? []} year={year} />
      </div>

      <div className="h-4" />
      </div>
    </div>
  );
}
