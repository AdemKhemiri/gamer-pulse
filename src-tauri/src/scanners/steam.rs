use std::path::{Path, PathBuf};

use crate::models::{DetectedGame, GameSource};

use super::{utils, Scanner, ScanConfig};

pub struct SteamScanner;

impl Scanner for SteamScanner {
    fn name(&self) -> &'static str {
        "Steam"
    }

    fn scan(&self, _config: &ScanConfig) -> Vec<DetectedGame> {
        match scan_steam() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[Steam] Scan error: {e}");
                vec![]
            }
        }
    }
}

fn scan_steam() -> anyhow::Result<Vec<DetectedGame>> {
    #[cfg(not(windows))]
    return Ok(vec![]);

    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        // Find Steam installation path from registry
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let steam_key = hkcu.open_subkey("Software\\Valve\\Steam").or_else(|_| {
            let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
            hklm.open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam")
        })?;

        let steam_path: String = steam_key.get_value("SteamPath")?;
        let steam_root = PathBuf::from(&steam_path);

        // Find all library folders
        let library_file = steam_root.join("steamapps/libraryfolders.vdf");
        let library_paths = parse_library_folders(&library_file, &steam_root);

        // Scan each library for *.acf manifests
        let mut games = Vec::new();
        for lib_path in library_paths {
            let steamapps = lib_path.join("steamapps");
            if !steamapps.exists() {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(&steamapps) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("acf") {
                        if let Some(game) = parse_acf(&path, &steamapps) {
                            games.push(game);
                        }
                    }
                }
            }
        }
        Ok(games)
    }
}

/// Parse `libraryfolders.vdf` to find all Steam library root paths.
///
/// Handles both VDF format variants:
/// - New format: nested objects with `"path"` key
///   `"path"  "D:\\SteamLibrary"`
/// - Old format: direct numeric key → path value
///   `"1"  "D:\\SteamLibrary"`
fn parse_library_folders(vdf_path: &Path, steam_root: &Path) -> Vec<PathBuf> {
    let mut paths = vec![steam_root.to_path_buf()];
    let mut seen = std::collections::HashSet::new();
    seen.insert(steam_root.to_path_buf());

    let content = match std::fs::read_to_string(vdf_path) {
        Ok(c) => c,
        Err(_) => return paths,
    };

    for line in content.lines() {
        let line = line.trim();

        // New format: line contains the "path" key
        // e.g.   "path"		"D:\\SteamLibrary"
        if line.contains("\"path\"") {
            if let Some(val) = extract_vdf_quoted_value(line, "path") {
                let p = PathBuf::from(val);
                if p.exists() && !seen.contains(&p) {
                    seen.insert(p.clone());
                    paths.push(p);
                }
            }
            continue;
        }

        // Old format: line is `"<number>"  "<path>"` where the key is a digit
        // e.g.   "1"		"D:\\SteamLibrary"
        let parts: Vec<&str> = line.split('"').collect();
        // parts layout for `"1"  "D:\\SteamLibrary"`:
        // ["", "1", "  ", "D:\\SteamLibrary", ""]
        if parts.len() >= 5 {
            let key = parts[1];
            let value = parts[3].replace("\\\\", "\\");
            if key.chars().all(|c| c.is_ascii_digit()) && !value.is_empty() {
                let p = PathBuf::from(&value);
                if p.exists() && !seen.contains(&p) {
                    seen.insert(p.clone());
                    paths.push(p);
                }
            }
        }
    }
    paths
}

/// Extract the quoted value after a given key on the same VDF line.
/// For a line like `\t"path"\t\t"D:\\SteamLibrary"` returns `Some("D:\\SteamLibrary")`.
fn extract_vdf_quoted_value<'a>(line: &'a str, _key: &str) -> Option<&'a str> {
    // The value is the second quoted token on the line.
    // Split by `"` — for `"path"   "D:\\SteamLibrary"` we get:
    // ["", "path", "   ", "D:\\SteamLibrary", ""]
    let mut parts = line.split('"');
    parts.next(); // empty before first quote
    parts.next(); // key token
    parts.next(); // whitespace between key and value
    let value = parts.next()?;
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn parse_acf(acf_path: &Path, steamapps_dir: &Path) -> Option<DetectedGame> {
    let content = std::fs::read_to_string(acf_path).ok()?;

    let app_id = extract_acf_value(&content, "appid")?;
    let name = extract_acf_value(&content, "name")?;
    let install_dir = extract_acf_value(&content, "installdir")?;

    let install_path = steamapps_dir.join("common").join(&install_dir);
    let exe_path = utils::find_largest_exe(&install_path, 4);

    let cover_url = format!(
        "https://cdn.akamai.steamstatic.com/steam/apps/{}/library_600x900.jpg",
        app_id
    );

    Some(DetectedGame {
        source: GameSource::Steam,
        source_id: app_id,
        name,
        install_path: Some(install_path.to_string_lossy().into_owned()),
        exe_path,
        cover_url: Some(cover_url),
    })
}

fn extract_acf_value(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with(&format!("\"{}\"", key)) {
            // Line format: "key"  "value"
            // Split by `"` → ["", key, whitespace, value, ""]
            let parts: Vec<&str> = line.split('"').collect();
            if parts.len() >= 4 {
                return Some(parts[3].to_string());
            }
        }
    }
    None
}
