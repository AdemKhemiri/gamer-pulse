import { Achievement } from "../../api/client";
import { formatDate } from "../../utils/format";

const ICONS: Record<string, string> = {
  first_hour: "⏱️",
  ten_hours: "🎯",
  fifty_hours: "🏆",
  hundred_hours: "💎",
  night_owl: "🦉",
  collector: "📚",
  marathon: "🏃",
  dedicated_streak: "🔥",
  speed_runner: "⚡",
  early_bird: "🌅",
  variety_pack: "🎮",
  game_hoarder: "🗄️",
  total_100h: "💯",
  total_500h: "😤",
};

interface Props {
  achievement: Achievement;
  small?: boolean;
}

export default function AchievementBadge({ achievement, small }: Props) {
  const icon = ICONS[achievement.badgeKey] ?? "🏅";

  if (small) {
    return (
      <div
        title={`${achievement.badgeLabel} — ${achievement.badgeDescription}`}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--gt-overlay)] text-lg"
      >
        {icon}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--gt-surface)] border border-[var(--gt-overlay)]">
      <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--gt-overlay)] text-xl flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--gt-text)]">{achievement.badgeLabel}</p>
        {achievement.gameName && (
          <p className="text-xs text-[var(--gt-accent)] truncate">{achievement.gameName}</p>
        )}
        <p className="text-xs text-[var(--gt-muted)]">{achievement.badgeDescription}</p>
        <p className="text-xs text-[var(--gt-hover)] mt-0.5">{formatDate(achievement.earnedAt)}</p>
      </div>
    </div>
  );
}
