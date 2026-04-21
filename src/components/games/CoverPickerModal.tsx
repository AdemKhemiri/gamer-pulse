import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { X, Search, Upload, Link, Loader2, Image } from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { updateGame, searchCovers, searchHeroes, getSettings, Game } from "../../api/client";
import toast from "react-hot-toast";

interface Props {
  game: Game;
  onClose: () => void;
}

function steamCoverUrl(sourceId: string): string {
  return `https://steamcdn-a.akamaihd.net/steam/apps/${sourceId}/library_600x900.jpg`;
}

export default function CoverPickerModal({ game, onClose }: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"search" | "background" | "upload" | "url">("search");
  const [urlInput, setUrlInput] = useState("");
  const [searchQuery, setSearchQuery] = useState(game.name);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(game.coverUrl ?? null);
  const [bgQuery, setBgQuery] = useState(game.name);
  const [bgResults, setBgResults] = useState<string[]>([]);
  const [bgSearching, setBgSearching] = useState(false);
  const [selectedBgUrl, setSelectedBgUrl] = useState<string | null>(game.bgUrl ?? null);

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const saveMutation = useMutation({
    mutationFn: (patch: string | { bgUrl: string }) =>
      typeof patch === "string"
        ? updateGame(game.id, { coverUrl: patch })
        : updateGame(game.id, { bgUrl: patch.bgUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.invalidateQueries({ queryKey: ["game", game.id] });
      toast.success(tab === "background" ? "Background updated" : "Cover updated");
      onClose();
    },
    onError: () => toast.error("Failed to update"),
  });

  // Auto-search covers on mount
  useEffect(() => {
    if (game.source === "steam" && game.sourceId) {
      setSearchResults([steamCoverUrl(game.sourceId)]);
    }
    if (settings?.steamgriddbApiKey) {
      handleSearch(game.name);
    }
  }, [settings?.steamgriddbApiKey]);

  // Auto-search backgrounds on mount
  useEffect(() => {
    if (!settings) return;
    const steamHero = game.source === "steam" && game.sourceId
      ? [`https://steamcdn-a.akamaihd.net/steam/apps/${game.sourceId}/library_hero.jpg`]
      : [];
    if (steamHero.length) setBgResults(steamHero);
    if (settings.steamgriddbApiKey) handleBgSearch(game.name, steamHero);
  }, [settings?.steamgriddbApiKey]);

  async function handleSearch(query = searchQuery) {
    const q = query.trim();
    if (!q) return;
    if (!settings?.steamgriddbApiKey && !(game.source === "steam" && game.sourceId)) {
      toast.error("Set your SteamGridDB API key in Settings to search covers");
      return;
    }
    setSearching(true);
    try {
      const steamResult = game.source === "steam" && game.sourceId ? [steamCoverUrl(game.sourceId)] : [];
      const gridResults = settings?.steamgriddbApiKey ? await searchCovers(q, settings.steamgriddbApiKey) : [];
      setSearchResults([...steamResult, ...gridResults]);
    } catch {
      toast.error("Cover search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleBgSearch(query = bgQuery, prepend: string[] = []) {
    const q = query.trim();
    if (!q) return;
    setBgSearching(true);
    try {
      const gridResults = settings?.steamgriddbApiKey ? await searchHeroes(q, settings.steamgriddbApiKey) : [];
      setBgResults([...prepend, ...gridResults]);
    } catch {
      toast.error("Background search failed");
    } finally {
      setBgSearching(false);
    }
  }

  async function handleFilePick() {
    const result = await openFileDialog({
      title: "Select Cover Image",
      filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
      multiple: false,
    });
    if (!result) return;
    const path = typeof result === "string" ? result : (result as { path: string }).path;
    const assetUrl = convertFileSrc(path);
    setSelectedUrl(assetUrl);
    setTab("url");
    setUrlInput(assetUrl);
  }

  function handleApply() {
    if (tab === "background") {
      if (!selectedBgUrl) { toast.error("No background selected"); return; }
      saveMutation.mutate({ bgUrl: selectedBgUrl });
      return;
    }
    const url = tab === "url" ? urlInput.trim() : selectedUrl;
    if (!url) { toast.error("No cover selected"); return; }
    saveMutation.mutate(url);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-[560px] max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "rgba(15,15,20,0.95)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-white font-semibold text-base">Set Cover</h2>
            <p className="text-white/40 text-xs mt-0.5 truncate max-w-[400px]">{game.name}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {(["search", "background", "upload", "url"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tab === t
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:text-white/70 hover:bg-white/8"
              }`}
            >
              {t === "search" ? "Cover Search" : t === "background" ? "Background" : t === "upload" ? "Upload File" : "Paste URL"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 min-h-0">
          {tab === "search" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch(searchQuery)}
                    placeholder="Game name…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-white text-sm placeholder-white/25 focus:outline-none focus:border-white/30"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                </div>
                <button
                  onClick={() => handleSearch(searchQuery)}
                  disabled={searching}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
                >
                  {searching ? <Loader2 size={14} className="animate-spin text-black" /> : <Search size={14} />}
                  {searching ? "Searching…" : "Search"}
                </button>
              </div>
              {!settings?.steamgriddbApiKey && (
                <p className="text-white/30 text-[11px]">Add a SteamGridDB API key in Settings for more results</p>
              )}

              {searchResults.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {searchResults.map((url) => (
                    <button
                      key={url}
                      onClick={() => setSelectedUrl(url)}
                      className={`relative aspect-[2/3] rounded-lg overflow-hidden cursor-pointer transition-all ${
                        selectedUrl === url
                          ? "ring-2 ring-white scale-[1.02]"
                          : "ring-1 ring-white/10 hover:ring-white/40 hover:scale-[1.02]"
                      }`}
                    >
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                        }}
                      />
                    </button>
                  ))}
                </div>
              ) : !searching && (
                <div className="flex flex-col items-center justify-center py-10 text-white/30">
                  <Image size={32} className="mb-2" />
                  <p className="text-sm">Click "Search Covers" to find art</p>
                </div>
              )}
            </div>
          )}

          {tab === "background" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                  <input
                    type="text"
                    value={bgQuery}
                    onChange={(e) => setBgQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleBgSearch(bgQuery)}
                    placeholder="Game name…"
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-white text-sm placeholder-white/25 focus:outline-none focus:border-white/30"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                </div>
                <button
                  onClick={() => handleBgSearch(bgQuery)}
                  disabled={bgSearching}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
                >
                  {bgSearching ? <Loader2 size={14} className="animate-spin text-black" /> : <Search size={14} />}
                  {bgSearching ? "Searching…" : "Search"}
                </button>
              </div>
              {!settings?.steamgriddbApiKey && (
                <p className="text-white/30 text-[11px]">Add a SteamGridDB API key in Settings for more results</p>
              )}

              {bgResults.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {bgResults.map((url) => (
                    <button
                      key={url}
                      onClick={() => setSelectedBgUrl(url)}
                      className={`relative rounded-lg overflow-hidden cursor-pointer transition-all ${
                        selectedBgUrl === url
                          ? "ring-2 ring-white scale-[1.01]"
                          : "ring-1 ring-white/10 hover:ring-white/40"
                      }`}
                      style={{ aspectRatio: "16/5" }}
                    >
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                      />
                    </button>
                  ))}
                </div>
              ) : !bgSearching && (
                <div className="flex flex-col items-center justify-center py-10 text-white/30">
                  <Image size={32} className="mb-2" />
                  <p className="text-sm">Search to find background art</p>
                </div>
              )}
            </div>
          )}

          {tab === "upload" && (
            <div className="space-y-4">
              <button
                onClick={handleFilePick}
                className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-xl border-2 border-dashed border-white/15 hover:border-white/30 text-white/50 hover:text-white/80 transition-all cursor-pointer"
              >
                <Upload size={28} />
                <div className="text-center">
                  <p className="text-sm font-medium">Click to select image</p>
                  <p className="text-xs mt-1">JPG, PNG, WebP supported</p>
                </div>
              </button>
              {selectedUrl && (
                <div className="aspect-[2/3] w-32 mx-auto rounded-lg overflow-hidden">
                  <img src={selectedUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          )}

          {tab === "url" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/cover.jpg"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white/8 border border-white/10 text-white text-sm placeholder-white/25 focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>
              {urlInput && (
                <div className="aspect-[2/3] w-32 mx-auto rounded-lg overflow-hidden bg-white/5">
                  <img src={urlInput} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-white/8">
          {tab === "search" && selectedUrl && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-12 rounded overflow-hidden flex-shrink-0">
                <img src={selectedUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <p className="text-xs text-white/40 truncate">Cover selected</p>
            </div>
          )}
          {tab === "background" && selectedBgUrl && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="h-8 w-24 rounded overflow-hidden flex-shrink-0">
                <img src={selectedBgUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <p className="text-xs text-white/40 truncate">Background selected</p>
            </div>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-white/12 text-white/60 text-sm hover:text-white hover:border-white/25 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={saveMutation.isPending || (tab === "background" ? !selectedBgUrl : (!selectedUrl && !urlInput))}
              className="px-5 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {saveMutation.isPending ? "Saving…" : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
