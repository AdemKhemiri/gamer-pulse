import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Gamepad2 } from "lucide-react";
import { useUiStore } from "../../store/uiStore";

export default function TitleBar() {
  const scanning = useUiStore((s) => s.scanProgress);

  function getWin() {
    return getCurrentWindow();
  }

  return (
    <div className="h-9 flex items-center bg-[var(--gt-surface)] border-b border-[var(--gt-overlay)] flex-shrink-0 select-none">
      {/* Drag region — onMouseDown calls startDragging() directly */}
      <div
        className="flex-1 flex items-center gap-2 px-3 h-full cursor-default"
        onMouseDown={(e) => {
          if (e.button === 0) {
            getWin().startDragging();
          }
        }}
      >
        <Gamepad2 size={15} className="text-[var(--gt-accent)] pointer-events-none" />
        <span className="text-sm font-medium text-[var(--gt-text)] pointer-events-none">
          Gamer Pulse
        </span>
        {scanning && (
          <span className="text-xs text-[var(--gt-sub)] ml-2 pointer-events-none">
            Scanning… ({scanning.count} found)
          </span>
        )}
      </div>

      {/* Window controls */}
      <div className="flex h-full">
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => getWin().minimize()}
          className="w-10 h-full flex items-center justify-center text-[var(--gt-muted)] hover:text-[var(--gt-text)] hover:bg-[var(--gt-overlay)] transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => getWin().toggleMaximize()}
          className="w-10 h-full flex items-center justify-center text-[var(--gt-muted)] hover:text-[var(--gt-text)] hover:bg-[var(--gt-overlay)] transition-colors"
        >
          <Square size={12} />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => getWin().close()}
          className="w-10 h-full flex items-center justify-center text-[var(--gt-muted)] hover:text-white hover:bg-[var(--gt-red)]/80 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
