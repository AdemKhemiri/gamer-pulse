import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { getGames, getGameStats, getSessions } from "../api/client";
import type { Session } from "../api/client";
import { formatHours, formatDuration, formatDate } from "../utils/format";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='180' viewBox='0 0 120 180'%3E%3Crect fill='%23313244' width='120' height='180'/%3E%3Ctext fill='%236c7086' font-size='40' text-anchor='middle' x='60' y='105'%3E🎮%3C/text%3E%3C/svg%3E";

// Normalize value to 0–100 relative to max of two values
function norm(val: number, max: number) {
  return max > 0 ? Math.round((val / max) * 100) : 0;
}

// Group sessions by ISO week start (Monday) or month based on date span
function groupByPeriod(
  sessionsA: Session[],
  sessionsB: Session[],
): Array<{ label: string; A: number; B: number }> {
  const allDates = [...sessionsA, ...sessionsB]
    .map((s) => new Date(s.startedAt).getTime())
    .filter(Boolean);

  if (allDates.length === 0) return [];

  const minTs = Math.min(...allDates);
  const maxTs = Math.max(...allDates);
  const spanDays = (maxTs - minTs) / 86_400_000;

  // Use months if span > 180 days, else weeks
  const useMonths = spanDays > 180;

  const keyOf = (iso: string): string => {
    const d = new Date(iso);
    if (useMonths) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    // ISO week start (Monday)
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    mon.setHours(0, 0, 0, 0);
    return mon.toISOString().slice(0, 10);
  };

  const labelOf = (key: string): string => {
    if (useMonths) {
      const [y, m] = key.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      });
    }
    const d = new Date(key);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const map = new Map<string, { A: number; B: number }>();

  const add = (sessions: Session[], slot: "A" | "B") => {
    for (const s of sessions) {
      if (!s.durationSecs) continue;
      const key = keyOf(s.startedAt);
      const entry = map.get(key) ?? { A: 0, B: 0 };
      entry[slot] += s.durationSecs / 3600;
      map.set(key, entry);
    }
  };

  add(sessionsA, "A");
  add(sessionsB, "B");

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vals]) => ({
      label: labelOf(key),
      A: Math.round(vals.A * 10) / 10,
      B: Math.round(vals.B * 10) / 10,
    }));
}

// Custom tooltip for the session timeline
function TimelineTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-[var(--gt-muted)] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}h
        </p>
      ))}
    </div>
  );
}

// Custom tooltip for the radar chart
function RadarTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg px-3 py-2 text-xs shadow-lg">
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function Compare() {
  const navigate = useNavigate();
  const [idA, setIdA] = useState<string>("");
  const [idB, setIdB] = useState<string>("");

  const { data: games } = useQuery({
    queryKey: ["games"],
    queryFn: () => getGames({}),
  });

  const { data: statsA } = useQuery({
    queryKey: ["gameStats", idA],
    queryFn: () => getGameStats(idA),
    enabled: !!idA,
  });

  const { data: statsB } = useQuery({
    queryKey: ["gameStats", idB],
    queryFn: () => getGameStats(idB),
    enabled: !!idB,
  });

  const { data: sessionsA } = useQuery({
    queryKey: ["sessions", idA],
    queryFn: () => getSessions(idA),
    enabled: !!idA,
  });

  const { data: sessionsB } = useQuery({
    queryKey: ["sessions", idB],
    queryFn: () => getSessions(idB),
    enabled: !!idB,
  });

  const gameA = games?.find((g) => g.id === idA);
  const gameB = games?.find((g) => g.id === idB);

  const installed = games?.filter((g) => g.status === "installed") ?? [];

  // Radar chart data — normalized per metric so shape reflects relative dominance
  const radarData = useMemo(() => {
    if (!statsA || !statsB) return [];
    return [
      { metric: "Playtime", A: norm(statsA.totalSecs, Math.max(statsA.totalSecs, statsB.totalSecs, 1)), B: norm(statsB.totalSecs, Math.max(statsA.totalSecs, statsB.totalSecs, 1)) },
      { metric: "Sessions", A: norm(statsA.sessionCount, Math.max(statsA.sessionCount, statsB.sessionCount, 1)), B: norm(statsB.sessionCount, Math.max(statsA.sessionCount, statsB.sessionCount, 1)) },
      { metric: "Avg Session", A: norm(statsA.avgSessionSecs, Math.max(statsA.avgSessionSecs, statsB.avgSessionSecs, 1)), B: norm(statsB.avgSessionSecs, Math.max(statsA.avgSessionSecs, statsB.avgSessionSecs, 1)) },
      { metric: "Longest", A: norm(statsA.longestSessionSecs, Math.max(statsA.longestSessionSecs, statsB.longestSessionSecs, 1)), B: norm(statsB.longestSessionSecs, Math.max(statsA.longestSessionSecs, statsB.longestSessionSecs, 1)) },
      { metric: "Best Streak", A: norm(statsA.longestStreak, Math.max(statsA.longestStreak, statsB.longestStreak, 1)), B: norm(statsB.longestStreak, Math.max(statsA.longestStreak, statsB.longestStreak, 1)) },
    ];
  }, [statsA, statsB]);

  // Session timeline data
  const timelineData = useMemo(() => {
    if (!sessionsA || !sessionsB) return [];
    return groupByPeriod(sessionsA, sessionsB);
  }, [sessionsA, sessionsB]);

  const nameA = gameA?.name ?? "Game A";
  const nameB = gameB?.name ?? "Game B";

  const bothReady = !!(gameA && gameB && statsA && statsB);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--gt-text)] mb-1">Compare Games</h1>
      <p className="text-sm text-[var(--gt-muted)] mb-6">Pick two games to compare their stats side by side.</p>

      {/* Pickers */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {([
          { id: idA, setId: setIdA, game: gameA, label: "Game A", color: "var(--gt-accent)" },
          { id: idB, setId: setIdB, game: gameB, label: "Game B", color: "var(--gt-blue)" },
        ] as const).map(({ id, setId, game, label, color }) => (
          <div key={label}>
            <label className="text-xs text-[var(--gt-sub)] mb-1 block">{label}</label>
            <select
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md px-3 py-2 text-sm text-[var(--gt-text)] focus:outline-none focus:border-[var(--gt-accent)]"
            >
              <option value="">— Select a game —</option>
              {installed.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            {game && (
              <div
                className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-[var(--gt-surface)] border border-[var(--gt-overlay)]"
                style={{ borderLeftColor: color, borderLeftWidth: 3 }}
              >
                <img
                  src={game.coverUrl ?? PLACEHOLDER}
                  alt={game.name}
                  className="w-10 h-14 object-cover rounded flex-shrink-0"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER; }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--gt-text)] truncate">{game.name}</p>
                  <button
                    onClick={() => navigate(`/library/${game.id}`)}
                    className="flex items-center gap-1 text-[10px] text-[var(--gt-muted)] hover:text-[var(--gt-accent)] mt-0.5 transition-colors"
                  >
                    <ExternalLink size={10} /> View detail
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {bothReady ? (
        <div className="space-y-6">

          {/* ── Radar chart ─────────────────────────────────────────────────── */}
          <div className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg p-4">
            <p className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-4">Stat radar</p>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                  <PolarGrid stroke="var(--gt-overlay)" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fill: "var(--gt-muted)", fontSize: 11 }}
                  />
                  <Radar
                    name={nameA}
                    dataKey="A"
                    stroke="var(--gt-accent)"
                    fill="var(--gt-accent)"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                  <Radar
                    name={nameB}
                    dataKey="B"
                    stroke="var(--gt-blue)"
                    fill="var(--gt-blue)"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                  <Tooltip content={<RadarTooltip />} />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-[var(--gt-text)]">{value}</span>
                    )}
                  />
                </RadarChart>
              </ResponsiveContainer>

              {/* Legend / score breakdown */}
              <div className="flex-shrink-0 w-full sm:w-48 space-y-2">
                {radarData.map(({ metric, A, B }) => (
                  <div key={metric}>
                    <div className="flex justify-between text-[10px] text-[var(--gt-muted)] mb-0.5">
                      <span>{metric}</span>
                      <span>
                        <span style={{ color: "var(--gt-accent)" }}>{A}</span>
                        {" vs "}
                        <span style={{ color: "var(--gt-blue)" }}>{B}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-[var(--gt-overlay)] rounded-full overflow-hidden flex">
                      <div
                        className="h-full rounded-l-full transition-all duration-500"
                        style={{ width: `${A / 2}%`, background: "var(--gt-accent)" }}
                      />
                      <div className="flex-1" />
                      <div
                        className="h-full rounded-r-full transition-all duration-500"
                        style={{ width: `${B / 2}%`, background: "var(--gt-blue)" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Session timeline ─────────────────────────────────────────────── */}
          {timelineData.length > 0 && (
            <div className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg p-4">
              <p className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-4">
                Session timeline
                <span className="ml-2 font-normal normal-case text-[var(--gt-muted)]">
                  (hours per {timelineData.length > 26 ? "month" : "week"})
                </span>
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={timelineData} barCategoryGap="30%" barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--gt-overlay)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--gt-muted)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "var(--gt-muted)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    unit="h"
                    width={30}
                  />
                  <Tooltip content={<TimelineTooltip />} cursor={{ fill: "var(--gt-overlay)", opacity: 0.4 }} />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-[var(--gt-text)]">{value}</span>
                    )}
                  />
                  <Bar dataKey="A" name={nameA} fill="var(--gt-accent)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="B" name={nameB} fill="var(--gt-blue)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Stats table ──────────────────────────────────────────────────── */}
          <div>
            <h2 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider mb-3">Stats</h2>
            <div className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--gt-overlay)]">
                    <th className="text-left px-4 py-3 text-xs text-[var(--gt-muted)] font-medium w-1/3">Stat</th>
                    <th className="text-center px-4 py-3 text-xs text-[var(--gt-accent)] font-medium w-1/3">{nameA}</th>
                    <th className="text-center px-4 py-3 text-xs text-[var(--gt-blue)] font-medium w-1/3">{nameB}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Total Playtime",
                      a: formatHours(statsA.totalSecs),
                      b: formatHours(statsB.totalSecs),
                      aVal: statsA.totalSecs,
                      bVal: statsB.totalSecs,
                    },
                    {
                      label: "Sessions",
                      a: String(statsA.sessionCount),
                      b: String(statsB.sessionCount),
                      aVal: statsA.sessionCount,
                      bVal: statsB.sessionCount,
                    },
                    {
                      label: "Avg Session",
                      a: statsA.avgSessionSecs ? formatDuration(statsA.avgSessionSecs) : "—",
                      b: statsB.avgSessionSecs ? formatDuration(statsB.avgSessionSecs) : "—",
                      aVal: statsA.avgSessionSecs,
                      bVal: statsB.avgSessionSecs,
                    },
                    {
                      label: "Longest Session",
                      a: statsA.longestSessionSecs ? formatDuration(statsA.longestSessionSecs) : "—",
                      b: statsB.longestSessionSecs ? formatDuration(statsB.longestSessionSecs) : "—",
                      aVal: statsA.longestSessionSecs,
                      bVal: statsB.longestSessionSecs,
                    },
                    {
                      label: "Current Streak",
                      a: `${statsA.currentStreak}d`,
                      b: `${statsB.currentStreak}d`,
                      aVal: statsA.currentStreak,
                      bVal: statsB.currentStreak,
                    },
                    {
                      label: "Longest Streak",
                      a: `${statsA.longestStreak}d`,
                      b: `${statsB.longestStreak}d`,
                      aVal: statsA.longestStreak,
                      bVal: statsB.longestStreak,
                    },
                    {
                      label: "First Played",
                      a: statsA.firstPlayedAt ? formatDate(statsA.firstPlayedAt) : "—",
                      b: statsB.firstPlayedAt ? formatDate(statsB.firstPlayedAt) : "—",
                      aVal: 0,
                      bVal: 0,
                    },
                    {
                      label: "Last Played",
                      a: statsA.lastPlayedAt ? formatDate(statsA.lastPlayedAt) : "—",
                      b: statsB.lastPlayedAt ? formatDate(statsB.lastPlayedAt) : "—",
                      aVal: 0,
                      bVal: 0,
                    },
                  ].map(({ label, a, b, aVal, bVal }, i) => {
                    const aWins = aVal > bVal;
                    const bWins = bVal > aVal;
                    return (
                      <tr key={label} className={i % 2 === 0 ? "bg-[var(--gt-base)]/40" : ""}>
                        <td className="px-4 py-3 text-xs text-[var(--gt-muted)]">{label}</td>
                        <td className={`px-4 py-3 text-center font-medium ${aWins ? "text-[var(--gt-accent)]" : "text-[var(--gt-text)]"}`}>
                          {aWins && <span className="text-[var(--gt-accent)] mr-1">▲</span>}{a}
                        </td>
                        <td className={`px-4 py-3 text-center font-medium ${bWins ? "text-[var(--gt-blue)]" : "text-[var(--gt-text)]"}`}>
                          {bWins && <span className="text-[var(--gt-blue)] mr-1">▲</span>}{b}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Playtime bar ─────────────────────────────────────────────────── */}
          <div className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg p-4">
            <p className="text-xs text-[var(--gt-muted)] mb-3">Playtime comparison</p>
            {[
              { game: gameA, secs: statsA.totalSecs, color: "var(--gt-accent)" },
              { game: gameB, secs: statsB.totalSecs, color: "var(--gt-blue)" },
            ].map(({ game, secs, color }) => {
              const max = Math.max(statsA.totalSecs, statsB.totalSecs, 1);
              const pct = (secs / max) * 100;
              return (
                <div key={game.id} className="mb-3 last:mb-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color }} className="font-medium truncate max-w-[60%]">{game.name}</span>
                    <span className="text-[var(--gt-sub)]">{formatHours(secs)}</span>
                  </div>
                  <div className="h-2 bg-[var(--gt-overlay)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-40 text-[var(--gt-muted)] text-sm">
          Select two games above to see the comparison
        </div>
      )}
    </div>
  );
}
