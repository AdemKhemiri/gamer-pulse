use std::path::{Path, PathBuf};

/// Patterns in exe names that indicate non-game helper processes.
const HELPER_PATTERNS: &[&str] = &[
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

/// Returns true if the exe name looks like a helper/installer rather than the game.
pub fn is_helper_exe(name: &str) -> bool {
    let lower = name.to_lowercase();
    HELPER_PATTERNS.iter().any(|p| lower.contains(p))
}

/// Recursively collect `(file_size, path)` pairs for non-helper `.exe` files,
/// searching up to `max_depth` directory levels deep.
pub fn collect_exe_candidates(dir: &Path, depth: u8, max_depth: u8) -> Vec<(u64, PathBuf)> {
    if depth > max_depth {
        return vec![];
    }
    let mut candidates = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return candidates;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            candidates.extend(collect_exe_candidates(&path, depth + 1, max_depth));
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

/// Return the path of the largest non-helper `.exe` found up to `max_depth` levels deep.
pub fn find_largest_exe(dir: &Path, max_depth: u8) -> Option<String> {
    collect_exe_candidates(dir, 0, max_depth)
        .into_iter()
        .max_by_key(|(size, _)| *size)
        .map(|(_, p)| p.to_string_lossy().into_owned())
}
