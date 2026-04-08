import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { getGame } from "../../api/client";
import { formatDuration } from "../../utils/format";

export default function StatusBar() {
  const currentGameId = useUiStore((s) => s.currentlyPlayingGameId);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  const { data: currentGame } = useQuery({
    queryKey: ["game", currentGameId],
    queryFn: () => getGame(currentGameId!),
    enabled: !!currentGameId,
  });

  // Reset start time and elapsed when game changes
  useEffect(() => {
    if (!currentGameId) {
      setElapsed(0);
      return;
    }
    startTimeRef.current = Date.now();
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentGameId]);

  if (!currentGameId) return null;

  return (
    <div className="h-7 flex-shrink-0 bg-[var(--gt-surface)] border-t border-[var(--gt-overlay)] flex items-center px-4 gap-2 text-xs text-[var(--gt-sub)]">
      <Play size={11} className="text-[var(--gt-green)] fill-[var(--gt-green)]" />
      <span className="text-[var(--gt-green)] font-medium">Now Playing:</span>
      <span className="text-[var(--gt-text)]">{currentGame?.name ?? "Loading…"}</span>
      {elapsed > 0 && (
        <span className="text-[var(--gt-muted)] ml-auto">{formatDuration(elapsed)}</span>
      )}
    </div>
  );
}
