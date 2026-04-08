import { useMemo } from "react";
import { HeatmapEntry } from "../../api/client";

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "No playtime";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  data: HeatmapEntry[];
  year: number;
}

function getDaysInYear(year: number) {
  const days: Date[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function intensityColor(minutes: number): string {
  if (minutes === 0) return "var(--gt-overlay)";
  if (minutes < 30) return "#4c4082";
  if (minutes < 60) return "#6e5aaf";
  if (minutes < 120) return "#9370db";
  if (minutes < 240) return "#b388ff";
  return "var(--gt-accent)";
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function HeatmapCalendar({ data, year }: Props) {
  const dataMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data) m.set(e.day, e.minutes);
    return m;
  }, [data]);

  const days = useMemo(() => getDaysInYear(year), [year]);

  // Group into weeks (columns)
  const firstDayOfYear = days[0].getDay(); // 0=Sun
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(firstDayOfYear).fill(null);

  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <div className="overflow-x-auto">
      {/* Month labels */}
      <div className="flex gap-[3px] mb-1 ml-[18px]">
        {weeks.map((w, i) => {
          const firstDay = w.find((d) => d !== null);
          if (!firstDay) return <div key={i} className="w-[12px]" />;
          const isFirstWeekOfMonth = firstDay.getDate() <= 7;
          return (
            <div key={i} className="w-[12px] text-[9px] text-[var(--gt-muted)]">
              {isFirstWeekOfMonth ? MONTHS[firstDay.getMonth()] : ""}
            </div>
          );
        })}
      </div>

      <div className="flex gap-[3px]">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] mr-1">
          {["", "M", "", "W", "", "F", ""].map((d, i) => (
            <div key={i} className="h-[12px] w-[10px] text-[9px] text-[var(--gt-muted)] flex items-center">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {w.map((day, di) => {
              if (!day) {
                return <div key={di} className="w-[12px] h-[12px]" />;
              }
              const iso = day.toISOString().slice(0, 10);
              const minutes = dataMap.get(iso) ?? 0;
              return (
                <div
                  key={di}
                  className="w-[12px] h-[12px] rounded-sm cursor-default"
                  style={{ background: intensityColor(minutes) }}
                  title={`${day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}: ${formatMinutes(minutes)}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 ml-[18px]">
        <span className="text-[10px] text-[var(--gt-muted)]">Less</span>
        {([
          [0,    "None"],
          [15,   "<30m"],
          [45,   "<1h"],
          [90,   "<2h"],
          [180,  "<4h"],
          [300,  "4h+"],
        ] as [number, string][]).map(([m, label]) => (
          <div key={m} className="flex items-center gap-1" title={label}>
            <div
              className="w-[12px] h-[12px] rounded-sm flex-shrink-0"
              style={{ background: intensityColor(m) }}
            />
            <span className="text-[9px] text-[var(--gt-muted)]">{label}</span>
          </div>
        ))}
        <span className="text-[10px] text-[var(--gt-muted)]">More</span>
      </div>
    </div>
  );
}
