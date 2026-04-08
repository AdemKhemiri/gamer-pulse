import { useState } from "react";
import { Star, Play } from "lucide-react";
import { Game, launchGame } from "../../api/client";
import { formatHours, formatRelative, sourceLabel, sourceColor } from "../../utils/format";
import { useUiStore } from "../../store/uiStore";
import toast from "react-hot-toast";

interface Props {
  game: Game;
  onClick: () => void;
}

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect fill='%23313244' width='200' height='300'/%3E%3Ctext fill='%236c7086' font-size='40' text-anchor='middle' x='100' y='160'%3E🎮%3C/text%3E%3C/svg%3E";

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
      className={`group relative rounded-lg overflow-hidden cursor-pointer bg-[var(--gt-surface)] border transition-all hover:scale-[1.02] hover:shadow-xl ${
        isPlaying
          ? "border-[var(--gt-green)] shadow-[0_0_12px_rgba(166,227,161,0.2)]"
          : "border-[var(--gt-overlay)] hover:border-[var(--gt-hover)]"
      }`}
    >
      {/* Cover art */}
      <div className="aspect-[2/3] relative overflow-hidden bg-[var(--gt-overlay)]">
        <img
          src={game.coverUrl ?? PLACEHOLDER}
          alt={game.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = PLACEHOLDER;
          }}
        />

        {/* Now playing indicator */}
        {isPlaying && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-[var(--gt-green)]/20 backdrop-blur-sm border border-[var(--gt-green)]/40 rounded-full px-2 py-0.5">
            <Play size={9} className="text-[var(--gt-green)] fill-[var(--gt-green)]" />
            <span className="text-[9px] text-[var(--gt-green)] font-medium">PLAYING</span>
          </div>
        )}

        {/* Source badge */}
        <div
          className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: sourceColor(game.source) + "cc", color: "#fff" }}
        >
          {sourceLabel(game.source)}
        </div>

        {/* Favorite star */}
        {game.isFavorite && (
          <div className="absolute bottom-2 right-2">
            <Star size={13} className="text-[var(--gt-yellow)] fill-[var(--gt-yellow)]" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-end justify-between p-3">
          <div className="w-full">
            <p className="text-white font-semibold text-sm truncate">{game.name}</p>
            <p className="text-[var(--gt-sub)] text-xs mt-0.5">
              {game.totalPlaySecs ? formatHours(game.totalPlaySecs) : "Never played"}
            </p>
          </div>
          {canLaunch(game) && (
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--gt-accent)] hover:bg-[var(--gt-accent-dim)] text-[var(--gt-base)] text-xs font-semibold transition-colors disabled:opacity-60 self-center"
            >
              <Play size={11} className="fill-[var(--gt-base)]" />
              {launching ? "Launching…" : "Launch"}
            </button>
          )}
        </div>
      </div>

      {/* Info below cover */}
      <div className="p-2">
        <p className="text-[var(--gt-text)] text-xs font-medium truncate">{game.name}</p>
        <p className="text-[var(--gt-muted)] text-[11px] mt-0.5">
          {game.totalPlaySecs
            ? `${formatHours(game.totalPlaySecs)} played`
            : "Not played"}
          {game.lastPlayedAt && (
            <span className="ml-1">· {formatRelative(game.lastPlayedAt)}</span>
          )}
        </p>
      </div>
    </div>
  );
}
