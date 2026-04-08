use std::path::{Path, PathBuf};

use crate::models::{DetectedGame, GameSource};

use super::Scanner;

pub struct SteamScanner;

impl Scanner for SteamScanner {
    fn name(&self) -> &'static str {
        "Steam"
    }

    fn scan(&self) -> Vec<DetectedGame> {
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

fn parse_library_folders(vdf_path: &Path, steam_root: &Path) -> Vec<PathBuf> {
    let mut paths = vec![steam_root.to_path_buf()];

    let content = match std::fs::read_to_string(vdf_path) {
        Ok(c) => c,
        Err(_) => return paths,
    };

    // Simple line-by-line VDF parser for the "path" key
    for line in content.lines() {
        let line = line.trim();
        if line.contains("\"path\"") {
            // Extract quoted value after "path"
            let parts: Vec<&str> = line.splitn(3, '"').collect();
            if parts.len() >= 4 {
                let val = line.split('"').nth(3).unwrap_or("").replace("\\\\", "\\");
                let p = PathBuf::from(&val);
                if p.exists() && p != steam_root {
                    paths.push(p);
                }
            }
        }
    }
    paths
}

fn parse_acf(acf_path: &Path, steamapps_dir: &Path) -> Option<DetectedGame> {
    let content = std::fs::read_to_string(acf_path).ok()?;

    let app_id = extract_vdf_value(&content, "appid")?;
    let name = extract_vdf_value(&content, "name")?;
    let install_dir = extract_vdf_value(&content, "installdir")?;

    let install_path = steamapps_dir.join("common").join(&install_dir);
    let exe_path = find_primary_exe(&install_path);

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

fn extract_vdf_value(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with(&format!("\"{}\"", key)) {
            // Line format: "key"  "value"
            let parts: Vec<&str> = line.splitn(5, '"').collect();
            // parts[0]="" parts[1]=key parts[2]=whitespace parts[3]=value parts[4]=""
            if parts.len() >= 4 {
                return Some(parts[3].to_string());
            }
        }
    }
    None
}

/// Patterns in exe names that indicate non-game helper processes to skip.
fn is_helper_exe(name: &str) -> bool {
    let lower = name.to_lowercase();
    let skip = [
        "crash",
        "report",
        "helper",
        "launcher_stub",
        "uninstall",
        "setup",
        "install",
        "redist",
        "vcredist",
        "dotnet",
        "directx",
        "dxsetup",
        "vc_redist",
        "oalinst",
    ];
    skip.iter().any(|s| lower.contains(s))
}

fn find_primary_exe(install_dir: &Path) -> Option<String> {
    if !install_dir.exists() {
        return None;
    }
    collect_exe_candidates(install_dir, 0)
        .into_iter()
        .max_by_key(|(size, _)| *size)
        .map(|(_, p)| p.to_string_lossy().into_owned())
}

/// Recursively collect (size, path) for candidate game exes up to depth 4.
fn collect_exe_candidates(dir: &Path, depth: u8) -> Vec<(u64, PathBuf)> {
    if depth > 4 {
        return vec![];
    }
    let mut candidates = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return candidates;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            candidates.extend(collect_exe_candidates(&path, depth + 1));
        } else if path.extension().and_then(|e| e.to_str()) == Some("exe") {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if !is_helper_exe(&name) {
                if let Ok(meta) = std::fs::metadata(&path) {
                    candidates.push((meta.len(), path));
                }
            }
        }
    }
    candidates
}
