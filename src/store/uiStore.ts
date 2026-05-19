import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ScanProgress {
  stage: string;
  count: number;
}

interface UiStore {
  currentlyPlayingGameId: string | null;
  scanProgress: ScanProgress | null;
  sidebarCollapsed: boolean;
  viewMode: "grid" | "list";
  splashVisible: boolean;
  selectedLibraryIndex: number;
  showContinuePlaying: boolean;

  setCurrentlyPlaying: (gameId: string | null) => void;
  setScanProgress: (progress: ScanProgress | null) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setViewMode: (v: "grid" | "list") => void;
  setSplashVisible: (v: boolean) => void;
  setSelectedLibraryIndex: (v: number) => void;
  setShowContinuePlaying: (v: boolean) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      currentlyPlayingGameId: null,
      scanProgress: null,
      sidebarCollapsed: false,
      viewMode: "grid",
      splashVisible: false,
      selectedLibraryIndex: 0,
      showContinuePlaying: true,

      setCurrentlyPlaying: (gameId) => set({ currentlyPlayingGameId: gameId }),
      setScanProgress: (progress) => set({ scanProgress: progress }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setViewMode: (v) => set({ viewMode: v }),
      setSplashVisible: (v) => set({ splashVisible: v }),
      setSelectedLibraryIndex: (v) => set({ selectedLibraryIndex: v }),
      setShowContinuePlaying: (v) => set({ showContinuePlaying: v }),
    }),
    {
      name: "gp-ui",
      partialize: (s) => ({ viewMode: s.viewMode, sidebarCollapsed: s.sidebarCollapsed, showContinuePlaying: s.showContinuePlaying }),
    }
  )
);
