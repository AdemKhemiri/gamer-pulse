use chrono::Utc;
use serde::Serialize;
use tauri::{Emitter, State, Window};
use uuid::Uuid;

use crate::error::Result;
use crate::scanners::run_all_scanners;
use crate::state::AppState;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub added: usize,
    pub updated: usize,
    pub deleted: usize,
    pub total: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    stage: String,
    count: usize,
}

#[tauri::command]
pub async fn trigger_scan(state: State<'_, AppState>, window: Window) -> Result<ScanResult> {
    let _ = window.emit(
        "scan:progress",
        ScanProgress {
            stage: "scanning".to_string(),
            count: 0,
        },
    );

    // Load custom scan paths from settings
    let custom_paths: Vec<String> = {
        let conn = state.db.conn.lock().unwrap();
        let json: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'user_settings'",
                [],
                |r| r.get(0),
            )
            .ok();
        drop(conn);
        if let Some(j) = json {
            let settings: crate::commands::settings::UserSettings =
                serde_json::from_str(&j).unwrap_or_default();
            settings.custom_scan_paths
        } else {
            vec![]
        }
    };

    let mut detected = run_all_scanners();
    if !custom_paths.is_empty() {
        detected.extend(crate::scanners::custom::scan_custom_paths(&custom_paths));
    }
    let total = detected.len();

    let _ = window.emit(
        "scan:progress",
        ScanProgress {
            stage: "syncing".to_string(),
            count: total,
        },
    );

    let conn = state.db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    let mut added = 0usize;
    let mut updated = 0usize;
    let mut seen_source_ids: Vec<(String, String)> = Vec::new(); // (source, source_id)

    for game in &detected {
        seen_source_ids.push((game.source.as_str().to_string(), game.source_id.clone()));

        // Check if exists
        let existing: Option<(String, String)> = conn
            .query_row(
                "SELECT id, status FROM games WHERE source = ?1 AND source_id = ?2",
                rusqlite::params![game.source.as_str(), game.source_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        if let Some((existing_id, status)) = existing {
            // Preserve 'hidden' and user-deleted ('deleted') status across re-scans
            if status == "deleted" {
                // User explicitly removed this game — don't resurrect it
                continue;
            }
            conn.execute(
                "UPDATE games SET name = ?1, install_path = ?2, exe_path = ?3,
                          status = CASE WHEN status = 'hidden' THEN 'hidden' ELSE 'installed' END,
                          deleted_at = NULL, last_scanned_at = ?4
                 WHERE id = ?5",
                rusqlite::params![
                    game.name,
                    game.install_path,
                    game.exe_path,
                    now,
                    existing_id
                ],
            )?;
            updated += 1;
        } else {
            // Insert new game
            let id = Uuid::new_v4().to_string();
            let tags = "[]";
            conn.execute(
                "INSERT INTO games (id, name, source, source_id, install_path, exe_path, cover_url, status, tags, added_at, last_scanned_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'installed', ?8, ?9, ?9)",
                rusqlite::params![
                    id,
                    game.name,
                    game.source.as_str(),
                    game.source_id,
                    game.install_path,
                    game.exe_path,
                    game.cover_url,
                    tags,
                    now
                ],
            )?;
            added += 1;
        }
    }

    // Mark games not seen in this scan as deleted
    let deleted_count: usize = {
        // Get all installed games from scanned sources
        let scanned_sources: Vec<&str> = vec!["steam", "epic", "gog", "xbox", "riot"];
        let mut deleted = 0usize;

        let mut stmt = conn.prepare(
            "SELECT id, source, source_id FROM games WHERE status = 'installed' AND source != 'manual'",
        )?;

        let existing: Vec<(String, String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (id, source, source_id) in existing {
            let still_present = seen_source_ids
                .iter()
                .any(|(s, sid)| s == &source && sid == &source_id);

            if !still_present && scanned_sources.contains(&source.as_str()) {
                conn.execute(
                    "UPDATE games SET status = 'deleted', deleted_at = ?1 WHERE id = ?2",
                    rusqlite::params![now, id],
                )?;
                deleted += 1;
            }
        }
        deleted
    };

    let _ = window.emit(
        "scan:progress",
        ScanProgress {
            stage: "done".to_string(),
            count: total,
        },
    );

    Ok(ScanResult {
        added,
        updated,
        deleted: deleted_count,
        total,
    })
}
