import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { getHeatmap, getDailyPlaytime, getTopGames, getStreak } from "../api/client";
import HeatmapCalendar from "../components/stats/HeatmapCalendar";
import StreakBadge from "../components/stats/StreakBadge";
import { formatHours } from "../utils/format";

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

  const chartData = daily?.map((d) => ({
    day: d.day.slice(5), // MM-DD
    hours: Math.round((d.totalSecs / 3600) * 10) / 10,
  })) ?? [];

  const maxSecs = Math.max(...(topGames?.map((g) => g.totalSecs) ?? [1]));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--gt-text)]">Stats</h1>
        <p className="text-sm text-[var(--gt-muted)] mt-1">Your gaming statistics over time</p>
      </div>

      {/* Streak section */}
      <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-5">
        <h2 className="text-sm font-semibold text-[var(--gt-text)] mb-4">Day Streak</h2>
        <div className="flex items-center gap-8">
          <div>
            <p className="text-xs text-[var(--gt-muted)] mb-1">Current</p>
            <StreakBadge streak={streak?.currentStreak ?? 0} size="lg" />
          </div>
          <div className="h-12 w-px bg-[var(--gt-overlay)]" />
          <div>
            <p className="text-xs text-[var(--gt-muted)] mb-1">Longest</p>
            <StreakBadge streak={streak?.longestStreak ?? 0} size="md" />
          </div>
          {streak?.lastPlayedDate && (
            <>
              <div className="h-12 w-px bg-[var(--gt-overlay)]" />
              <div>
                <p className="text-xs text-[var(--gt-muted)] mb-1">Last Played</p>
                <p className="text-sm font-medium text-[var(--gt-text)]">{streak.lastPlayedDate}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Playtime trend */}
      <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--gt-text)]">Playtime Trend</h2>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-[var(--gt-overlay)] border-none rounded px-2 py-1 text-xs text-[var(--gt-text)] focus:outline-none"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
        {chartData.length === 0 ? (
          <p className="text-sm text-[var(--gt-muted)] py-8 text-center">No data for this period</p>
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
                contentStyle={{ background: "var(--gt-surface)", border: "1px solid var(--gt-overlay)", borderRadius: 8 }}
                labelStyle={{ color: "var(--gt-sub)", fontSize: 12 }}
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

      {/* Top games */}
      <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-5">
        <h2 className="text-sm font-semibold text-[var(--gt-text)] mb-4">Most Played Games</h2>
        <div className="space-y-2">
          {topGames?.map((g) => (
            <div key={g.gameId} className="flex items-center gap-3">
              <span className="text-xs text-[var(--gt-sub)] w-28 truncate flex-shrink-0">{g.gameName}</span>
              <div className="flex-1 bg-[var(--gt-overlay)] rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--gt-accent)]"
                  style={{ width: `${(g.totalSecs / maxSecs) * 100}%` }}
                />
              </div>
              <span className="text-xs text-[var(--gt-muted)] w-12 text-right flex-shrink-0">
                {formatHours(g.totalSecs)}
              </span>
            </div>
          ))}
          {(!topGames || topGames.length === 0) && (
            <p className="text-sm text-[var(--gt-muted)]">No playtime recorded yet.</p>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--gt-text)]">Activity Heatmap</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="text-[var(--gt-muted)] hover:text-[var(--gt-text)] px-2 py-1 text-sm"
            >
              ‹
            </button>
            <span className="text-sm text-[var(--gt-sub)]">{year}</span>
            <button
              onClick={() => setYear((y) => Math.min(y + 1, CURRENT_YEAR))}
              className="text-[var(--gt-muted)] hover:text-[var(--gt-text)] px-2 py-1 text-sm"
            >
              ›
            </button>
          </div>
        </div>
        <HeatmapCalendar data={heatmap ?? []} year={year} />
      </div>
    </div>
  );
}
