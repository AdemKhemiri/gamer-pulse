import { Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TopNav from "./components/layout/TopNav";
import StatusBar from "./components/layout/StatusBar";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import GameDetail from "./pages/GameDetail";
import Stats from "./pages/Stats";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Compare from "./pages/Compare";
import SpinToPick from "./pages/SpinToPick";
import Collections from "./pages/Collections";
import CollectionDetail from "./pages/CollectionDetail";
import { useGameEvents } from "./hooks/useGameEvents";
import { triggerScan, getSettings } from "./api/client";
import { useUiStore } from "./store/uiStore";
import { check } from "@tauri-apps/plugin-updater";

function SplashScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-[200]" style={{ background: "#050505" }}>
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
        <div
          className="w-24 h-24 rounded-2xl overflow-hidden shadow-2xl"
          style={{ animation: "splash-pulse 2s ease-in-out infinite", boxShadow: "0 0 40px rgba(255,255,255,0.1)" }}
        >
          <img src="/logo.png" alt="Gamer Pulse" className="w-full h-full object-cover" />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">GAMER PULSE</h1>
          <p className="text-sm text-white/40 mt-1">Loading your library…</p>
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-white/60"
              style={{ animation: `splash-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
      <p className="absolute bottom-6 text-xs text-white/20">v0.2.0</p>
    </div>
  );
}

export default function App() {
  useGameEvents();
  const [ready, setReady] = useState(false);
  const { splashVisible, setSplashVisible } = useUiStore();

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
      check().catch(console.error);
    })();
  }, [isSuccess, settings?.scanOnLaunch]);

  const theme = settings?.theme ?? "catppuccin";

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
    <div
      data-theme={theme}
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "#050505", color: "#fff" }}
    >
      {(!ready || splashVisible) && <SplashScreen />}

      {/* Fixed dark base */}
      <div className="fixed inset-0 z-0" style={{ background: "#050505" }} />

      <TopNav />

      <main className="flex-1 overflow-hidden relative z-10">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/:id" element={<GameDetail />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/history" element={<History />} />
          <Route path="/spin" element={<SpinToPick />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:id" element={<CollectionDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <StatusBar />
    </div>
  );
}
