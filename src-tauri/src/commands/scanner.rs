use chrono::Utc;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use crate::commands::settings::UserSettings;
use crate::error::{AppError, Result};
use crate::scanners::{run_all_scanners, ScanConfig};
use crate::state::AppState;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub added: usize,
    pub updated: usize,
    pub deleted: usize,
    pub total: usize,
}

#[tauri::command]
pub async fn trigger_scan(state: State<'_, AppState>) -> Result<ScanResult> {
    // Load settings
    let settings: UserSettings = {
        let conn = state.db.conn.lock().unwrap();
        let json: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'user_settings'",
                [],
                |r| r.get(0),
            )
            .ok();
        drop(conn);
        json.and_then(|j| serde_json::from_str(&j).ok())
            .unwrap_or_default()
    };

    let config = ScanConfig::from_settings(&settings);

    // Run all enabled scanners (blocking I/O) on a dedicated thread pool so we
    // don't stall the async Tauri executor.
    let detected = tokio::task::spawn_blocking(move || run_all_scanners(&config))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    let total = detected.len();

    let conn = state.db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    let mut added = 0usize;
    let mut updated = 0usize;
    let mut seen_source_ids: Vec<(String, String)> = Vec::new(); // (source, source_id)

    // Track which sources actually returned results — a source that returns zero
    // games is treated as a scanner failure, not "all games uninstalled".
    let mut sources_with_results: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    for game in &detected {
        seen_source_ids.push((game.source.as_str().to_string(), game.source_id.clone()));
        sources_with_results.insert(game.source.as_str().to_string());

        // Look up by (source, source_id) first — exact match.
        let existing: Option<(String, String)> = conn
            .query_row(
                "SELECT id, status FROM games WHERE source = ?1 AND source_id = ?2",
                rusqlite::params![game.source.as_str(), game.source_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        // If no exact match, check whether a 'custom' entry exists for the same
        // install_path. This migrates games that were previously discovered by
        // the custom path scanner to their correct platform source (e.g. "riot").
        let existing = if existing.is_none() {
            if let Some(install_path) = &game.install_path {
                conn.query_row(
                    "SELECT id, status FROM games WHERE source = 'custom' AND install_path = ?1",
                    rusqlite::params![install_path],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .ok()
                .map(|(id, status): (String, String)| {
                    // Migrate: update source and source_id to match the platform scanner
                    let _ = conn.execute(
                        "UPDATE games SET source = ?1, source_id = ?2 WHERE id = ?3",
                        rusqlite::params![game.source.as_str(), game.source_id, id],
                    );
                    (id, status)
                })
            } else {
                None
            }
        } else {
            existing
        };

        if let Some((existing_id, status)) = existing {
            // Preserve user-deleted and permanently-blocked games — don't resurrect them
            if status == "deleted" || status == "blocked" {
                continue;
            }
            conn.execute(
                "UPDATE games SET name = ?1, install_path = ?2, exe_path = ?3,
                          cover_url = COALESCE(?4, cover_url),
                          status = CASE WHEN status = 'hidden' THEN 'hidden' ELSE 'installed' END,
                          deleted_at = NULL, last_scanned_at = ?5
                 WHERE id = ?6",
                rusqlite::params![
                    game.name,
                    game.install_path,
                    game.exe_path,
                    game.cover_url,
                    now,
                    existing_id
                ],
            )?;
            updated += 1;
        } else {
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

    // All platform sources are always scanned. Auto-deletion only applies to
    // sources that actually returned results (sources_with_results guard).
    let scanned_sources: &[&str] = &[
        "steam", "epic", "gog", "xbox", "riot", "ubisoft", "ea", "battlenet", "custom",
    ];

    // Mark games not seen in this scan as deleted.
    // Exclusions:
    //   - 'manual' source: user-added games, never auto-deleted
    //   - sources not in scanned_sources: scanner was disabled, don't touch those games
    //   - sources that returned zero results: scanner likely failed, don't wipe the library
    let deleted_count: usize = {
        let mut deleted = 0usize;

        let mut stmt = conn.prepare(
            "SELECT id, source, source_id FROM games
             WHERE status = 'installed' AND source != 'manual'",
        )?;

        let existing: Vec<(String, String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (id, source, source_id) in existing {
            // Skip sources that weren't scanned this run (disabled in settings)
            if !scanned_sources.contains(&source.as_str()) {
                continue;
            }

            let still_present = seen_source_ids
                .iter()
                .any(|(s, sid)| s == &source && sid == &source_id);

            // Only mark as deleted if the scanner returned at least one result
            // (protects against false-deletes on scanner failure / registry error)
            if !still_present && sources_with_results.contains(&source) {
                conn.execute(
                    "UPDATE games SET status = 'deleted', deleted_at = ?1 WHERE id = ?2",
                    rusqlite::params![now, id],
                )?;
                deleted += 1;
            }
        }
        deleted
    };

    Ok(ScanResult {
        added,
        updated,
        deleted: deleted_count,
        total,
    })
}
