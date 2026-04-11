use std::path::PathBuf;

use crate::models::{DetectedGame, GameSource};

use super::{utils, Scanner, ScanConfig};

pub struct BattlenetScanner;

impl Scanner for BattlenetScanner {
    fn name(&self) -> &'static str {
        "Battle.net"
    }

    fn scan(&self, _config: &ScanConfig) -> Vec<DetectedGame> {
        match scan_battlenet() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[Battle.net] Scan error: {e}");
                vec![]
            }
        }
    }
}

/// Known Battle.net product codes and their display names.
/// Used as a fallback when the registry doesn't have the game listed.
const BNET_KNOWN_GAMES: &[(&str, &str)] = &[
    ("wow", "World of Warcraft"),
    ("wowc", "WoW Classic"),
    ("ow", "Overwatch 2"),
    ("d3", "Diablo III"),
    ("d4", "Diablo IV"),
    ("s1", "StarCraft"),
    ("s2", "StarCraft II"),
    ("hero", "Heroes of the Storm"),
    ("hsb", "Hearthstone"),
    ("w3", "Warcraft III"),
    ("lazarus", "Call of Duty: Modern Warfare"),
    ("viper", "Call of Duty: Black Ops 4"),
    ("odin", "Call of Duty: Modern Warfare II"),
    ("zeus", "Call of Duty: Black Ops 6"),
];

fn scan_battlenet() -> anyhow::Result<Vec<DetectedGame>> {
    #[cfg(not(windows))]
    return Ok(vec![]);

    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut games = Vec::new();
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

        // Primary: registry under HKLM\SOFTWARE\WOW6432Node\Blizzard Entertainment
        // Each subkey is a game name, with an "InstallPath" value.
        if let Ok(blizzard_key) = hklm
            .open_subkey(r"SOFTWARE\WOW6432Node\Blizzard Entertainment")
            .or_else(|_| hklm.open_subkey(r"SOFTWARE\Blizzard Entertainment"))
        {
            for subkey_name in blizzard_key.enum_keys().flatten() {
                let Ok(game_key) = blizzard_key.open_subkey(&subkey_name) else {
                    continue;
                };

                let install_path: String = game_key
                    .get_value("InstallPath")
                    .or_else(|_| game_key.get_value("GamePath"))
                    .unwrap_or_default();

                if install_path.is_empty() {
                    continue;
                }

                let path = PathBuf::from(&install_path);
                if !path.exists() {
                    continue;
                }

                let source_id = subkey_name
                    .to_lowercase()
                    .replace(' ', "_")
                    .replace([':', '-'], "");
                let exe_path = utils::find_largest_exe(&path, 2);

                games.push(DetectedGame {
                    source: GameSource::Battlenet,
                    source_id,
                    name: subkey_name,
                    install_path: Some(install_path),
                    exe_path,
                    cover_url: None,
                });
            }
        }

        // Fallback: scan %PROGRAMDATA%\Battle.net\Agent\data\app\
        // Each subdirectory is a product code. Look for a uid.db or agent.db
        // file to confirm it's an installed game, then resolve the install path
        // from the known game list.
        if games.is_empty() {
            let agent_dir = PathBuf::from(
                std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string()),
            )
            .join("Battle.net\\Agent\\data\\app");

            if agent_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&agent_dir) {
                    for entry in entries.flatten() {
                        let product_dir = entry.path();
                        if !product_dir.is_dir() {
                            continue;
                        }
                        let product_code = product_dir
                            .file_name()
                            .map(|n| n.to_string_lossy().to_lowercase())
                            .unwrap_or_default();

                        // Match against known game codes
                        let display_name = BNET_KNOWN_GAMES
                            .iter()
                            .find(|(code, _)| product_code == *code)
                            .map(|(_, name)| *name);

                        let Some(display_name) = display_name else {
                            continue;
                        };

                        // Try to find the actual install path from common locations
                        let install_path = find_bnet_install_path(&product_code);
                        let Some(install_path) = install_path else {
                            continue;
                        };

                        let exe_path = utils::find_largest_exe(&install_path, 2);
                        let source_id = product_code.clone();

                        games.push(DetectedGame {
                            source: GameSource::Battlenet,
                            source_id,
                            name: display_name.to_string(),
                            install_path: Some(install_path.to_string_lossy().into_owned()),
                            exe_path,
                            cover_url: None,
                        });
                    }
                }
            }
        }

        Ok(games)
    }
}

/// Try to locate the actual game install directory for a Battle.net product code
/// by checking common default install locations.
#[cfg(windows)]
fn find_bnet_install_path(product_code: &str) -> Option<PathBuf> {
    let program_files = std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files".to_string());
    let program_files_x86 = std::env::var("PROGRAMFILES(X86)").unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());

    // Map product codes to known install folder names
    let folder_name = match product_code {
        "wow" | "wowc" => "World of Warcraft",
        "ow" => "Overwatch",
        "d3" => "Diablo III",
        "d4" => "Diablo IV",
        "s1" => "StarCraft",
        "s2" => "StarCraft II",
        "hero" => "Heroes of the Storm",
        "hsb" => "Hearthstone",
        "w3" => "Warcraft III",
        _ => return None,
    };

    let candidates = [
        PathBuf::from(&program_files).join("Battle.net").join(folder_name),
        PathBuf::from(&program_files_x86).join("Battle.net").join(folder_name),
        PathBuf::from("C:\\Games").join(folder_name),
    ];

    candidates.into_iter().find(|p| p.exists())
}
