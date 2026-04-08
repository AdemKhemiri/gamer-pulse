interface Props {
  streak: number;
  label?: string;
  size?: "sm" | "md" | "lg";
}

export default function StreakBadge({ streak, label = "day streak", size = "md" }: Props) {
  const isEmpty = streak === 0;

  const sizes = {
    sm: { flame: "text-lg", num: "text-xl", text: "text-xs" },
    md: { flame: "text-2xl", num: "text-3xl", text: "text-sm" },
    lg: { flame: "text-4xl", num: "text-5xl", text: "text-base" },
  };

  const s = sizes[size];

  return (
    <div className="flex items-center gap-2">
      <span className={`${s.flame} ${isEmpty ? "grayscale opacity-40" : ""}`}>🔥</span>
      <div>
        <span className={`${s.num} font-bold ${isEmpty ? "text-[var(--gt-muted)]" : "text-[var(--gt-orange)]"}`}>
          {streak}
        </span>
        <span className={`${s.text} text-[var(--gt-sub)] ml-1`}>{label}</span>
      </div>
    </div>
  );
}
