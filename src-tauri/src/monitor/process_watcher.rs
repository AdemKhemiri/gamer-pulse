use std::collections::HashMap;
use std::path::PathBuf;

use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, Duration};

use super::session_recorder;
use crate::state::AppState;

/// Polls running processes every 5 seconds and fires session events.
pub async fn start_monitor(app: AppHandle, state: AppState) {
    let mut active: HashMap<String, u32> = HashMap::new();
    let mut sys = System::new();

    loop {
        let (full_map, name_map, install_map) = build_exe_maps(&state);

        sys.refresh_processes(ProcessesToUpdate::All, true);

        let running = get_game_pids(&full_map, &name_map, &install_map, &sys);

        // Detect newly started games
        for (pid, game_id) in &running {
            if !active.contains_key(game_id) {
                let process_name = full_map
                    .iter()
                    .find(|(_, gid)| *gid == game_id)
                    .and_then(|(path, _)| path.file_name())
                    .map(|n| n.to_string_lossy().into_owned());

                session_recorder::start_session(&state, game_id, *pid, process_name.as_deref());
                let _ = app.emit("game:started", serde_json::json!({ "gameId": game_id }));
                active.insert(game_id.clone(), *pid);
            }
        }

        // Detect stopped games:
        // - the original tracked PID is no longer alive, OR
        // - the game was hidden/deleted and is no longer in the tracked exe map
        let running_pids: std::collections::HashSet<u32> =
            sys.processes().keys().map(|p| p.as_u32()).collect();
        // A game is "still tracked" if it appears in any of the three maps
        let mut tracked_game_ids: std::collections::HashSet<String> =
            full_map.values().cloned().collect();
        tracked_game_ids.extend(name_map.values().cloned());
        tracked_game_ids.extend(install_map.iter().map(|(_, id)| id.clone()));
        let stopped: Vec<String> = active
            .iter()
            .filter(|(game_id, orig_pid)| {
                !running_pids.contains(*orig_pid) || !tracked_game_ids.contains(*game_id)
            })
            .map(|(gid, _)| gid.clone())
            .collect();

        for game_id in stopped {
            let duration = session_recorder::end_session(&state, &game_id);
            let _ = app.emit(
                "game:stopped",
                serde_json::json!({ "gameId": game_id, "durationSecs": duration }),
            );
            active.remove(&game_id);

            let new_badges = session_recorder::check_achievements(&state, &game_id);
            if !new_badges.is_empty() {
                // Resolve the game name once for all badge notifications.
                let game_name = {
                    let conn = state.db.conn.lock().unwrap();
                    conn.query_row(
                        "SELECT name FROM games WHERE id = ?1",
                        rusqlite::params![game_id],
                        |r| r.get::<_, String>(0),
                    )
                    .unwrap_or_else(|_| game_id.clone())
                };
                for badge in new_badges {
                    let _ = app.emit(
                        "achievement:unlocked",
                        serde_json::json!({
                            "gameId":           game_id,
                            "gameName":         game_name,
                            "badgeKey":         badge.badge_key,
                            "badgeLabel":       badge.badge_label,
                            "badgeDescription": badge.badge_description,
                        }),
                    );
                }
            }
        }

        sleep(Duration::from_secs(5)).await;
    }
}

/// Returns normalized (lowercased, stripped of \\?\ prefix) path string.
fn normalize_path(path: &str) -> String {
    let p = path.strip_prefix(r"\\?\").unwrap_or(path);
    p.to_lowercase()
}

/// Build three lookup maps from the DB:
///   full_map:    normalized-full-path  → game_id
///   name_map:    exe-filename          → game_id (only unambiguous filenames)
///   install_map: normalized-install-dir → game_id (prefix fallback for Steam/etc.)
fn build_exe_maps(
    state: &AppState,
) -> (
    HashMap<PathBuf, String>,
    HashMap<String, String>,
    Vec<(PathBuf, String)>,
) {
    let mut full_map: HashMap<PathBuf, String> = HashMap::new();
    let mut name_candidates: HashMap<String, Vec<String>> = HashMap::new();
    let mut install_map: Vec<(PathBuf, String)> = Vec::new();

    let conn = state.db.conn.lock().unwrap();
    let mut stmt = match conn
        .prepare("SELECT id, exe_path, install_path FROM games WHERE status = 'installed'")
    {
        Ok(s) => s,
        Err(_) => return (full_map, HashMap::new(), install_map),
    };

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    });

    if let Ok(rows) = rows {
        for (game_id, exe_path, install_path) in rows.flatten() {
            // Full-path + filename maps (requires exe_path)
            if let Some(ref exe) = exe_path {
                let normalized = normalize_path(exe);
                let path = PathBuf::from(&normalized);
                full_map.insert(path.clone(), game_id.clone());
                if let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) {
                    name_candidates
                        .entry(name)
                        .or_default()
                        .push(game_id.clone());
                }
            }

            // Install-path prefix map (works even when exe_path is wrong/missing)
            if let Some(ref ipath) = install_path {
                let normalized = normalize_path(ipath);
                install_map.push((PathBuf::from(normalized), game_id));
            }
        }
    }

    // Sort by path length descending so more-specific paths match first
    install_map.sort_by(|a, b| b.0.as_os_str().len().cmp(&a.0.as_os_str().len()));

    let name_map: HashMap<String, String> = name_candidates
        .into_iter()
        .filter_map(|(name, ids)| {
            if ids.len() == 1 {
                Some((name, ids.into_iter().next().unwrap()))
            } else {
                None
            }
        })
        .collect();

    (full_map, name_map, install_map)
}

/// Returns HashMap<pid, game_id> for processes matching tracked game exes.
/// Match priority: 1) full normalized path, 2) unique filename, 3) install-dir prefix.
fn get_game_pids(
    full_map: &HashMap<PathBuf, String>,
    name_map: &HashMap<String, String>,
    install_map: &[(PathBuf, String)],
    sys: &System,
) -> HashMap<u32, String> {
    let mut result = HashMap::new();

    for (pid, process) in sys.processes() {
        if let Some(exe) = process.exe() {
            let normalized = normalize_path(&exe.to_string_lossy());
            let path = PathBuf::from(&normalized);

            // 1. Full path match
            if let Some(game_id) = full_map.get(&path) {
                result.insert(pid.as_u32(), game_id.clone());
                continue;
            }

            // 2. Unique filename match
            if let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) {
                if let Some(game_id) = name_map.get(&name) {
                    result.insert(pid.as_u32(), game_id.clone());
                    continue;
                }
            }

            // 3. Install-dir prefix match (catches games with wrong/missing exe_path)
            let path_str = normalized.as_str();
            for (install_dir, game_id) in install_map {
                let dir_str = install_dir.to_string_lossy();
                if path_str.starts_with(dir_str.as_ref()) {
                    result.insert(pid.as_u32(), game_id.clone());
                    break;
                }
            }
        }
    }

    result
}
