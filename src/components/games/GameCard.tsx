import { useState } from "react";
import { Star, Play } from "lucide-react";
import { Game, launchGame } from "../../api/client";
import { formatHours, formatRelative, sourceLabel, sourceColor } from "../../utils/format";
import { gradientFromName } from "../../utils/gameColor";
import { useUiStore } from "../../store/uiStore";
import toast from "react-hot-toast";

interface Props {
  game: Game;
  onClick: () => void;
}

function canLaunch(game: Game): boolean {
  return !!(game.exePath || (game.source === "steam" && game.sourceId) || (game.source === "epic" && game.sourceId));
}

export default function GameCard({ game, onClick }: Props) {
  const currentlyPlayingId = useUiStore((s) => s.currentlyPlayingGameId);
  const isPlaying = currentlyPlayingId === game.id;
  const [launching, setLaunching] = useState(false);

  async function handleLaunch(e: React.MouseEvent) {
    e.stopPropagation();
    setLaunching(true);
    try {
      await launchGame(game);
    } catch (err) {
      toast.error(typeof err === "string" ? err : "Failed to launch game");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div
      onClick={onClick}
      className="group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03]"
      style={{
        boxShadow: isPlaying
          ? "0 0 0 2px rgba(74,222,128,0.8), 0 8px 32px rgba(0,0,0,0.6)"
          : "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {/* Cover art */}
      <div className="aspect-[2/3] relative overflow-hidden">
        {game.coverUrl ? (
          <img
            src={game.coverUrl}
            alt={game.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2"
            style={{ background: gradientFromName(game.name) }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white/70"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              {game.name.charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        {/* Now playing badge */}
        {isPlaying && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(74,222,128,0.2)", border: "1px solid rgba(74,222,128,0.5)" }}>
            <Play size={7} className="fill-green-400 text-green-400" />
            <span className="text-[8px] text-green-400 font-bold">NOW PLAYING</span>
          </div>
        )}

        {/* Source badge */}
        <div
          className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: sourceColor(game.source) + "dd", color: "#fff" }}
        >
          {sourceLabel(game.source)}
        </div>

        {/* Favorite */}
        {game.isFavorite && (
          <Star size={11} className="absolute bottom-2 right-2 text-yellow-400 fill-yellow-400" />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-between p-3">
          <div className="w-full">
            <p className="text-white font-semibold text-xs truncate">{game.name}</p>
            <p className="text-white/50 text-[10px] mt-0.5">
              {game.totalPlaySecs ? formatHours(game.totalPlaySecs) : "Never played"}
            </p>
          </div>
          {canLaunch(game) && (
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer hover:bg-white/90"
            >
              <Play size={10} className="fill-black" />
              {launching ? "Launching…" : "Play"}
            </button>
          )}
        </div>
      </div>

      {/* Info below cover */}
      <div
        className="p-2"
        style={{ background: "rgba(0,0,0,0.6)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-white text-xs font-medium truncate">{game.name}</p>
        <p className="text-white/35 text-[10px] mt-0.5">
          {game.totalPlaySecs ? `${formatHours(game.totalPlaySecs)}` : "Not played"}
          {game.lastPlayedAt && <span className="ml-1">· {formatRelative(game.lastPlayedAt)}</span>}
        </p>
      </div>
    </div>
  );
}
