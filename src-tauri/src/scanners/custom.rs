use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::models::{DetectedGame, GameSource};

use super::utils;

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

/// Publishers that are definitely game studios — used for the "registered app but
/// not blocked" check so we don't accidentally skip games.
const GAME_PUBLISHERS: &[&str] = &[
    "valve",
    "epic games",
    "gog.com",
    "cd projekt",
    "ubisoft",
    "electronic arts",
    " ea ",
    "blizzard",
    "2k games",
    "take-two",
    "bethesda",
    "activision",
    "square enix",
    "bandai namco",
    "sega",
    "capcom",
    "konami",
    "thq",
    "devolver",
    "paradox",
    "505 games",
    "focus entertainment",
    "focus home",
    "deep silver",
    "koch media",
    "team17",
    "coffee stain",
    "raw fury",
    "humble games",
    "annapurna",
    "private division",
    "wired productions",
    "merge games",
    "nacon",
    "kalypso",
    "bigben",
    "microids",
    "maximum games",
    "dreamworks",
    "warner bros",
    "rockstar",
    "insomniac",
    "bungie",
    "obsidian",
    "double fine",
    "codemasters",
    "frontier",
    "rebellion",
    "warhorse",
    "fatshark",
    "tripwire",
    "nightdive",
    "cyan",
    "klei",
    "supergiant",
    "harebrained",
    "owlcat",
    "larian",
    "owlcat",
    "inxile",
    "gunfire",
    "gearbox",
    "high on life",
    "interplay",
    "3d realms",
    "nightdive",
    "new world",
    "taleworlds",
    "wargaming",
    "gaijin",
    "grinding gear",
    "path of exile",
    "riot games",
    "nexon",
    "ncsoft",
    "ncwest",
    "treyarch",
    "infinity ward",
    "sledgehammer",
    "raven software",
    "id software",
    "irrational",
    "crystal dynamics",
    "naughty dog",
    "santa monica",
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
    // Riot — block the root launcher folder and the client subfolder
    "riot games",
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

/// Minimum exe size to qualify on size alone (15 MB).
const MIN_EXE_SIZE_ALONE: u64 = 15 * 1024 * 1024;

/// Minimum exe size when corroborated by game data signals (5 MB).
const MIN_EXE_SIZE_WITH_SIGNALS: u64 = 5 * 1024 * 1024;

// ── Public API ─────────────────────────────────────────────────────────────────

pub fn scan_custom_paths(paths: &[String]) -> Vec<DetectedGame> {
    // Build registry maps once for all paths
    let (registry_blocked, registry_publishers) = build_registry_maps();

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
                    if let Some(game) =
                        detect_game_in_dir(&subdir, &registry_blocked, &registry_publishers)
                    {
                        games.push(game);
                    }
                }
            }
        }
        // Root folder itself may be a single-game folder
        if let Some(game) = detect_game_in_dir(&dir, &registry_blocked, &registry_publishers) {
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

// ── Registry maps ──────────────────────────────────────────────────────────────

/// Returns two maps built from the Windows Uninstall registry:
/// 1. `blocked`: install paths whose publisher is in BLOCKED_PUBLISHERS (lowercase).
/// 2. `publishers`: install path → publisher string (lowercase), for ALL registered apps.
fn build_registry_maps() -> (HashSet<String>, HashMap<String, String>) {
    let mut blocked: HashSet<String> = HashSet::new();
    let mut publishers: HashMap<String, String> = HashMap::new();

    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

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
                let install_loc: String = subkey.get_value("InstallLocation").unwrap_or_default();

                if install_loc.is_empty() {
                    continue;
                }

                let normalized = install_loc
                    .to_lowercase()
                    .trim_end_matches('\\')
                    .to_string();
                let pub_lower = publisher.to_lowercase();

                // Record all publishers for the non-game-app check
                publishers
                    .entry(normalized.clone())
                    .or_insert_with(|| pub_lower.clone());

                // Mark as blocked if publisher is in the block list
                if BLOCKED_PUBLISHERS.iter().any(|b| pub_lower.contains(b)) {
                    blocked.insert(normalized);
                }
            }
        }
    }

    (blocked, publishers)
}

/// Returns true if this directory's path starts with any registry-blocked install location.
fn is_registry_blocked(dir: &Path, blocked: &HashSet<String>) -> bool {
    let dir_lower = dir.to_string_lossy().to_lowercase();
    let dir_lower = dir_lower.trim_end_matches('\\');
    blocked
        .iter()
        .any(|b| dir_lower == b.as_str() || dir_lower.starts_with(&format!("{}\\", b)))
}

/// Returns true if the directory is a registered (non-game) application.
///
/// Logic: if the directory appears in the Uninstall registry AND its publisher
/// is not in GAME_PUBLISHERS, treat it as a known non-game app.
/// If the publisher IS a game publisher or the directory is not registered at all,
/// allow it through for the normal heuristic checks.
fn is_registered_non_game(dir: &Path, publishers: &HashMap<String, String>) -> bool {
    let dir_lower = dir.to_string_lossy().to_lowercase();
    let dir_lower = dir_lower.trim_end_matches('\\');

    let publisher = publishers
        .iter()
        .find(|(path, _)| dir_lower == path.as_str() || dir_lower.starts_with(&format!("{}\\", path)))
        .map(|(_, pub_)| pub_.as_str());

    match publisher {
        None => false, // not in registry at all — allow heuristic check
        Some(pub_) => {
            // Registered: only skip if publisher is NOT a game publisher
            !GAME_PUBLISHERS.iter().any(|g| pub_.contains(g))
        }
    }
}

// ── Detection logic ────────────────────────────────────────────────────────────

fn detect_game_in_dir(
    dir: &Path,
    registry_blocked: &HashSet<String>,
    registry_publishers: &HashMap<String, String>,
) -> Option<DetectedGame> {
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

    // 3. Registered non-game app check — if the folder is in the Windows
    //    Uninstall registry with a non-game publisher, skip it.
    if is_registered_non_game(dir, registry_publishers) {
        return None;
    }

    // 4. Collect exe candidates
    let candidates = utils::collect_exe_candidates(dir, 0, 4);
    if candidates.is_empty() {
        return None;
    }

    let (largest_size, exe_path) = candidates.into_iter().max_by_key(|(size, _)| *size)?;

    // 5. Tightened size/signal heuristic:
    //    - exe >= 15 MB alone qualifies (very likely a game)
    //    - exe >= 5 MB AND game engine/data signals qualifies
    //    - anything smaller is rejected
    let has_game_signals = has_game_data_files(dir) || has_game_engine_dirs(dir);
    let qualifies = largest_size >= MIN_EXE_SIZE_ALONE
        || (largest_size >= MIN_EXE_SIZE_WITH_SIGNALS && has_game_signals);

    if !qualifies {
        return None;
    }

    let source_id = format!("custom:{}", dir.to_string_lossy().to_lowercase());

    Some(DetectedGame {
        source: GameSource::Custom,
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
