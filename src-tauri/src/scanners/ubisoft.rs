use std::collections::HashMap;
use std::path::PathBuf;

use crate::models::{DetectedGame, GameSource};

use super::{utils, Scanner, ScanConfig};

pub struct UbisoftScanner;

impl Scanner for UbisoftScanner {
    fn name(&self) -> &'static str {
        "Ubisoft Connect"
    }

    fn scan(&self, _config: &ScanConfig) -> Vec<DetectedGame> {
        match scan_ubisoft() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[Ubisoft] Scan error: {e}");
                vec![]
            }
        }
    }
}

fn scan_ubisoft() -> anyhow::Result<Vec<DetectedGame>> {
    #[cfg(not(windows))]
    return Ok(vec![]);

    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

        // Build a map of install_path_lower → display_name from the Windows
        // Uninstall registry so we can look up proper game names by install path.
        let name_map = build_display_name_map(&hklm);

        let installs_key = hklm
            .open_subkey(r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs")
            .or_else(|_| hklm.open_subkey(r"SOFTWARE\Ubisoft\Launcher\Installs"))?;

        let mut games = Vec::new();

        for id in installs_key.enum_keys().flatten() {
            let Ok(subkey) = installs_key.open_subkey(&id) else {
                continue;
            };

            let install_dir: String = subkey.get_value("InstallDir").unwrap_or_default();
            if install_dir.is_empty() {
                continue;
            }

            let path = PathBuf::from(&install_dir);
            if !path.exists() {
                continue;
            }

            // Look up the display name from the Uninstall registry
            let normalized = install_dir
                .to_lowercase()
                .trim_end_matches('\\')
                .to_string();
            let name = name_map
                .get(&normalized)
                .cloned()
                .unwrap_or_else(|| {
                    path.file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| id.clone())
                });

            let exe_path = utils::find_largest_exe(&path, 3);

            games.push(DetectedGame {
                source: GameSource::Ubisoft,
                source_id: id,
                name,
                install_path: Some(install_dir),
                exe_path,
                cover_url: None,
            });
        }

        Ok(games)
    }
}

/// Build a map of `install_path_lowercase` → `DisplayName` from the Windows
/// Uninstall registry for Ubisoft-published titles.
#[cfg(windows)]
fn build_display_name_map(hklm: &winreg::RegKey) -> HashMap<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let mut map: HashMap<String, String> = HashMap::new();

    let uninstall_paths = [
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let hives: &[&winreg::RegKey] = &[hklm, &hkcu];

    for (hive, path) in hives.iter().flat_map(|h| {
        uninstall_paths
            .iter()
            .map(move |p| (*h, *p))
    }) {
        let Ok(key) = hive.open_subkey(path) else {
            continue;
        };
        for subkey_name in key.enum_keys().flatten() {
            let Ok(subkey) = key.open_subkey(&subkey_name) else {
                continue;
            };
            let publisher: String = subkey.get_value("Publisher").unwrap_or_default();
            let display_name: String = subkey.get_value("DisplayName").unwrap_or_default();
            let install_loc: String = subkey.get_value("InstallLocation").unwrap_or_default();

            if install_loc.is_empty() || display_name.is_empty() {
                continue;
            }

            // Only index Ubisoft-published titles for name lookup
            let pub_lower = publisher.to_lowercase();
            if pub_lower.contains("ubisoft") {
                let normalized = install_loc
                    .to_lowercase()
                    .trim_end_matches('\\')
                    .to_string();
                map.entry(normalized).or_insert(display_name);
            }
        }
    }

    map
}

#[cfg(not(windows))]
fn build_display_name_map(_hklm: &()) -> HashMap<String, String> {
    HashMap::new()
}
