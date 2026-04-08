use crate::models::{DetectedGame, GameSource};

use super::Scanner;

pub struct XboxScanner;

impl Scanner for XboxScanner {
    fn name(&self) -> &'static str {
        "Xbox / Game Pass"
    }

    fn scan(&self) -> Vec<DetectedGame> {
        match scan_xbox() {
            Ok(games) => games,
            Err(e) => {
                eprintln!("[Xbox] Scan error: {e}");
                vec![]
            }
        }
    }
}

// Packages from these publishers are system/framework apps, not games
const SYSTEM_PUBLISHER_PREFIXES: &[&str] = &["CN=Microsoft Corporation", "CN=Microsoft Windows"];

// Package name prefixes that are definitely not games
const SYSTEM_NAME_PREFIXES: &[&str] = &[
    "Microsoft.",
    "Windows.",
    "MicrosoftWindows.",
    "MSTeams",
    "Cortana",
    "DesktopAppInstaller",
    "WindowsTerminal",
    "Xbox.TCUI", // Xbox UI overlay, not a game
    "XboxApp",   // Xbox companion app
    "XboxGameOverlay",
    "XboxGamingOverlay",
    "XboxIdentityProvider",
    "XboxSpeechToTextOverlay",
];

fn scan_xbox() -> anyhow::Result<Vec<DetectedGame>> {
    #[cfg(not(windows))]
    return Ok(vec![]);

    #[cfg(windows)]
    {
        // Query Store packages that are not frameworks and not non-removable system apps
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                r#"Get-AppxPackage | Where-Object {$_.SignatureKind -eq 'Store' -and $_.IsFramework -eq $false -and $_.NonRemovable -eq $false} | Select-Object Name,PackageFamilyName,Publisher,InstallLocation | ConvertTo-Json -Depth 1 -Compress"#,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()?;

        if !output.status.success() {
            return Ok(vec![]);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stdout = stdout.trim();
        if stdout.is_empty() {
            return Ok(vec![]);
        }

        let json: serde_json::Value = match serde_json::from_str(stdout) {
            Ok(v) => v,
            Err(_) => return Ok(vec![]),
        };

        // Could be array or single object
        let packages = match json {
            serde_json::Value::Array(arr) => arr,
            single @ serde_json::Value::Object(_) => vec![single],
            _ => return Ok(vec![]),
        };

        let games: Vec<DetectedGame> = packages
            .iter()
            .filter_map(|pkg| {
                let name = pkg["Name"].as_str()?;
                let family_name = pkg["PackageFamilyName"].as_str()?;
                let publisher = pkg["Publisher"].as_str().unwrap_or("");
                let install_loc = pkg["InstallLocation"].as_str().unwrap_or("");

                // Skip system/Microsoft apps by publisher
                if SYSTEM_PUBLISHER_PREFIXES
                    .iter()
                    .any(|p| publisher.starts_with(p))
                {
                    return None;
                }

                // Skip known non-game package name prefixes
                if SYSTEM_NAME_PREFIXES.iter().any(|p| name.starts_with(p)) {
                    return None;
                }

                // Must have an install location with actual files (avoids placeholder entries)
                if install_loc.is_empty() {
                    return None;
                }

                // Must contain an executable to be a launchable app
                let has_exe = std::fs::read_dir(install_loc)
                    .ok()?
                    .flatten()
                    .any(|e| e.path().extension().and_then(|x| x.to_str()) == Some("exe"));

                if !has_exe {
                    return None;
                }

                // Use the package name as display name, cleaned up
                let display_name = name.split('.').last().unwrap_or(name).replace('_', " ");

                Some(DetectedGame {
                    source: GameSource::Xbox,
                    source_id: family_name.to_string(),
                    name: display_name,
                    install_path: Some(install_loc.to_string()),
                    exe_path: None, // Xbox games use URI launch (xbox-game-pass://...)
                    cover_url: None,
                })
            })
            .collect();

        Ok(games)
    }
}
