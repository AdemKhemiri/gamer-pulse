import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Library,
  BarChart2,
  GitCompare,
  Trash2,
  Settings,
  RefreshCw,
  Dices,
  Layers,
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { triggerScan, getCollections, createCollection } from "../../api/client";
import { useUiStore } from "../../store/uiStore";
import { CollectionIcon } from "../../pages/Collections";

const TOP_NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/library", icon: Library, label: "Library" },
  { to: "/spin", icon: Dices, label: "Spin to Pick" },
  { to: "/stats", icon: BarChart2, label: "Stats" },
  { to: "/compare", icon: GitCompare, label: "Compare" },
  { to: "/history", icon: Trash2, label: "History" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scanProgress = useUiStore((s) => s.scanProgress);
  const isScanning = scanProgress !== null;

  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [creatingQuick, setCreatingQuick] = useState(false);
  const [quickName, setQuickName] = useState("");

  const scanMutation = useMutation({
    mutationFn: triggerScan,
    onError: () => toast.error("Scan failed"),
  });

  const { data: collections = [] } = useQuery({
    queryKey: ["collections"],
    queryFn: getCollections,
  });

  const createMutation = useMutation({
    mutationFn: () => createCollection({ name: quickName.trim() }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setCreatingQuick(false);
      setQuickName("");
      navigate(`/collections/${created.id}`);
    },
    onError: () => toast.error("Failed to create collection"),
  });

  function submitQuick(e: React.FormEvent) {
    e.preventDefault();
    if (quickName.trim()) createMutation.mutate();
  }

  return (
    <aside className="w-52 flex-shrink-0 bg-[var(--gt-surface)] border-r border-[var(--gt-overlay)] flex flex-col">
      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2 overflow-y-auto min-h-0">
        {/* Top nav items */}
        {TOP_NAV.map(({ to, icon: Icon, label }) => (
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

        {/* Collections section */}
        <div className="mt-2">
          {/* Section header */}
          <div className="flex items-center justify-between px-3 py-1.5">
            <button
              onClick={() => setCollectionsOpen((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-[var(--gt-muted)] uppercase tracking-wider hover:text-[var(--gt-sub)] transition-colors flex-1 text-left"
            >
              {collectionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Collections
            </button>
            <div className="flex items-center gap-1">
              <NavLink
                to="/collections"
                end
                className={({ isActive }) =>
                  `p-0.5 rounded transition-colors ${
                    isActive ? "text-[var(--gt-accent)]" : "text-[var(--gt-muted)] hover:text-[var(--gt-text)]"
                  }`
                }
                title="Manage collections"
              >
                <Layers size={12} />
              </NavLink>
              <button
                onClick={() => { setCreatingQuick(true); setCollectionsOpen(true); }}
                className="p-0.5 rounded text-[var(--gt-muted)] hover:text-[var(--gt-text)] transition-colors"
                title="New collection"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* Quick-create inline form */}
          {creatingQuick && collectionsOpen && (
            <form onSubmit={submitQuick} className="px-3 pb-1">
              <input
                autoFocus
                type="text"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Collection name…"
                onKeyDown={(e) => e.key === "Escape" && (setCreatingQuick(false), setQuickName(""))}
                className="w-full bg-[var(--gt-base)] border border-[var(--gt-accent)]/50 rounded px-2 py-1 text-xs text-[var(--gt-text)] placeholder-[var(--gt-muted)] focus:outline-none"
              />
            </form>
          )}

          {/* Collection list */}
          {collectionsOpen && collections.map((col) => (
            <NavLink
              key={col.id}
              to={`/collections/${col.id}`}
              className={({ isActive }) =>
                `flex items-center gap-2 pl-7 pr-3 py-1.5 rounded-md text-xs transition-colors group ${
                  isActive
                    ? "bg-[var(--gt-overlay)] text-[var(--gt-accent)] font-medium"
                    : "text-[var(--gt-sub)] hover:text-[var(--gt-text)] hover:bg-[var(--gt-overlay)]/50"
                }`
              }
            >
              <span className="flex-shrink-0" style={{ color: col.color }}>
                <CollectionIcon iconKey={col.icon} size={12} />
              </span>
              <span className="flex-1 truncate">{col.name}</span>
              <span className="text-[var(--gt-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {col.gameCount}
              </span>
            </NavLink>
          ))}

          {collectionsOpen && collections.length === 0 && !creatingQuick && (
            <p className="px-7 py-1 text-xs text-[var(--gt-muted)] italic">No collections</p>
          )}
        </div>
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
