use std::collections::HashSet;

use crate::models::{DetectedGame, GameSource};

use super::{Scanner, ScanConfig};

pub struct GogScanner;

impl Scanner for GogScanner {
    fn name(&self) -> &'static str {
        "GOG Galaxy"
    }

    fn scan(&self, _config: &ScanConfig) -> Vec<DetectedGame> {
        match scan_gog() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[GOG] Scan error: {e}");
                vec![]
            }
        }
    }
}

fn scan_gog() -> anyhow::Result<Vec<DetectedGame>> {
    #[cfg(not(windows))]
    return Ok(vec![]);

    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let mut games: Vec<DetectedGame> = Vec::new();
        // Track seen source IDs to deduplicate across registry hives
        let mut seen_ids: HashSet<String> = HashSet::new();

        let paths = [
            (HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\GOG.com\\Games"),
            (HKEY_LOCAL_MACHINE, "SOFTWARE\\GOG.com\\Games"),
            (HKEY_CURRENT_USER, "SOFTWARE\\GOG.com\\Games"),
        ];

        for (hive, path) in &paths {
            let root = RegKey::predef(*hive);
            let Ok(games_key) = root.open_subkey(path) else {
                continue;
            };

            for subkey_name in games_key.enum_keys().flatten() {
                // Skip if already seen from another hive
                if seen_ids.contains(&subkey_name) {
                    continue;
                }

                let Ok(game_key) = games_key.open_subkey(&subkey_name) else {
                    continue;
                };

                let name: String = game_key.get_value("gameName").unwrap_or_default();
                let path_val: String = game_key.get_value("path").unwrap_or_default();
                let exe: String = game_key.get_value("exe").unwrap_or_default();

                if name.is_empty() {
                    continue;
                }

                let exe_path = if !exe.is_empty() {
                    Some(exe)
                } else if !path_val.is_empty() {
                    // Try to find the first exe in the install directory
                    let p = std::path::PathBuf::from(&path_val);
                    p.read_dir().ok().and_then(|mut d| {
                        d.find_map(|e| {
                            let e = e.ok()?;
                            let p = e.path();
                            if p.extension()?.to_str()? == "exe" {
                                Some(p.to_string_lossy().into_owned())
                            } else {
                                None
                            }
                        })
                    })
                } else {
                    None
                };

                seen_ids.insert(subkey_name.clone());
                games.push(DetectedGame {
                    source: GameSource::Gog,
                    source_id: subkey_name,
                    name,
                    install_path: if path_val.is_empty() {
                        None
                    } else {
                        Some(path_val)
                    },
                    exe_path,
                    cover_url: None,
                });
            }
        }

        Ok(games)
    }
}
