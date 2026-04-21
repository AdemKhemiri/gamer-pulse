import { NavLink } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Gamepad2, RefreshCw, Layers, Settings } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerScan } from "../../api/client";
import { useUiStore } from "../../store/uiStore";
import toast from "react-hot-toast";

const NAV = [
  { to: "/",        label: "Dashboard",    end: true },
  { to: "/library", label: "Library",      end: false },
  { to: "/spin",    label: "Spin to Pick", end: false },
  { to: "/stats",   label: "Stats",        end: false },
  { to: "/history", label: "History",      end: false },
];

function getWin() {
  return getCurrentWindow();
}

export default function TopNav() {
  const queryClient = useQueryClient();
  const scanProgress = useUiStore((s) => s.scanProgress);

  const scanMutation = useMutation({
    mutationFn: triggerScan,
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      const parts: string[] = [];
      if (result.added > 0) parts.push(`${result.added} added`);
      if (result.updated > 0) parts.push(`${result.updated} updated`);
      if (result.deleted > 0) parts.push(`${result.deleted} removed`);
      toast.success(parts.length > 0 ? `Scan complete — ${parts.join(", ")}` : `Scan complete — ${result.total} games`);
    },
    onError: () => toast.error("Scan failed"),
  });

  return (
    <div
      className="h-12 flex items-center flex-shrink-0 relative z-50"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("a")) return;
        if (e.button === 0) getWin().startDragging();
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 flex-shrink-0 pointer-events-none select-none">
        <Gamepad2 size={17} className="text-white/80" />
        <span className="text-sm font-semibold text-white tracking-wide">GAMER PULSE</span>
      </div>

      {/* Nav links — centered */}
      <nav className="flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
        {NAV.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-white/15 text-white"
                  : "text-white/55 hover:text-white/90 hover:bg-white/8"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Right controls */}
      <div className="ml-auto flex items-center h-full">
        {/* Collections link */}
        <NavLink
          to="/collections"
          className={({ isActive }) =>
            `w-9 h-full flex items-center justify-center transition-colors cursor-pointer ${
              isActive ? "text-white" : "text-white/45 hover:text-white/80"
            }`
          }
          title="Collections"
        >
          <Layers size={15} />
        </NavLink>

        {/* Scan */}
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          title={scanMutation.isPending ? `Scanning… (${scanProgress?.count ?? 0} found)` : "Scan Library"}
          className="w-9 h-full flex items-center justify-center text-white/45 hover:text-white/80 transition-colors disabled:opacity-30 cursor-pointer"
        >
          <RefreshCw size={14} className={scanMutation.isPending ? "animate-spin" : ""} />
        </button>

        {/* Settings */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `w-9 h-full flex items-center justify-center transition-colors cursor-pointer ${
              isActive ? "text-white" : "text-white/45 hover:text-white/80"
            }`
          }
          title="Settings"
        >
          <Settings size={14} />
        </NavLink>

        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Window controls */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => getWin().minimize()}
          className="w-9 h-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors cursor-pointer"
        >
          <Minus size={13} />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => getWin().toggleMaximize()}
          className="w-9 h-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors cursor-pointer"
        >
          <Square size={11} />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => getWin().close()}
          className="w-9 h-full flex items-center justify-center text-white/40 hover:text-white hover:bg-red-500/70 transition-colors cursor-pointer"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
