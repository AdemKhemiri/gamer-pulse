use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::models::{DetectedGame, GameSource};

// ── Publisher blocklist (matched against Windows Uninstall registry) ───────────
const BLOCKED_PUBLISHERS: &[&str] = &[
    // GPU / hardware drivers
    "nvidia",
    "advanced micro devices",
    "amd",
    "intel corporation",
    // Peripheral / RGB software
    "logitech",
    "corsair",
    "razer",
    "steelseries",
    "roccat",
    "asus",
    "msi",
    "gigabyte",
    "nzxt",
    "thermaltake",
    "cooler master",
    "hyperx",
    "kingston",
    "elgato",
    // System / Microsoft
    "microsoft",
    "microsoft corporation",
    // Browsers
    "google",
    "mozilla foundation",
    "opera",
    "brave software",
    // Communication
    "discord",
    "slack",
    "zoom",
    "teamspeak",
    // Creative / productivity
    "adobe",
    "autodesk",
    "affinity",
    // Dev tools
    "jetbrains",
    "github",
    // Antivirus / security
    "malwarebytes",
    "avast",
    "avg",
    "bitdefender",
    "kaspersky",
    "norton",
    "mcafee",
    "eset",
    // Launchers (shouldn't be in custom paths, but just in case)
    "valve",
    "epic games",
    "gog.com",
    "ubisoft",
    "ea",
    "blizzard",
    // Utilities
    "rarlab",
    "piriform",
    "crystalmark",
    "cpuid",
    "techpowerup",
    "realtek",
    "creative technology",
];

// ── Folder-name blocklist (fast pre-check before registry lookup) ──────────────
const BLOCKED_FOLDERS: &[&str] = &[
    "microsoft",
    "windows",
    "windowsapps",
    "windowspowershell",
    "common files",
    "internet explorer",
    "windows defender",
    "windowsnt",
    "reference assemblies",
    "dotnet",
    "google",
    "chrome",
    "firefox",
    "mozilla",
    "brave",
    "edge",
    "opera",
    "vivaldi",
    "visual studio",
    "vscode",
    "jetbrains",
    "nodejs",
    "node.js",
    "python",
    "java",
    "git",
    "github",
    "gitlab",
    "tortoisegit",
    "docker",
    "vmware",
    "virtualbox",
    "7-zip",
    "winrar",
    "vlc",
    "obs",
    "obs-studio",
    "discord",
    "slack",
    "zoom",
    "webex",
    "malwarebytes",
    "avast",
    "bitdefender",
    "kaspersky",
    "norton",
    "adobe",
    "acrobat",
    "photoshop",
    "nvidia",
    "amd",
    "intel",
    "realtek",
    "steam",
    "epicgames",
    "epicgameslauncher",
    "gog galaxy",
    "gogalaxy",
    "ea desktop",
    "origin",
    "ubisoft",
    "battle.net",
    "battlenet",
    "rockstar games launcher",
    "riot client",
    "riotclientservices",
    "logitech",
    "corsair",
    "razer",
    "steelseries",
    "elgato",
    "msi afterburner",
    "afterburner",
    "hwinfo",
    "cpu-z",
    "gpu-z",
    "speccy",
];

// ── Game-engine / data-file signatures ────────────────────────────────────────
const GAME_DATA_EXTENSIONS: &[&str] = &[
    "pak", "uasset", "umap", "assets", "resource", "unity3d", "big", "mix", "mpq", "bsa", "ba2",
    "arc", "pck", "rpgmvp", "gcf", "ncf", "vpk", "xnb",
];

const GAME_ENGINE_DIRS: &[&str] = &[
    "engine",
    "binaries",
    "shaders",
    "shadercache",
    "_data",
    "managed",
    "streamingassets",
    "gamedata",
];

// Minimum size for the primary exe (5 MB)
const MIN_EXE_SIZE: u64 = 5 * 1024 * 1024;

// ── Public API ─────────────────────────────────────────────────────────────────

pub fn scan_custom_paths(paths: &[String]) -> Vec<DetectedGame> {
    // Build the registry blocklist once for all paths
    let registry_blocked = build_registry_blocklist();

    let mut games = Vec::new();
    for path in paths {
        let dir = PathBuf::from(path);
        if !dir.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let subdir = entry.path();
                if subdir.is_dir() {
                    if let Some(game) = detect_game_in_dir(&subdir, &registry_blocked) {
                        games.push(game);
                    }
                }
            }
        }
        // Root folder itself may be a single-game folder
        if let Some(game) = detect_game_in_dir(&dir, &registry_blocked) {
            let already = games
                .iter()
                .any(|g| g.install_path.as_deref() == Some(dir.to_string_lossy().as_ref()));
            if !already {
                games.push(game);
            }
        }
    }
    games
}

// ── Registry blocklist ─────────────────────────────────────────────────────────

/// Read Windows Uninstall registry and collect install paths whose publisher
/// is in BLOCKED_PUBLISHERS. Normalized to lowercase for easy comparison.
fn build_registry_blocklist() -> HashSet<String> {
    let mut blocked: HashSet<String> = HashSet::new();

    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hives: [(winreg::HKEY, &str); 2] = [
            (
                HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            ),
            (
                HKEY_CURRENT_USER,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            ),
        ];

        for (hive, path) in &hives {
            let Ok(key) = RegKey::predef(*hive).open_subkey(path) else {
                continue;
            };
            for subkey_name in key.enum_keys().flatten() {
                let Ok(subkey) = key.open_subkey(&subkey_name) else {
                    continue;
                };
                let publisher: String = subkey.get_value("Publisher").unwrap_or_default();
                let install_loc: String = subkey.get_value("InstallLocation").unwrap_or_default();

                if install_loc.is_empty() {
                    continue;
                }
                let pub_lower = publisher.to_lowercase();
                let is_blocked = BLOCKED_PUBLISHERS.iter().any(|b| pub_lower.contains(b));

                if is_blocked {
                    blocked.insert(
                        install_loc
                            .to_lowercase()
                            .trim_end_matches('\\')
                            .to_string(),
                    );
                }
            }
        }

        // Also block the 64-bit registry view
        let hives64: [(winreg::HKEY, &str); 1] = [(
            HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        )];
        for (hive, path) in &hives64 {
            let Ok(key) = RegKey::predef(*hive).open_subkey(path) else {
                continue;
            };
            for subkey_name in key.enum_keys().flatten() {
                let Ok(subkey) = key.open_subkey(&subkey_name) else {
                    continue;
                };
                let publisher: String = subkey.get_value("Publisher").unwrap_or_default();
                let install_loc: String = subkey.get_value("InstallLocation").unwrap_or_default();

                if install_loc.is_empty() {
                    continue;
                }
                let pub_lower = publisher.to_lowercase();
                if BLOCKED_PUBLISHERS.iter().any(|b| pub_lower.contains(b)) {
                    blocked.insert(
                        install_loc
                            .to_lowercase()
                            .trim_end_matches('\\')
                            .to_string(),
                    );
                }
            }
        }
    }

    blocked
}

/// Returns true if this directory's path starts with any registry-blocked install location.
fn is_registry_blocked(dir: &Path, blocked: &HashSet<String>) -> bool {
    let dir_lower = dir.to_string_lossy().to_lowercase();
    let dir_lower = dir_lower.trim_end_matches('\\');
    blocked
        .iter()
        .any(|b| dir_lower == b.as_str() || dir_lower.starts_with(&format!("{}\\", b)))
}

// ── Detection logic ────────────────────────────────────────────────────────────

fn detect_game_in_dir(dir: &Path, registry_blocked: &HashSet<String>) -> Option<DetectedGame> {
    let folder_name = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    // 1. Fast folder-name blocklist
    if is_blocked_folder(&folder_name) {
        return None;
    }

    // 2. Registry publisher blocklist (catches apps not obvious from folder name)
    if is_registry_blocked(dir, registry_blocked) {
        return None;
    }

    // 3. Collect exe candidates
    let candidates = collect_exe_candidates(dir, 0);
    if candidates.is_empty() {
        return None;
    }

    let (largest_size, exe_path) = candidates.into_iter().max_by_key(|(size, _)| *size)?;

    // 4. Size or game-data signal required
    let has_game_signals = has_game_data_files(dir) || has_game_engine_dirs(dir);
    if largest_size < MIN_EXE_SIZE && !has_game_signals {
        return None;
    }

    let source_id = format!("custom:{}", dir.to_string_lossy().to_lowercase());

    Some(DetectedGame {
        source: GameSource::Manual,
        source_id,
        name: folder_name,
        install_path: Some(dir.to_string_lossy().into_owned()),
        exe_path: Some(exe_path.to_string_lossy().into_owned()),
        cover_url: None,
    })
}

fn is_blocked_folder(name: &str) -> bool {
    let lower = name.to_lowercase();
    BLOCKED_FOLDERS.iter().any(|b| lower.contains(b))
}

fn has_game_data_files(dir: &Path) -> bool {
    check_game_files_recursive(dir, 0)
}

fn check_game_files_recursive(dir: &Path, depth: u8) -> bool {
    if depth > 3 {
        return false;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if check_game_files_recursive(&path, depth + 1) {
                return true;
            }
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if GAME_DATA_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                return true;
            }
        }
    }
    false
}

fn has_game_engine_dirs(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if GAME_ENGINE_DIRS.iter().any(|d| name.contains(d)) {
                return true;
            }
        }
    }
    false
}

fn is_helper_exe(name: &str) -> bool {
    let lower = name.to_lowercase();
    [
        "crash",
        "report",
        "helper",
        "uninstall",
        "setup",
        "install",
        "redist",
        "vcredist",
        "dotnet",
        "directx",
        "dxsetup",
        "oalinst",
        "vc_redist",
        "launcher_stub",
    ]
    .iter()
    .any(|s| lower.contains(s))
}

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
                if let Ok(meta) = path.metadata() {
                    candidates.push((meta.len(), path));
                }
            }
        }
    }
    candidates
}
