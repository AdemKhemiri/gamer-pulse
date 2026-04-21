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

  useEffect(() => {
    if (!currentGameId) { setElapsed(0); return; }
    startTimeRef.current = Date.now();
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentGameId]);

  if (!currentGameId) return null;

  return (
    <div
      className="flex-shrink-0 flex items-center justify-center py-2 relative z-50"
      style={{ background: "rgba(0,0,0,0.7)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div
        className="flex items-center gap-2.5 px-4 py-1.5 rounded-full"
        style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)" }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <Play size={10} className="text-green-400 fill-green-400" />
        <span className="text-xs text-green-400 font-medium">
          {currentGame?.name ?? "Loading…"}
        </span>
        {elapsed > 0 && (
          <span className="text-xs text-green-400/60">{formatDuration(elapsed)}</span>
        )}
      </div>
    </div>
  );
}
