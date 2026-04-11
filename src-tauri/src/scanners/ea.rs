use std::path::PathBuf;

use crate::models::{DetectedGame, GameSource};

use super::{utils, Scanner, ScanConfig};

pub struct EaScanner;

impl Scanner for EaScanner {
    fn name(&self) -> &'static str {
        "EA App"
    }

    fn scan(&self, _config: &ScanConfig) -> Vec<DetectedGame> {
        match scan_ea() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[EA] Scan error: {e}");
                vec![]
            }
        }
    }
}

fn scan_ea() -> anyhow::Result<Vec<DetectedGame>> {
    #[cfg(not(windows))]
    return Ok(vec![]);

    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut games = Vec::new();

        // Primary: EA registry
        // HKLM\SOFTWARE\WOW6432Node\Electronic Arts — each subkey is a game
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(ea_key) = hklm
            .open_subkey(r"SOFTWARE\WOW6432Node\Electronic Arts")
            .or_else(|_| hklm.open_subkey(r"SOFTWARE\Electronic Arts"))
        {
            for subkey_name in ea_key.enum_keys().flatten() {
                let Ok(game_key) = ea_key.open_subkey(&subkey_name) else {
                    continue;
                };

                // EA uses "Install Dir" (with space) as the registry value name
                let install_dir: String = game_key
                    .get_value("Install Dir")
                    .or_else(|_| game_key.get_value("InstallDir"))
                    .unwrap_or_default();

                if install_dir.is_empty() {
                    continue;
                }

                let path = PathBuf::from(&install_dir);
                if !path.exists() {
                    continue;
                }

                let source_id = subkey_name.to_lowercase().replace(' ', "_");
                let exe_path = utils::find_largest_exe(&path, 3);

                games.push(DetectedGame {
                    source: GameSource::Ea,
                    source_id,
                    name: subkey_name,
                    install_path: Some(install_dir),
                    exe_path,
                    cover_url: None,
                });
            }
        }

        // Fallback: parse Origin .mfst manifest files
        // These are JSON files left by the old Origin launcher.
        if games.is_empty() {
            let mfst_dir = PathBuf::from(
                std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string()),
            )
            .join("Origin\\LocalContent");

            if mfst_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&mfst_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("mfst") {
                            if let Some(game) = parse_mfst(&path) {
                                games.push(game);
                            }
                        }
                    }
                }
            }
        }

        Ok(games)
    }
}

fn parse_mfst(path: &std::path::Path) -> Option<DetectedGame> {
    let content = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;

    let id = json["id"].as_str()?.to_string();
    let install_path = json["dipInstallPath"].as_str()?;
    if install_path.is_empty() {
        return None;
    }

    let p = PathBuf::from(install_path);
    if !p.exists() {
        return None;
    }

    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| id.clone());

    let exe_path = utils::find_largest_exe(&p, 3);

    Some(DetectedGame {
        source: GameSource::Ea,
        source_id: id,
        name,
        install_path: Some(install_path.to_string()),
        exe_path,
        cover_url: None,
    })
}
