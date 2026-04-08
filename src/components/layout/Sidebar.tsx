import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Library,
  BarChart2,
  GitCompare,
  Trash2,
  Settings,
  RefreshCw,
  Dices,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { triggerScan } from "../../api/client";
import { useUiStore } from "../../store/uiStore";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/library", icon: Library, label: "Library" },
  { to: "/spin", icon: Dices, label: "Spin to Pick" },
  { to: "/stats", icon: BarChart2, label: "Stats" },
  { to: "/compare", icon: GitCompare, label: "Compare" },
  { to: "/history", icon: Trash2, label: "History" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const scanProgress = useUiStore((s) => s.scanProgress);
  const isScanning = scanProgress !== null;

  const scanMutation = useMutation({
    mutationFn: triggerScan,
    onError: () => toast.error("Scan failed"),
  });

  return (
    <aside className="w-52 flex-shrink-0 bg-[var(--gt-surface)] border-r border-[var(--gt-overlay)] flex flex-col">
      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-[var(--gt-overlay)] text-[var(--gt-accent)] font-medium"
                  : "text-[var(--gt-sub)] hover:text-[var(--gt-text)] hover:bg-[var(--gt-overlay)]/50"
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Scan button */}
      <div className="p-3 border-t border-[var(--gt-overlay)]">
        <button
          onClick={() => scanMutation.mutate()}
          disabled={isScanning || scanMutation.isPending}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm bg-[var(--gt-overlay)] text-[var(--gt-text)] hover:bg-[var(--gt-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw
            size={14}
            className={isScanning || scanMutation.isPending ? "animate-spin" : ""}
          />
          {isScanning ? `Scanning…` : "Scan Library"}
        </button>
      </div>
    </aside>
  );
}
