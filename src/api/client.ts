import { invoke } from "@tauri-apps/api/core";

export type GameSource = "steam" | "epic" | "gog" | "xbox" | "riot" | "manual";
export type GameStatus = "installed" | "deleted" | "hidden" | "blocked";

export interface Game {
  id: string;
  name: string;
  source: GameSource;
  sourceId?: string;
  installPath?: string;
  exePath?: string;
  coverUrl?: string;
  bgUrl?: string;
  status: GameStatus;
  isFavorite: boolean;
  notes?: string;
  tags: string[];
  addedAt: string;
  lastScannedAt?: string;
  deletedAt?: string;
  totalPlaySecs?: number;
  lastPlayedAt?: string;
  sessionCount?: number;
}

export interface Session {
  id: string;
  gameId: string;
  gameName?: string;
  startedAt: string;
  endedAt?: string;
  durationSecs?: number;
  processName?: string;
  notes?: string;
}

export interface GameStats {
  gameId: string;
  totalSecs: number;
  sessionCount: number;
  avgSessionSecs: number;
  longestSessionSecs: number;
  firstPlayedAt?: string;
  lastPlayedAt?: string;
  currentStreak: number;
  longestStreak: number;
}

export interface GlobalStats {
  totalGames: number;
  installedGames: number;
  deletedGames: number;
  totalPlaySecs: number;
  totalSessions: number;
  uniqueDaysPlayed: number;
  currentStreak: number;
  longestStreak: number;
  mostPlayedGameId?: string;
  mostPlayedGameName?: string;
}

export interface HeatmapEntry {
  day: string;
  minutes: number;
  sessionCount: number;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate?: string;
  streakStartDate?: string;
}

export interface Achievement {
  id: string;
  gameId: string;
  gameName?: string;
  badgeKey: string;
  badgeLabel: string;
  badgeDescription: string;
  earnedAt: string;
}

export interface DailyPlaytime {
  day: string;
  totalSecs: number;
}

export interface TopGame {
  gameId: string;
  gameName: string;
  totalSecs: number;
  coverUrl?: string;
}

export interface ScanResult {
  added: number;
  updated: number;
  deleted: number;
  total: number;
}

export interface GameFilter {
  search?: string;
  source?: string;
  status?: string;
  tag?: string;
  favoritesOnly?: boolean;
  sortBy?: "name" | "playtime" | "last_played" | "added";
  sortDir?: "asc" | "desc";
}

export interface UserSettings {
  scanOnLaunch: boolean;
  scanIntervalHours: number;
  minimizeToTray: boolean;
  theme: string;
  steamgriddbApiKey: string;
  customScanPaths: string[];
  customThemeColors: Record<string, string>;
  savedThemes: Record<string, Record<string, string>>;
}

export interface NewManualGame {
  name: string;
  exePath?: string;
  coverUrl?: string;
  notes?: string;
  tags?: string[];
}

export interface GamePatch {
  name?: string;
  exePath?: string;
  coverUrl?: string;
  bgUrl?: string;
  notes?: string;
  tags?: string[];
  isFavorite?: boolean;
  status?: string;
}

// ─── Game commands ────────────────────────────────────────────────────────────

export const getGames = (filter?: GameFilter): Promise<Game[]> =>
  invoke("get_games", { filter });

export const getGame = (id: string): Promise<Game> =>
  invoke("get_game", { id });

export const addManualGame = (payload: NewManualGame): Promise<Game> =>
  invoke("add_manual_game", { payload });

export const updateGame = (id: string, patch: GamePatch): Promise<Game> =>
  invoke("update_game", { id, patch });

export const deleteGame = (id: string): Promise<void> =>
  invoke("delete_game", { id });

export const permanentlyDeleteGame = (id: string): Promise<void> =>
  invoke("permanently_delete_game", { id });

export const setFavorite = (id: string, favorite: boolean): Promise<void> =>
  invoke("set_favorite", { id, favorite });

// ─── Session commands ─────────────────────────────────────────────────────────

export const getSessions = (gameId: string): Promise<Session[]> =>
  invoke("get_sessions", { gameId });

export const getRecentSessions = (limit?: number): Promise<Session[]> =>
  invoke("get_recent_sessions", { limit });

export const deleteSession = (sessionId: string): Promise<void> =>
  invoke("delete_session", { sessionId });

export const updateSession = (
  sessionId: string,
  startedAt: string,
  endedAt: string,
): Promise<Session> =>
  invoke("update_session", { sessionId, startedAt, endedAt });

export const updateSessionNotes = (sessionId: string, notes: string): Promise<Session> =>
  invoke("update_session_notes", { sessionId, notes });

// ─── Scanner commands ─────────────────────────────────────────────────────────

export const triggerScan = (): Promise<ScanResult> =>
  invoke("trigger_scan");

// ─── Stats commands ───────────────────────────────────────────────────────────

export const getGameStats = (gameId: string): Promise<GameStats> =>
  invoke("get_game_stats", { gameId });

export const getGlobalStats = (): Promise<GlobalStats> =>
  invoke("get_global_stats");

export const getHeatmap = (year: number, gameId?: string): Promise<HeatmapEntry[]> =>
  invoke("get_heatmap", { year, gameId });

export const getStreak = (): Promise<StreakInfo> =>
  invoke("get_streak");

export const getAchievements = (gameId?: string): Promise<Achievement[]> =>
  invoke("get_achievements", { gameId });

export interface GameStreak {
  gameId: string;
  gameName: string;
  coverUrl?: string;
  currentStreak: number;
  longestStreak: number;
}

export const getGameStreaks = (limit?: number): Promise<GameStreak[]> =>
  invoke("get_game_streaks", { limit });

export const getTopGames = (limit?: number): Promise<TopGame[]> =>
  invoke("get_top_games", { limit });

export const getDailyPlaytime = (days?: number): Promise<DailyPlaytime[]> =>
  invoke("get_daily_playtime", { days });

// ─── Settings commands ────────────────────────────────────────────────────────

export const getSettings = (): Promise<UserSettings> =>
  invoke("get_settings");

export const updateSettings = (settings: UserSettings): Promise<UserSettings> =>
  invoke("update_settings", { settings });

export const exportData = (): Promise<string> =>
  invoke("export_data");

export const resetDatabase = (): Promise<void> =>
  invoke("reset_database");

export const openDbFolder = (): Promise<void> =>
  invoke("open_db_folder");

export const searchCovers = (gameName: string, apiKey: string): Promise<string[]> =>
  invoke("search_covers", { gameName, apiKey });

export const getAutostart = (): Promise<boolean> =>
  invoke("get_autostart");

export const setAutostart = (enabled: boolean): Promise<void> =>
  invoke("set_autostart", { enabled });

export const searchHeroes = (gameName: string, apiKey: string): Promise<string[]> =>
  invoke("search_heroes", { gameName, apiKey });

// ─── Goals ───────────────────────────────────────────────────────────────────

export type GoalPeriod = "weekly" | "monthly" | "total";

export interface GameGoal {
  id: string;
  gameId: string;
  /** "weekly" | "monthly" | "total" */
  period: GoalPeriod;
  targetSecs: number;
  /** Computed for the current period window */
  currentSecs: number;
  createdAt: string;
}

export const getGoals = (gameId: string): Promise<GameGoal[]> =>
  invoke("get_goals", { gameId });

export const setGoal = (gameId: string, period: GoalPeriod, targetSecs: number): Promise<GameGoal[]> =>
  invoke("set_goal", { gameId, period, targetSecs });

export const deleteGoal = (gameId: string, period: GoalPeriod): Promise<void> =>
  invoke("delete_goal", { gameId, period });

// ─── Collections ─────────────────────────────────────────────────────────────

export interface Collection {
  id: string;
  name: string;
  description?: string;
  /** Hex color string, e.g. "#6c7086" */
  color: string;
  /** Lucide icon name, e.g. "folder", "gamepad-2", "star" */
  icon: string;
  /** Sort order among collections */
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Number of games in this collection */
  gameCount: number;
}

export interface NewCollection {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface CollectionPatch {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
}

export const getCollections = (): Promise<Collection[]> =>
  invoke("get_collections");

export const getCollection = (id: string): Promise<Collection> =>
  invoke("get_collection", { id });

export const createCollection = (payload: NewCollection): Promise<Collection> =>
  invoke("create_collection", { payload });

export const updateCollection = (id: string, patch: CollectionPatch): Promise<Collection> =>
  invoke("update_collection", { id, patch });

export const deleteCollection = (id: string): Promise<void> =>
  invoke("delete_collection", { id });

export const reorderCollections = (ids: string[]): Promise<Collection[]> =>
  invoke("reorder_collections", { ids });

export const getCollectionGames = (collectionId: string): Promise<Game[]> =>
  invoke("get_collection_games", { collectionId });

export const addGameToCollection = (collectionId: string, gameId: string): Promise<void> =>
  invoke("add_game_to_collection", { collectionId, gameId });

export const removeGameFromCollection = (collectionId: string, gameId: string): Promise<void> =>
  invoke("remove_game_from_collection", { collectionId, gameId });

export const reorderCollectionGames = (collectionId: string, gameIds: string[]): Promise<Game[]> =>
  invoke("reorder_collection_games", { collectionId, gameIds });

export const getGameCollections = (gameId: string): Promise<Collection[]> =>
  invoke("get_game_collections", { gameId });

// ─── Launch ───────────────────────────────────────────────────────────────────

export const launchGame = (game: Game): Promise<void> =>
  invoke("launch_game", { gameId: game.id });
