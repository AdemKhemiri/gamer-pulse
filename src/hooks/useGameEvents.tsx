import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useUiStore } from "../store/uiStore";
import { formatDuration } from "../utils/format";

/** Emoji icons keyed by badge_key — must stay in sync with BADGE_CATALOGUE in session_recorder.rs */
const BADGE_ICONS: Record<string, string> = {
  first_hour:       "⏱️",
  ten_hours:        "🎯",
  fifty_hours:      "🏆",
  hundred_hours:    "💎",
  night_owl:        "🦉",
  collector:        "📚",
  marathon:         "🏃",
  dedicated_streak: "🔥",
  speed_runner:     "⚡",
  early_bird:       "🌅",
  variety_pack:     "🎮",
  game_hoarder:     "🗄️",
  total_100h:       "💯",
  total_500h:       "😤",
};

interface AchievementPayload {
  gameId: string;
  gameName: string;
  badgeKey: string;
  badgeLabel: string;
  badgeDescription: string;
}

export function useGameEvents() {
  const queryClient = useQueryClient();
  const setCurrentlyPlaying = useUiStore((s) => s.setCurrentlyPlaying);
  const setScanProgress = useUiStore((s) => s.setScanProgress);

  useEffect(() => {
    const unlisten: Array<() => void> = [];

    listen<{ gameId: string }>("game:started", (event) => {
      setCurrentlyPlaying(event.payload.gameId);
      queryClient.invalidateQueries({ queryKey: ["games"] });
    }).then((u) => unlisten.push(u));

    listen<{ gameId: string; durationSecs?: number }>("game:stopped", (event) => {
      setCurrentlyPlaying(null);
      const { gameId, durationSecs } = event.payload;
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["game", gameId] });
      queryClient.invalidateQueries({ queryKey: ["globalStats"] });
      queryClient.invalidateQueries({ queryKey: ["streak"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      if (durationSecs && durationSecs > 0) {
        toast.success(`Session saved: ${formatDuration(durationSecs)}`);
      }
    }).then((u) => unlisten.push(u));

    listen<{ stage: string; count: number }>("scan:progress", (event) => {
      if (event.payload.stage === "done") {
        setScanProgress(null);
        queryClient.invalidateQueries({ queryKey: ["games"] });
        queryClient.invalidateQueries({ queryKey: ["globalStats"] });
        toast.success("Library scan complete");
      } else {
        setScanProgress(event.payload);
      }
    }).then((u) => unlisten.push(u));

    listen<AchievementPayload>("achievement:unlocked", (event) => {
      const { gameId, gameName, badgeKey, badgeLabel, badgeDescription } = event.payload;
      const icon = BADGE_ICONS[badgeKey] ?? "🏅";

      toast.custom(
        (t) => (
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border transition-all duration-300 ${
              t.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
            style={{
              background: "var(--gt-surface)",
              borderColor: "var(--gt-accent)",
              color: "var(--gt-text)",
              minWidth: 260,
              maxWidth: 340,
            }}
          >
            <span className="text-3xl leading-none flex-shrink-0">{icon}</span>
            <div className="min-w-0">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--gt-accent)" }}
              >
                Achievement Unlocked
              </p>
              <p className="text-sm font-semibold leading-tight" style={{ color: "var(--gt-text)" }}>
                {badgeLabel}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--gt-muted)" }}>
                {gameName} — {badgeDescription}
              </p>
            </div>
          </div>
        ),
        { duration: 6000, position: "bottom-right" },
      );

      // Refresh the achievements panel if the user currently has it open.
      queryClient.invalidateQueries({ queryKey: ["achievements", gameId] });
      queryClient.invalidateQueries({ queryKey: ["achievements"] });
    }).then((u) => unlisten.push(u));

    return () => unlisten.forEach((u) => u());
  }, [queryClient, setCurrentlyPlaying, setScanProgress]);
}
