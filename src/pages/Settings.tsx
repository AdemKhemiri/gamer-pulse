import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Download, Trash2, MonitorPlay, FolderPlus, X, Pipette, FolderOpen } from "lucide-react";
import toast from "react-hot-toast";
import { getSettings, updateSettings, exportData, resetDatabase, openDbFolder, UserSettings } from "../api/client";
import { useUiStore } from "../store/uiStore";
import { open as openDirDialog } from "@tauri-apps/plugin-dialog";

const THEME_VARS: { key: string; label: string; group: string }[] = [
  { key: "--gt-base",       label: "Background",      group: "Backgrounds" },
  { key: "--gt-surface",    label: "Surface",         group: "Backgrounds" },
  { key: "--gt-overlay",    label: "Overlay/Border",  group: "Backgrounds" },
  { key: "--gt-hover",      label: "Hover",           group: "Backgrounds" },
  { key: "--gt-text",       label: "Text",            group: "Text" },
  { key: "--gt-sub",        label: "Subtext",         group: "Text" },
  { key: "--gt-muted",      label: "Muted",           group: "Text" },
  { key: "--gt-accent",     label: "Accent",          group: "Accent" },
  { key: "--gt-accent-dim", label: "Accent Dim",      group: "Accent" },
  { key: "--gt-blue",       label: "Blue",            group: "Highlights" },
  { key: "--gt-green",      label: "Green",           group: "Highlights" },
  { key: "--gt-red",        label: "Red",             group: "Highlights" },
  { key: "--gt-yellow",     label: "Yellow",          group: "Highlights" },
];

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
  const [saveNameInput, setSaveNameInput] = useState<string | null>(null);
  const [activeSavedTheme, setActiveSavedTheme] = useState<string | null>(null);
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
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
    return <div className="p-6 text-[var(--gt-muted)] text-sm">Loading…</div>;
  }

  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setForm((f) => f ? { ...f, [key]: value } : f);
  };

  function injectCustomStyle(colors: Record<string, string>) {
    const vars = Object.entries(colors).map(([k, v]) => `${k}: ${v};`).join(" ");
    let el = document.getElementById("gt-custom-theme") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "gt-custom-theme";
      document.head.appendChild(el);
    }
    el.textContent = `[data-theme="custom"] { ${vars} }`;
    // Apply immediately by switching data-theme on the root div
    document.querySelector("[data-theme]")?.setAttribute("data-theme", "custom");
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--gt-text)]">Settings</h1>
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
          <label className="text-xs text-[var(--gt-sub)] block mb-1">Scan interval (hours)</label>
          <input
            type="number"
            min={1}
            max={168}
            value={form.scanIntervalHours}
            onChange={(e) => update("scanIntervalHours", Number(e.target.value))}
            className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md px-3 py-1.5 text-sm text-[var(--gt-text)] w-24 focus:outline-none focus:border-[var(--gt-accent)]"
          />
        </div>
      </Section>

      {/* Launchers */}
      <Section title="Launchers">
        <Toggle label="Steam" checked={form.enableSteam} onChange={(v) => update("enableSteam", v)} />
        <Toggle label="Epic Games" checked={form.enableEpic} onChange={(v) => update("enableEpic", v)} />
        <Toggle label="GOG Galaxy" checked={form.enableGog} onChange={(v) => update("enableGog", v)} />
        <Toggle label="Xbox / Game Pass" checked={form.enableXbox} onChange={(v) => update("enableXbox", v)} />
      </Section>

      {/* App behavior */}
      <Section title="App Behavior">
        <Toggle
          label="Minimize to system tray"
          description="Closing the window hides it to the tray instead of quitting"
          checked={form.minimizeToTray}
          onChange={(v) => update("minimizeToTray", v)}
        />
      </Section>

      {/* Data */}
      <Section title="Data">
        <button
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--gt-overlay)] text-sm text-[var(--gt-text)] hover:bg-[var(--gt-hover)] disabled:opacity-50 transition-colors"
        >
          <Download size={14} />
          Export Data (JSON)
        </button>
        <p className="text-xs text-[var(--gt-muted)] mt-1">
          Exports all games and session history to a JSON file.
        </p>

        <div className="border-t border-[var(--gt-overlay)] pt-3 mt-3">
          <button
            onClick={() => openDbFolder().catch(() => toast.error("Could not open folder"))}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--gt-overlay)] text-sm text-[var(--gt-text)] hover:bg-[var(--gt-hover)] transition-colors cursor-pointer"
          >
            <FolderOpen size={14} />
            Open Database Folder
          </button>
          <p className="text-xs text-[var(--gt-muted)] mt-1">
            Opens the folder containing the SQLite database file.
          </p>
        </div>

        <div className="border-t border-[var(--gt-overlay)] pt-3 mt-3">
          <button
            onClick={() => setSplashVisible(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--gt-overlay)] text-sm text-[var(--gt-text)] hover:bg-[var(--gt-hover)] transition-colors"
          >
            <MonitorPlay size={14} />
            Preview Loading Screen
          </button>
          <p className="text-xs text-[var(--gt-muted)] mt-1">Shows the startup splash screen for 2 seconds.</p>
        </div>

        <div className="border-t border-[var(--gt-overlay)] pt-3 mt-1">
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--gt-red)]/10 border border-[var(--gt-red)]/30 text-sm text-[var(--gt-red)] hover:bg-[var(--gt-red)]/20 transition-colors"
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
                className="px-3 py-1.5 rounded-md bg-[var(--gt-red)] text-[var(--gt-base)] text-sm font-medium hover:bg-[var(--gt-red)]/80 disabled:opacity-50 transition-colors"
              >
                Yes, delete all
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 rounded-md border border-[var(--gt-overlay)] text-sm text-[var(--gt-sub)] hover:text-[var(--gt-text)] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          <p className="text-xs text-[var(--gt-muted)] mt-1">
            Removes all games, sessions, and achievements. Cannot be undone.
          </p>
        </div>
      </Section>

      {/* Custom Scan Locations */}
      <Section title="Custom Scan Locations">
        <p className="text-xs text-[var(--gt-muted)]">
          Add folders to scan for games. Each immediate subfolder containing an executable will be added as a game.
        </p>
        <div className="space-y-1 mt-1">
          {(form.customScanPaths ?? []).map((path, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--gt-overlay)]/50 border border-[var(--gt-overlay)]">
              <span className="flex-1 text-xs text-[var(--gt-sub)] truncate" title={path}>{path}</span>
              <button
                onClick={() => update("customScanPaths", (form.customScanPaths ?? []).filter((_, j) => j !== i))}
                className="flex-shrink-0 p-0.5 rounded text-[var(--gt-muted)] hover:text-[var(--gt-red)] cursor-pointer transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {(form.customScanPaths ?? []).length === 0 && (
            <p className="text-xs text-[var(--gt-muted)] italic">No folders added yet.</p>
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
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--gt-overlay)] text-sm text-[var(--gt-sub)] hover:text-[var(--gt-text)] hover:border-[var(--gt-accent)] cursor-pointer transition-colors mt-1"
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
                  setActiveSavedTheme(null);
                }}
                className={`rounded-lg border-2 p-3 text-left cursor-pointer transition-all ${
                  active ? "border-[var(--gt-accent)]" : "border-[var(--gt-overlay)] hover:border-[var(--gt-hover)]"
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
          {/* Custom card */}
          <button
            onClick={() => {
              setForm((f) => {
                if (!f) return f;
                // Seed from the current effective colors so pickers don't go black
                const effective = {
                  ...(PRESETS[f.theme]?.colors ?? PRESETS.catppuccin.colors),
                  ...(f.customThemeColors ?? {}),
                };
                injectCustomStyle(effective);
                return { ...f, theme: "custom", customThemeColors: effective };
              });
              setActiveSavedTheme(null);
            }}
            className={`rounded-lg border-2 p-3 text-left cursor-pointer transition-all ${
              form.theme === "custom" && !activeSavedTheme ? "border-[var(--gt-accent)]" : "border-[var(--gt-overlay)] hover:border-[var(--gt-hover)]"
            } bg-[var(--gt-surface)]`}
          >
            <div className="flex gap-1 mb-2">
              <Pipette size={12} className="text-[var(--gt-accent)]" />
            </div>
            <p className="text-xs font-medium text-[var(--gt-text)]">Custom</p>
          </button>
        </div>

        {/* Saved theme cards */}
        {Object.keys(form.savedThemes ?? {}).length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-semibold text-[var(--gt-muted)] uppercase tracking-wider mb-1.5">Saved</p>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(form.savedThemes ?? {}).map(([name, themeColors]) => {
                const bg = themeColors["--gt-base"] ?? "#1e1e2e";
                const accent = themeColors["--gt-accent"] ?? "#cba6f7";
                const surface = themeColors["--gt-surface"] ?? "#313244";
                return (
                  <div key={name} className="relative group">
                    <button
                      onClick={() => {
                        const next = { ...themeColors };
                        injectCustomStyle(next);
                        setForm((f) => f ? { ...f, theme: "custom", customThemeColors: next } : f);
                        setActiveSavedTheme(name);
                      }}
                      className={`w-full rounded-lg border-2 p-3 text-left cursor-pointer transition-all ${
                        activeSavedTheme === name ? "border-[var(--gt-accent)]" : "border-[var(--gt-overlay)] hover:border-[var(--gt-hover)]"
                      }`}
                      style={{ background: bg }}
                    >
                      <div className="flex gap-1 mb-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: accent }} />
                        <span className="w-3 h-3 rounded-full" style={{ background: surface }} />
                        <span className="w-3 h-3 rounded-full opacity-50" style={{ background: accent }} />
                      </div>
                      <p className="text-xs font-medium text-white truncate">{name}</p>
                    </button>
                    <button
                      onClick={() => {
                        const next = { ...(form.savedThemes ?? {}) };
                        delete next[name];
                        setForm((f) => f ? { ...f, savedThemes: next } : f);
                      }}
                      className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--gt-red)]/80 text-white items-center justify-center hidden group-hover:flex transition-all"
                      title="Delete theme"
                    >
                      <X size={8} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Color pickers — always visible, seeded from current theme */}
        <div className="mt-4 space-y-3">
          {["Backgrounds", "Text", "Accent", "Highlights"].map((group) => {
            const vars = THEME_VARS.filter((v) => v.group === group);
            const colors: Record<string, string> = form.customThemeColors ?? {};
            const preset = PRESETS[form.theme];
            return (
              <div key={group}>
                <p className="text-[10px] font-semibold text-[var(--gt-muted)] uppercase tracking-wider mb-1.5">{group}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {vars.map(({ key, label }) => {
                    const value = colors[key] ?? preset?.colors[key] ?? "#000000";
                    return (
                      <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[var(--gt-overlay)]/50 border border-[var(--gt-overlay)] cursor-pointer hover:border-[var(--gt-hover)] transition-colors">
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => {
                            // Always merge preset + custom so all 13 vars are present
                            const next = {
                              ...(PRESETS[form.theme]?.colors ?? {}),
                              ...(form.customThemeColors ?? {}),
                              [key]: e.target.value,
                            };
                            setForm((f) => f ? { ...f, theme: "custom", customThemeColors: next } : f);
                            injectCustomStyle(next);
                            setActiveSavedTheme(null);
                          }}
                          className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                          style={{ appearance: "none" }}
                        />
                        <span className="text-xs text-[var(--gt-sub)]">{label}</span>
                        <span className="ml-auto text-[10px] text-[var(--gt-muted)] font-mono">{value}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Save as named theme */}
          <div className="pt-3 border-t border-[var(--gt-overlay)]">
            {saveNameInput === null ? (
              <button
                onClick={() => setSaveNameInput("")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--gt-overlay)] text-xs text-[var(--gt-sub)] hover:text-[var(--gt-text)] hover:border-[var(--gt-accent)] cursor-pointer transition-colors"
              >
                Save as named theme…
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="Theme name"
                  value={saveNameInput}
                  onChange={(e) => setSaveNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setSaveNameInput(null); return; }
                    if (e.key === "Enter" && saveNameInput.trim()) {
                      const name = saveNameInput.trim();
                      const colorsToSave = {
                        ...(PRESETS[form.theme]?.colors ?? {}),
                        ...(form.customThemeColors ?? {}),
                      };
                      setForm((f) => f ? { ...f, savedThemes: { ...(f.savedThemes ?? {}), [name]: colorsToSave } } : f);
                      setSaveNameInput(null);
                    }
                  }}
                  className="flex-1 bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-md px-3 py-1.5 text-sm text-[var(--gt-text)] focus:outline-none focus:border-[var(--gt-accent)]"
                />
                <button
                  onClick={() => {
                    const name = saveNameInput.trim();
                    if (!name) return;
                    const colorsToSave = {
                      ...(PRESETS[form.theme]?.colors ?? {}),
                      ...(form.customThemeColors ?? {}),
                    };
                    setForm((f) => f ? { ...f, savedThemes: { ...(f.savedThemes ?? {}), [name]: colorsToSave } } : f);
                    setSaveNameInput(null);
                  }}
                  disabled={!saveNameInput.trim()}
                  className="px-3 py-1.5 rounded-md bg-[var(--gt-accent)] text-[var(--gt-base)] text-xs font-medium disabled:opacity-40 hover:bg-[var(--gt-accent-dim)] transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setSaveNameInput(null)}
                  className="p-1.5 rounded-md text-[var(--gt-muted)] hover:text-[var(--gt-text)] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Save */}
      <button
        onClick={() => saveMutation.mutate(form)}
        disabled={saveMutation.isPending}
        className="w-full py-2.5 rounded-lg bg-[var(--gt-accent)] text-[var(--gt-base)] font-semibold text-sm hover:bg-[var(--gt-accent-dim)] disabled:opacity-50 transition-colors"
      >
        Save Settings
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--gt-surface)] rounded-lg border border-[var(--gt-overlay)] p-4 space-y-3">
      <h3 className="text-xs font-semibold text-[var(--gt-sub)] uppercase tracking-wider">{title}</h3>
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
        <p className="text-sm text-[var(--gt-text)]">{label}</p>
        {description && <p className="text-xs text-[var(--gt-muted)] mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
          checked ? "bg-[var(--gt-accent)]" : "bg-[var(--gt-overlay)]"
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
