pub mod custom;
pub mod epic;
pub mod gog;
pub mod riot;
pub mod steam;
pub mod xbox;

use crate::models::DetectedGame;

pub trait Scanner {
    fn scan(&self) -> Vec<DetectedGame>;
    fn name(&self) -> &'static str;
}

pub fn run_all_scanners() -> Vec<DetectedGame> {
    let scanners: Vec<Box<dyn Scanner>> = vec![
        Box::new(steam::SteamScanner),
        Box::new(epic::EpicScanner),
        Box::new(gog::GogScanner),
        Box::new(xbox::XboxScanner),
        Box::new(riot::RiotScanner),
    ];

    let mut results = Vec::new();
    for scanner in &scanners {
        let found = scanner.scan();
        results.extend(found);
    }
    results
}
