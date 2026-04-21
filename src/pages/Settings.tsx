import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Download, Trash2, MonitorPlay, FolderPlus, X, FolderOpen, RefreshCw } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import toast from "react-hot-toast";
import { getSettings, updateSettings, exportData, resetDatabase, openDbFolder, getAutostart, setAutostart, UserSettings } from "../api/client";
import { useUiStore } from "../store/uiStore";
import { open as openDirDialog } from "@tauri-apps/plugin-dialog";


const PRESETS: Record<string, { label: string; bg: string; accent: string; surface: string; colors: Record<string, string> }> = {
  catppuccin: {
    label: "Catppuccin", bg: "#1e1e2e", accent: "#cba6f7", surface: "#313244",
    colors: {
      "--gt-base": "#1e1e2e", "--gt-surface": "#181825", "--gt-overlay": "#313244",
      "--gt-hover": "#45475a", "--gt-muted": "#6c7086", "--gt-sub": "#a6adc8",
      "--gt-text": "#cdd6f4", "--gt-accent": "#cba6f7", "--gt-accent-dim": "#b48df7",
      "--gt-blue": "#89b4fa", "--gt-green": "#a6e3a1", "--gt-red": "#f38ba8",
      "--gt-yellow": "#f9e2af",
    },
  },
  dracula: {
    label: "Dracula", bg: "#282a36", accent: "#ff79c6", surface: "#44475a",
    colors: {
      "--gt-base": "#282a36", "--gt-surface": "#21222c", "--gt-overlay": "#44475a",
      "--gt-hover": "#565970", "--gt-muted": "#6272a4", "--gt-sub": "#8b9ec3",
      "--gt-text": "#f8f8f2", "--gt-accent": "#ff79c6", "--gt-accent-dim": "#ff55b0",
      "--gt-blue": "#8be9fd", "--gt-green": "#50fa7b", "--gt-red": "#ff5555",
      "--gt-yellow": "#f1fa8c",
    },
  },
  nord: {
    label: "Nord", bg: "#2e3440", accent: "#88c0d0", surface: "#3b4252",
    colors: {
      "--gt-base": "#2e3440", "--gt-surface": "#292f3b", "--gt-overlay": "#3b4252",
      "--gt-hover": "#434c5e", "--gt-muted": "#616e88", "--gt-sub": "#8892a4",
      "--gt-text": "#eceff4", "--gt-accent": "#88c0d0", "--gt-accent-dim": "#69b3c4",
      "--gt-blue": "#81a1c1", "--gt-green": "#a3be8c", "--gt-red": "#bf616a",
      "--gt-yellow": "#ebcb8b",
    },
  },
};

export default function Settings() {
  const setSplashVisible = useUiStore((s) => s.setSplashVisible);
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const { data: autostartEnabled = false } = useQuery({
    queryKey: ["autostart"],
    queryFn: getAutostart,
  });

  const autostartMutation = useMutation({
    mutationFn: setAutostart,
    onSuccess: (_, enabled) => {
      queryClient.setQueryData(["autostart"], enabled);
      toast.success(enabled ? "Will launch on startup" : "Removed from startup");
    },
    onError: () => toast.error("Failed to update startup setting"),
  });

  const [form, setForm] = useState<UserSettings | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved");
    },
    onError: () => toast.error("Failed to save settings"),
  });

  const resetMutation = useMutation({
    mutationFn: resetDatabase,
    onSuccess: () => {
      queryClient.clear();
      setConfirmReset(false);
      toast.success("Database cleared");
    },
    onError: () => toast.error("Failed to reset database"),
  });

  const exportMutation = useMutation({
    mutationFn: exportData,
    onSuccess: (json) => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `game-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported successfully");
    },
    onError: () => toast.error("Export failed"),
  });

  if (isLoading || !form) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: "#050505" }}>
        <div className="text-white/40 text-sm">Loading…</div>
      </div>
    );
  }

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setForm((f) => f ? { ...f, [key]: value } : f);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="fixed inset-0 z-0" style={{ background: "#050505" }} />
      <div className="relative z-10 p-6 max-w-lg mx-auto space-y-5">
      <div className="animate-ps5-fade">
        <p className="text-xs text-white/35 uppercase tracking-[0.15em] mb-1">Preferences</p>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
      </div>

      {/* Scanning */}
      <Section title="Library Scanning">
        <Toggle
          label="Scan on launch"
          description="Automatically scan for new/removed games when the app starts"
          checked={form.scanOnLaunch}
          onChange={(v) => update("scanOnLaunch", v)}
        />
        <div className="mt-3">
          <label className="text-xs text-white/55 block mb-1">Scan interval (hours)</label>
          <input
            type="number"
            min={1}
            max={168}
            value={form.scanIntervalHours}
            onChange={(e) => update("scanIntervalHours", Number(e.target.value))}
            className="border border-white/10 bg-white/5 rounded-xl px-3 py-1.5 text-sm text-white w-24 focus:outline-none focus:border-white/30"
          />
        </div>
      </Section>

      {/* App behavior */}
      <Section title="App Behavior">
        <Toggle
          label="Minimize to system tray"
          description="Closing the window hides it to the tray instead of quitting"
          checked={form.minimizeToTray}
          onChange={(v) => update("minimizeToTray", v)}
        />
        <Toggle
          label="Launch on startup"
          description="Automatically start Gamer Pulse when Windows boots"
          checked={autostartEnabled}
          onChange={(v) => autostartMutation.mutate(v)}
        />
      </Section>

      {/* Data */}
      <Section title="Data">
        <button
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 text-sm text-white hover:bg-white/12 disabled:opacity-50 transition-colors"
        >
          <Download size={14} />
          Export Data (JSON)
        </button>
        <p className="text-xs text-white/40 mt-1">
          Exports all games and session history to a JSON file.
        </p>

        <div className="border-t border-white/10 pt-3 mt-3">
          <button
            onClick={() => openDbFolder().catch(() => toast.error("Could not open folder"))}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 text-sm text-white hover:bg-white/12 transition-colors cursor-pointer"
          >
            <FolderOpen size={14} />
            Open Database Folder
          </button>
          <p className="text-xs text-white/40 mt-1">
            Opens the folder containing the SQLite database file.
          </p>
        </div>

        <div className="border-t border-white/10 pt-3 mt-3">
          <button
            onClick={() => setSplashVisible(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 text-sm text-white hover:bg-white/12 transition-colors"
          >
            <MonitorPlay size={14} />
            Preview Loading Screen
          </button>
          <p className="text-xs text-white/40 mt-1">Shows the startup splash screen for 2 seconds.</p>
        </div>

        <div className="border-t border-white/10 pt-3 mt-3">
          <button
            onClick={async () => {
              setCheckingUpdate(true);
              try {
                const update = await check();
                if (!update) {
                  toast.success("You're on the latest version");
                  return;
                }
                toast.dismiss("update");
                let total = 0;
                let received = 0;
                await update.downloadAndInstall((event) => {
                  if (event.event === "Started") {
                    total = event.data.contentLength ?? 0;
                    setDownloadProgress(0);
                  } else if (event.event === "Progress") {
                    received += event.data.chunkLength;
                    setDownloadProgress(total > 0 ? Math.round((received / total) * 100) : null);
                  } else if (event.event === "Finished") {
                    setDownloadProgress(100);
                  }
                });
                toast.success("Update installed — restarting…", { id: "update" });
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().close();
              } catch {
                toast.error("Update failed", { id: "update" });
              } finally {
                setCheckingUpdate(false);
              }
            }}
            disabled={checkingUpdate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 text-sm text-white hover:bg-white/12 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={checkingUpdate ? "animate-spin" : ""} />
            {checkingUpdate ? "Updating…" : "Check for Updates"}
          </button>
          {downloadProgress !== null && (
            <div className="mt-2">
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--gt-accent)] rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-xs text-white/40 mt-1">{downloadProgress < 100 ? `Downloading… ${downloadProgress}%` : "Installing…"}</p>
            </div>
          )}
          <p className="text-xs text-white/40 mt-1">Current version: v0.2.0</p>
        </div>

        <div className="border-t border-white/10 pt-3 mt-1">
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--gt-red)]/10 border border-[var(--gt-red)]/30 text-sm text-[var(--gt-red)] hover:bg-[var(--gt-red)]/20 transition-colors"
            >
              <Trash2 size={14} />
              Reset Database
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--gt-red)]">Delete everything?</span>
              <button
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="px-3 py-1.5 rounded-xl bg-[var(--gt-red)] text-[var(--gt-base)] text-sm font-medium hover:bg-[var(--gt-red)]/80 disabled:opacity-50 transition-colors"
              >
                Yes, delete all
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 rounded-xl border border-white/10 text-sm text-white/55 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          <p className="text-xs text-white/40 mt-1">
            Removes all games, sessions, and achievements. Cannot be undone.
          </p>
        </div>
      </Section>

      {/* Custom Scan Locations */}
      <Section title="Custom Scan Locations">
        <p className="text-xs text-white/40">
          Add folders to scan for games. Each immediate subfolder containing an executable will be added as a game.
        </p>
        <div className="space-y-1 mt-1">
          {(form.customScanPaths ?? []).map((path, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/8/50 border border-white/10">
              <span className="flex-1 text-xs text-white/55 truncate" title={path}>{path}</span>
              <button
                onClick={() => update("customScanPaths", (form.customScanPaths ?? []).filter((_, j) => j !== i))}
                className="flex-shrink-0 p-0.5 rounded text-white/40 hover:text-[var(--gt-red)] cursor-pointer transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {(form.customScanPaths ?? []).length === 0 && (
            <p className="text-xs text-white/40 italic">No folders added yet.</p>
          )}
        </div>
        <button
          onClick={async () => {
            const selected = await openDirDialog({ title: "Select Folder to Scan", directory: true, multiple: false });
            if (selected) {
              const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
              if (!(form.customScanPaths ?? []).includes(path)) {
                update("customScanPaths", [...(form.customScanPaths ?? []), path]);
              }
            }
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 text-sm text-white/55 hover:text-white hover:border-[var(--gt-accent)] cursor-pointer transition-colors mt-1"
        >
          <FolderPlus size={14} />
          Add Folder
        </button>
      </Section>

      {/* Theme */}
      <Section title="Theme">
        {/* Preset cards */}
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(PRESETS) as [string, typeof PRESETS[string]][]).map(([key, p]) => {
            const active = form.theme === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setForm((f) => f ? { ...f, theme: key, customThemeColors: { ...p.colors } } : f);
                  document.querySelector("[data-theme]")?.setAttribute("data-theme", key);
                }}
                className={`rounded-lg border-2 p-3 text-left cursor-pointer transition-all ${
                  active ? "border-[var(--gt-accent)]" : "border-white/10 hover:border-[var(--gt-hover)]"
                }`}
                style={{ background: p.bg }}
              >
                <div className="flex gap-1 mb-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: p.accent }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: p.surface }} />
                  <span className="w-3 h-3 rounded-full opacity-50" style={{ background: p.accent }} />
                </div>
                <p className="text-xs font-medium text-white">{p.label}</p>
              </button>
            );
          })}
        </div>

        {/* TODO: custom theme color pickers + saved themes — commented out for now
        ...
        */}
      </Section>

      {/* Save */}
      <button
        onClick={() => saveMutation.mutate(form)}
        disabled={saveMutation.isPending}
        className="w-full py-3 rounded-2xl bg-white text-black font-semibold text-sm hover:bg-white/90 disabled:opacity-50 transition-colors cursor-pointer"
      >
        {saveMutation.isPending ? "Saving…" : "Save Settings"}
      </button>

      <div className="h-4" />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-[0.12em]">{title}</h3>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm text-white">{label}</p>
        {description && <p className="text-xs text-white/40 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
          checked ? "bg-[var(--gt-accent)]" : "bg-white/15"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
