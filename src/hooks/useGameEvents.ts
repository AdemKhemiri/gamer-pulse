import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useUiStore } from "../store/uiStore";
import { formatDuration } from "../utils/format";

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

    return () => unlisten.forEach((u) => u());
  }, [queryClient, setCurrentlyPlaying, setScanProgress]);
}
