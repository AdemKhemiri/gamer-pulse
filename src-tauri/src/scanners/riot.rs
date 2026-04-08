use std::path::PathBuf;

use crate::models::{DetectedGame, GameSource};

use super::Scanner;

pub struct RiotScanner;

impl Scanner for RiotScanner {
    fn name(&self) -> &'static str {
        "Riot Games"
    }

    fn scan(&self) -> Vec<DetectedGame> {
        match scan_riot() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[Riot] Scan error: {e}");
                vec![]
            }
        }
    }
}

/// Known Riot games: (folder name inside Riot Games dir, display name, source_id, exe relative path)
const RIOT_GAMES: &[(&str, &str, &str, &str)] = &[
    (
        "VALORANT",
        "VALORANT",
        "riot_valorant",
        r"live\ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe",
    ),
    (
        "League of Legends",
        "League of Legends",
        "riot_lol",
        r"Game\League of Legends.exe",
    ),
    (
        "Teamfight Tactics",
        "Teamfight Tactics",
        "riot_tft",
        r"Game\League of Legends.exe",
    ),
];

fn scan_riot() -> anyhow::Result<Vec<DetectedGame>> {
    let mut games = Vec::new();

    // Common Riot install roots
    let candidates: Vec<PathBuf> = vec![
        PathBuf::from(r"C:\Riot Games"),
        PathBuf::from(std::env::var("PROGRAMFILES").unwrap_or_default()).join("Riot Games"),
        PathBuf::from(std::env::var("PROGRAMFILES(X86)").unwrap_or_default()).join("Riot Games"),
    ];

    let riot_root = candidates.into_iter().find(|p| p.exists());
    let Some(riot_root) = riot_root else {
        return Ok(games);
    };

    for (folder, display_name, source_id, exe_rel) in RIOT_GAMES {
        let install_path = riot_root.join(folder);
        if !install_path.exists() {
            continue;
        }

        let exe_path = install_path.join(exe_rel);
        let exe = if exe_path.exists() {
            Some(exe_path.to_string_lossy().into_owned())
        } else {
            // Fallback: largest exe anywhere under install_path
            find_largest_exe(&install_path)
        };

        games.push(DetectedGame {
            source: GameSource::Riot,
            source_id: source_id.to_string(),
            name: display_name.to_string(),
            install_path: Some(install_path.to_string_lossy().into_owned()),
            exe_path: exe,
            cover_url: None,
        });
    }

    Ok(games)
}

fn find_largest_exe(dir: &std::path::Path) -> Option<String> {
    let mut best: Option<(u64, PathBuf)> = None;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) == Some("exe") {
                if let Ok(m) = p.metadata() {
                    let sz = m.len();
                    if best.as_ref().map(|(s, _)| sz > *s).unwrap_or(true) {
                        best = Some((sz, p));
                    }
                }
            }
        }
    }
    best.map(|(_, p)| p.to_string_lossy().into_owned())
}
