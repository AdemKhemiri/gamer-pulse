export function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatHours(secs: number): string {
  const h = secs / 3600;
  if (h < 1) return `${Math.round(secs / 60)}m`;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    steam: "Steam",
    epic: "Epic",
    gog: "GOG",
    xbox: "Xbox",
    riot: "Riot",
    manual: "Manual",
  };
  return map[source] ?? source;
}

export function sourceColor(source: string): string {
  const map: Record<string, string> = {
    steam: "#1b9ae4",
    epic: "#2c2c2c",
    gog: "#a05fb0",
    xbox: "#107c10",
    riot: "#d13639",
    manual: "var(--gt-muted)",
  };
  return map[source] ?? "var(--gt-muted)";
}
