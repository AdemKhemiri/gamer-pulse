import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { getGames, getGameStats } from "../api/client";
import { formatHours, formatDuration, formatDate } from "../utils/format";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='180' viewBox='0 0 120 180'%3E%3Crect fill='%23313244' width='120' height='180'/%3E%3Ctext fill='%236c7086' font-size='40' text-anchor='middle' x='60' y='105'%3E🎮%3C/text%3E%3C/svg%3E";

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

  const gameA = games?.find((g) => g.id === idA);
  const gameB = games?.find((g) => g.id === idB);

  const installed = games?.filter((g) => g.status === "installed") ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--gt-text)] mb-1">Compare Games</h1>
      <p className="text-sm text-[var(--gt-muted)] mb-6">Pick two games to compare their stats side by side.</p>

      {/* Pickers */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {([
          { id: idA, setId: setIdA, stats: statsA, game: gameA, label: "Game A" },
          { id: idB, setId: setIdB, stats: statsB, game: gameB, label: "Game B" },
        ] as const).map(({ id, setId, game, label }) => (
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
              <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-[var(--gt-surface)] border border-[var(--gt-overlay)]">
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

      {/* Comparison table */}
      {gameA && gameB && statsA && statsB && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider">Stats</h2>
          <div className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--gt-overlay)]">
                  <th className="text-left px-4 py-3 text-xs text-[var(--gt-muted)] font-medium w-1/3">Stat</th>
                  <th className="text-center px-4 py-3 text-xs text-[var(--gt-accent)] font-medium w-1/3">{gameA.name}</th>
                  <th className="text-center px-4 py-3 text-xs text-[var(--gt-blue)] font-medium w-1/3">{gameB.name}</th>
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

          {/* Bar comparison for total playtime */}
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
      )}

      {(!gameA || !gameB) && (
        <div className="flex items-center justify-center h-40 text-[var(--gt-muted)] text-sm">
          Select two games above to see the comparison
        </div>
      )}
    </div>
  );
}
