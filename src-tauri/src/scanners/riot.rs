use std::path::PathBuf;

use crate::models::{DetectedGame, GameSource};

use super::{utils, Scanner, ScanConfig};

pub struct RiotScanner;

impl Scanner for RiotScanner {
    fn name(&self) -> &'static str {
        "Riot Games"
    }

    fn scan(&self, _config: &ScanConfig) -> Vec<DetectedGame> {
        match scan_riot() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[Riot] Scan error: {e}");
                vec![]
            }
        }
    }
}

/// Metadata for known Riot games keyed by the DisplayName that appears in the
/// Windows Uninstall registry and the Riot Client config.
/// (display_name_lower, source_id, cover_url)
const KNOWN_RIOT_GAMES: &[(&str, &str, Option<&str>)] = &[
    (
        "valorant",
        "riot_valorant",
        Some("https://cdn2.steamgriddb.com/grid/9edb6b9b7fc3b263b86740c635839dc4.png"),
    ),
    (
        "league of legends",
        "riot_lol",
        Some("https://cdn2.steamgriddb.com/grid/09a5fce5b160f37ab1a9b4c89a36f557.jpg"),
    ),
    (
        "teamfight tactics",
        "riot_tft",
        Some("https://cdn2.steamgriddb.com/grid/4d5c9c428c4e61a4c034ee2ab0430e29.jpg"),
    ),
];

fn scan_riot() -> anyhow::Result<Vec<DetectedGame>> {
    // Strategy 1 (most reliable): Windows Uninstall registry.
    // Riot registers all games here regardless of install location.
    let mut games = scan_from_registry();

    // Strategy 2: Riot Client's RiotClientInstalls.json.
    // Covers cases where the registry entry is missing (e.g. portable install).
    if games.is_empty() {
        games = scan_from_client_json();
    }

    // Strategy 3: Hardcoded default install roots.
    // Last resort for very old installs that predate registry entries.
    if games.is_empty() {
        games = scan_from_default_paths();
    }

    Ok(games)
}

// ── Strategy 1: Windows Uninstall registry ─────────────────────────────────────

fn scan_from_registry() -> Vec<DetectedGame> {
    #[cfg(not(windows))]
    return vec![];

    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut games = Vec::new();

        let hives: &[(winreg::HKEY, &str)] = &[
            (
                HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            ),
            (
                HKEY_LOCAL_MACHINE,
                r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
            ),
            (
                HKEY_CURRENT_USER,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            ),
        ];

        for (hive, path) in hives {
            let Ok(key) = RegKey::predef(*hive).open_subkey(path) else {
                continue;
            };

            for subkey_name in key.enum_keys().flatten() {
                let Ok(subkey) = key.open_subkey(&subkey_name) else {
                    continue;
                };

                let publisher: String = subkey.get_value("Publisher").unwrap_or_default();
                if !publisher.to_lowercase().contains("riot games") {
                    continue;
                }

                let display_name: String = subkey.get_value("DisplayName").unwrap_or_default();
                let install_loc: String = subkey.get_value("InstallLocation").unwrap_or_default();

                if display_name.is_empty() || install_loc.is_empty() {
                    continue;
                }

                let path = PathBuf::from(&install_loc);
                if !path.exists() {
                    continue;
                }

                // Skip the Riot Client launcher itself — it's not a game
                let name_lower = display_name.to_lowercase();
                if name_lower.contains("riot client") || name_lower.contains("riot vanguard") {
                    continue;
                }

                let game = build_detected_game(display_name, install_loc, &path);
                games.push(game);
            }
        }

        games
    }
}

// ── Strategy 2: RiotClientInstalls.json ────────────────────────────────────────

fn scan_from_client_json() -> Vec<DetectedGame> {
    let local_appdata =
        std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());

    // The Riot Client stores its product install map in this file.
    let candidates = [
        PathBuf::from(&local_appdata)
            .join("Riot Games")
            .join("Riot Client")
            .join("Data")
            .join("RiotClientInstalls.json"),
        // Alternate location used by some versions of the client
        PathBuf::from(r"C:\ProgramData\Riot Games\RiotClientInstalls.json"),
    ];

    for json_path in &candidates {
        if !json_path.exists() {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(json_path) else {
            continue;
        };
        let Ok(json): Result<serde_json::Value, _> = serde_json::from_str(&content) else {
            continue;
        };

        let mut games = Vec::new();

        // The file is a flat object: product_id → install_path string
        // e.g. { "valorant": "D:\\Games\\VALORANT", "league_of_legends": "..." }
        if let Some(obj) = json.as_object() {
            for (product_id, value) in obj {
                // Skip the Riot Client entries themselves
                if product_id.starts_with("rc_") || product_id == "pbe" {
                    continue;
                }

                let install_path = match value.as_str() {
                    Some(s) if !s.is_empty() => s.to_string(),
                    _ => continue,
                };

                let path = PathBuf::from(&install_path);
                if !path.exists() {
                    continue;
                }

                // Map product IDs like "league_of_legends" → display name
                let display_name = product_id_to_display_name(product_id);
                let game = build_detected_game(display_name, install_path, &path);
                games.push(game);
            }
        }

        if !games.is_empty() {
            return games;
        }
    }

    vec![]
}

// ── Strategy 3: hardcoded default paths ────────────────────────────────────────

/// Known Riot Games sub-folders and their exe relative paths.
/// Only used as last resort when registry and JSON both fail.
const FALLBACK_GAMES: &[(&str, &str, &str)] = &[
    ("VALORANT", "VALORANT", r"live\ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe"),
    ("League of Legends", "League of Legends", r"Game\League of Legends.exe"),
    ("Teamfight Tactics", "Teamfight Tactics", r"Game\League of Legends.exe"),
];

fn scan_from_default_paths() -> Vec<DetectedGame> {
    let candidates = [
        PathBuf::from(r"C:\Riot Games"),
        PathBuf::from(
            std::env::var("PROGRAMFILES").unwrap_or_default(),
        )
        .join("Riot Games"),
        PathBuf::from(
            std::env::var("PROGRAMFILES(X86)").unwrap_or_default(),
        )
        .join("Riot Games"),
    ];

    let Some(riot_root) = candidates.into_iter().find(|p| p.exists()) else {
        return vec![];
    };

    let mut games = Vec::new();
    for (folder, display_name, exe_rel) in FALLBACK_GAMES {
        let install_path = riot_root.join(folder);
        if !install_path.exists() {
            continue;
        }

        let exe_path = install_path.join(exe_rel);
        let exe = if exe_path.exists() {
            Some(exe_path.to_string_lossy().into_owned())
        } else {
            utils::find_largest_exe(&install_path, 1)
        };

        let (source_id, cover_url) = metadata_for_name(display_name);

        games.push(DetectedGame {
            source: GameSource::Riot,
            source_id,
            name: display_name.to_string(),
            install_path: Some(install_path.to_string_lossy().into_owned()),
            exe_path: exe,
            cover_url,
        });
    }
    games
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

/// Build a `DetectedGame` from a registry or JSON entry.
fn build_detected_game(display_name: String, install_path: String, path: &PathBuf) -> DetectedGame {
    let exe_path = utils::find_largest_exe(path, 4);
    let (source_id, cover_url) = metadata_for_name(&display_name);

    DetectedGame {
        source: GameSource::Riot,
        source_id,
        name: display_name,
        install_path: Some(install_path),
        exe_path,
        cover_url,
    }
}

/// Look up source_id and cover_url for a known Riot game by display name.
/// Falls back to a normalized name slug for unknown games.
fn metadata_for_name(display_name: &str) -> (String, Option<String>) {
    let lower = display_name.to_lowercase();
    for (key, source_id, cover_url) in KNOWN_RIOT_GAMES {
        if lower.contains(key) {
            return (source_id.to_string(), cover_url.map(|u| u.to_string()));
        }
    }
    // Unknown Riot game — create a stable source_id from the name
    let source_id = format!(
        "riot_{}",
        lower.replace(' ', "_").replace(|c: char| !c.is_alphanumeric() && c != '_', "")
    );
    (source_id, None)
}

/// Convert a Riot product ID (from RiotClientInstalls.json) to a display name.
fn product_id_to_display_name(id: &str) -> String {
    match id {
        "valorant" => "VALORANT".to_string(),
        "league_of_legends" => "League of Legends".to_string(),
        "teamfight_tactics" => "Teamfight Tactics".to_string(),
        "bacon" => "Legends of Runeterra".to_string(),
        other => {
            // Convert snake_case to Title Case as a best-effort display name
            other
                .split('_')
                .map(|w| {
                    let mut c = w.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        }
    }
}
