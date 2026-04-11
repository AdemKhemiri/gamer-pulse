pub mod battlenet;
pub mod custom;
pub mod ea;
pub mod epic;
pub mod gog;
pub mod riot;
pub mod steam;
pub mod ubisoft;
pub mod utils;
pub mod xbox;

use std::collections::HashSet;

use crate::commands::settings::UserSettings;
use crate::models::{DetectedGame, GameSource};

/// Configuration passed to every scanner, derived from `UserSettings`.
#[derive(Debug, Clone)]
pub struct ScanConfig {
    pub custom_scan_paths: Vec<String>,
}

impl ScanConfig {
    pub fn from_settings(s: &UserSettings) -> Self {
        ScanConfig {
            custom_scan_paths: s.custom_scan_paths.clone(),
        }
    }
}

pub trait Scanner: Send {
    fn scan(&self, config: &ScanConfig) -> Vec<DetectedGame>;
    fn name(&self) -> &'static str;
}

/// Run all scanners in parallel using OS threads, then run the custom
/// path scanner sequentially afterwards. Returns all detected games combined.
pub fn run_all_scanners(config: &ScanConfig) -> Vec<DetectedGame> {
    let scanners: Vec<Box<dyn Scanner + Send>> = vec![
        Box::new(steam::SteamScanner),
        Box::new(epic::EpicScanner),
        Box::new(gog::GogScanner),
        Box::new(xbox::XboxScanner),
        Box::new(riot::RiotScanner),
        Box::new(ubisoft::UbisoftScanner),
        Box::new(ea::EaScanner),
        Box::new(battlenet::BattlenetScanner),
    ];

    let (tx, rx) = std::sync::mpsc::channel::<Vec<DetectedGame>>();

    std::thread::scope(|s| {
        // Consume the vec — each scanner is moved into exactly one thread.
        // Box<dyn Scanner + Send> is Send, so the closure is Send.
        for scanner in scanners {
            let tx = tx.clone();
            let cfg = config.clone();
            s.spawn(move || {
                let found = scanner.scan(&cfg);
                let _ = tx.send(found);
            });
        }
    });
    drop(tx);

    let platform_results: Vec<DetectedGame> = rx.into_iter().flatten().collect();

    // Custom path scanning is sequential — it's I/O-heavy directory walking
    // driven by user-specified paths, separate from the platform scanners.
    let mut results = platform_results;
    if !config.custom_scan_paths.is_empty() {
        let custom_results = custom::scan_custom_paths(&config.custom_scan_paths);

        // Build a set of install paths already claimed by platform scanners.
        // If the custom scanner found the same directory (e.g. a Riot or Steam
        // game inside a custom path), drop the custom entry — the platform
        // scanner's source tag (riot, steam, etc.) is more accurate.
        let platform_paths: HashSet<String> = results
            .iter()
            .filter_map(|g| g.install_path.as_deref())
            .map(|p| p.to_lowercase().trim_end_matches('\\').to_string())
            .collect();

        for game in custom_results {
            if game.source == GameSource::Custom {
                let path_lower = game
                    .install_path
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase();
                let path_lower = path_lower.trim_end_matches('\\');
                if platform_paths.contains(path_lower) {
                    continue; // skip — already found by a platform scanner
                }
            }
            results.push(game);
        }
    }

    results
}
