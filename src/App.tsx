import { Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Sidebar from "./components/layout/Sidebar";
import TitleBar from "./components/layout/TitleBar";
import StatusBar from "./components/layout/StatusBar";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import GameDetail from "./pages/GameDetail";
import Stats from "./pages/Stats";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Compare from "./pages/Compare";
import SpinToPick from "./pages/SpinToPick";
import { useGameEvents } from "./hooks/useGameEvents";
import { triggerScan, getSettings } from "./api/client";
import { useUiStore } from "./store/uiStore";

function SplashScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--gt-base)] z-50">
      <style>{`
        @keyframes splash-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes splash-dot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes splash-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="flex flex-col items-center gap-6" style={{ animation: "splash-fade-in 0.5s ease both" }}>
        {/* Logo */}
        <div
          className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-[var(--gt-accent)]/30"
          style={{ animation: "splash-pulse 2s ease-in-out infinite" }}
        >
          <img src="/logo.png" alt="Gamer Pulse" className="w-full h-full object-cover" />
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--gt-text)] tracking-tight">Gamer Pulse</h1>
          <p className="text-sm text-[var(--gt-muted)] mt-1">Loading your library…</p>
        </div>

        {/* Dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-[var(--gt-accent)]"
              style={{ animation: `splash-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>

      {/* Version */}
      <p className="absolute bottom-6 text-xs text-[var(--gt-muted)]/50">v0.1.2</p>
    </div>
  );
}

export default function App() {
  useGameEvents();
  const [ready, setReady] = useState(false);

  const { splashVisible, setSplashVisible } = useUiStore();

  // Hide manual splash after 2s
  useEffect(() => {
    if (!splashVisible) return;
    const t = setTimeout(() => setSplashVisible(false), 2000);
    return () => clearTimeout(t);
  }, [splashVisible, setSplashVisible]);

  const { data: settings, isSuccess } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  useEffect(() => {
    if (!isSuccess) return;
    if (settings?.scanOnLaunch) {
      triggerScan().catch(console.error);
    }
    (async () => {
      setReady(true);
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
    })();
  }, [isSuccess, settings?.scanOnLaunch]);

  const theme = settings?.theme ?? "catppuccin";

  // Inject custom theme CSS variables whenever they change
  useEffect(() => {
    const colors = settings?.customThemeColors ?? {};
    const vars = Object.entries(colors).map(([k, v]) => `${k}: ${v};`).join(" ");
    let el = document.getElementById("gt-custom-theme") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "gt-custom-theme";
      document.head.appendChild(el);
    }
    el.textContent = `[data-theme="custom"] { ${vars} }`;
  }, [settings?.customThemeColors]);

  return (
    <div data-theme={theme} className="flex flex-col h-screen bg-[var(--gt-base)] text-[var(--gt-text)] overflow-hidden">
      {(!ready || splashVisible) && <SplashScreen />}
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-[var(--gt-base)]">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/library/:id" element={<GameDetail />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/history" element={<History />} />
            <Route path="/spin" element={<SpinToPick />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
      <StatusBar />
    </div>
  );
}


