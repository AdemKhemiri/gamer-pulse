use std::path::PathBuf;

use crate::models::{DetectedGame, GameSource};

use super::{Scanner, ScanConfig};

pub struct EpicScanner;

impl Scanner for EpicScanner {
    fn name(&self) -> &'static str {
        "Epic Games"
    }

    fn scan(&self, _config: &ScanConfig) -> Vec<DetectedGame> {
        match scan_epic() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[Epic] Scan error: {e}");
                vec![]
            }
        }
    }
}

fn scan_epic() -> anyhow::Result<Vec<DetectedGame>> {
    let manifests_dir = PathBuf::from(
        std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string()),
    )
    .join("Epic\\EpicGamesLauncher\\Data\\Manifests");

    if !manifests_dir.exists() {
        return Ok(vec![]);
    }

    let mut games = Vec::new();
    for entry in std::fs::read_dir(&manifests_dir)?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("item") {
            if let Some(game) = parse_manifest(&path) {
                games.push(game);
            }
        }
    }
    Ok(games)
}

fn parse_manifest(path: &std::path::Path) -> Option<DetectedGame> {
    let content = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;

    // Skip non-game entries
    let is_application = json["bIsApplication"].as_bool().unwrap_or(true);
    if !is_application {
        return None;
    }

    let app_name = json["AppName"].as_str()?.to_string();
    let display_name = json["DisplayName"].as_str()?.to_string();
    let install_location = json["InstallLocation"].as_str()?.to_string();
    let launch_exe = json["LaunchExecutable"].as_str().map(|e| {
        PathBuf::from(&install_location)
            .join(e)
            .to_string_lossy()
            .into_owned()
    });

    Some(DetectedGame {
        source: GameSource::Epic,
        source_id: app_name,
        name: display_name,
        install_path: Some(install_location),
        exe_path: launch_exe,
        cover_url: None,
    })
}
