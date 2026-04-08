use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::{AppError, Result};
use crate::models::{Game, GameFilter, GamePatch, NewManualGame};
use crate::state::AppState;

#[tauri::command]
pub async fn get_games(
    state: State<'_, AppState>,
    filter: Option<GameFilter>,
) -> Result<Vec<Game>> {
    let filter = filter.unwrap_or_default();
    let conn = state.db.conn.lock().unwrap();

    // Build WHERE clause components
    let mut status_clause = "g.status != 'hidden'".to_string();
    let mut search_val = String::new();
    let mut source_val = String::new();

    if let Some(ref s) = filter.status {
        status_clause = format!("g.status = '{}'", s.replace('\'', "''"));
    }
    if let Some(ref s) = filter.search {
        search_val = format!("%{}%", s.replace('\'', "''"));
    }
    if let Some(ref s) = filter.source {
        source_val = s.replace('\'', "''");
    }

    let favorites_clause = if filter.favorites_only.unwrap_or(false) {
        " AND g.is_favorite = 1"
    } else {
        ""
    };

    let search_clause = if !search_val.is_empty() {
        format!(" AND g.name LIKE '{}'", search_val)
    } else {
        String::new()
    };

    let source_clause = if !source_val.is_empty() {
        format!(" AND g.source = '{}'", source_val)
    } else {
        String::new()
    };

    let sort = match filter.sort_by.as_deref().unwrap_or("name") {
        "playtime" => "total_play_secs DESC",
        "last_played" => "last_played_at DESC",
        "added" => "g.added_at DESC",
        _ => "g.name ASC",
    };

    let sql = format!(
        r#"SELECT g.id, g.name, g.source, g.source_id, g.install_path, g.exe_path,
                  g.cover_url, g.status, g.is_favorite, g.notes, g.tags,
                  g.added_at, g.last_scanned_at, g.deleted_at,
                  COALESCE(SUM(s.duration_secs), 0) AS total_play_secs,
                  MAX(s.started_at) AS last_played_at,
                  COUNT(s.id) AS session_count
           FROM games g
           LEFT JOIN sessions s ON s.game_id = g.id AND s.ended_at IS NOT NULL
           WHERE {status_clause}{search_clause}{source_clause}{favorites_clause}
           GROUP BY g.id
           ORDER BY {sort}"#
    );

    let mut stmt = conn.prepare(&sql)?;
    let games = stmt
        .query_map([], row_to_game)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(games)
}

#[tauri::command]
pub async fn get_game(state: State<'_, AppState>, id: String) -> Result<Game> {
    let conn = state.db.conn.lock().unwrap();
    let game = conn.query_row(
        r#"SELECT g.id, g.name, g.source, g.source_id, g.install_path, g.exe_path,
                  g.cover_url, g.status, g.is_favorite, g.notes, g.tags,
                  g.added_at, g.last_scanned_at, g.deleted_at,
                  COALESCE(SUM(s.duration_secs), 0) AS total_play_secs,
                  MAX(s.started_at) AS last_played_at,
                  COUNT(s.id) AS session_count
           FROM games g
           LEFT JOIN sessions s ON s.game_id = g.id AND s.ended_at IS NOT NULL
           WHERE g.id = ?1
           GROUP BY g.id"#,
        rusqlite::params![id],
        row_to_game,
    )?;
    Ok(game)
}

#[tauri::command]
pub async fn add_manual_game(state: State<'_, AppState>, payload: NewManualGame) -> Result<Game> {
    let id = {
        let conn = state.db.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let tags =
            serde_json::to_string(&payload.tags.unwrap_or_default()).map_err(AppError::Json)?;

        conn.execute(
            "INSERT INTO games (id, name, source, status, exe_path, cover_url, notes, tags, added_at)
             VALUES (?1, ?2, 'manual', 'installed', ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                id,
                payload.name,
                payload.exe_path,
                payload.cover_url,
                payload.notes,
                tags,
                now
            ],
        )?;
        id
    };
    get_game(state, id).await
}

#[tauri::command]
pub async fn update_game(state: State<'_, AppState>, id: String, patch: GamePatch) -> Result<Game> {
    {
        let conn = state.db.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        if let Some(ref name) = patch.name {
            conn.execute(
                "UPDATE games SET name = ?1 WHERE id = ?2",
                rusqlite::params![name, id],
            )?;
        }
        if let Some(ref exe_path) = patch.exe_path {
            conn.execute(
                "UPDATE games SET exe_path = ?1 WHERE id = ?2",
                rusqlite::params![exe_path, id],
            )?;
        }
        if let Some(ref cover_url) = patch.cover_url {
            conn.execute(
                "UPDATE games SET cover_url = ?1 WHERE id = ?2",
                rusqlite::params![cover_url, id],
            )?;
        }
        if let Some(ref notes) = patch.notes {
            conn.execute(
                "UPDATE games SET notes = ?1 WHERE id = ?2",
                rusqlite::params![notes, id],
            )?;
        }
        if let Some(ref tags) = patch.tags {
            let tags_json = serde_json::to_string(tags).map_err(AppError::Json)?;
            conn.execute(
                "UPDATE games SET tags = ?1 WHERE id = ?2",
                rusqlite::params![tags_json, id],
            )?;
        }
        if let Some(fav) = patch.is_favorite {
            conn.execute(
                "UPDATE games SET is_favorite = ?1 WHERE id = ?2",
                rusqlite::params![fav as i32, id],
            )?;
        }
        if let Some(ref status) = patch.status {
            if status == "deleted" {
                conn.execute(
                    "UPDATE games SET status = ?1, deleted_at = ?2 WHERE id = ?3",
                    rusqlite::params![status, now, id],
                )?;
            } else {
                conn.execute(
                    "UPDATE games SET status = ?1 WHERE id = ?2",
                    rusqlite::params![status, id],
                )?;
            }
        }
    }
    get_game(state, id).await
}

#[tauri::command]
pub async fn delete_game(state: State<'_, AppState>, id: String) -> Result<()> {
    // Soft-delete: mark as deleted rather than removing the row so that sessions
    // (and their playtime history) are preserved via the ON DELETE CASCADE schema.
    let conn = state.db.conn.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE games SET status = 'deleted', deleted_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn set_favorite(state: State<'_, AppState>, id: String, favorite: bool) -> Result<()> {
    let conn = state.db.conn.lock().unwrap();
    conn.execute(
        "UPDATE games SET is_favorite = ?1 WHERE id = ?2",
        rusqlite::params![favorite as i32, id],
    )?;
    Ok(())
}

fn row_to_game(row: &rusqlite::Row<'_>) -> rusqlite::Result<Game> {
    let tags_str: String = row
        .get::<_, Option<String>>(10)?
        .unwrap_or_else(|| "[]".to_string());
    let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

    Ok(Game {
        id: row.get(0)?,
        name: row.get(1)?,
        source: row.get(2)?,
        source_id: row.get(3)?,
        install_path: row.get(4)?,
        exe_path: row.get(5)?,
        cover_url: row.get(6)?,
        status: row.get(7)?,
        is_favorite: row.get::<_, i32>(8)? != 0,
        notes: row.get(9)?,
        tags,
        added_at: row.get(11)?,
        last_scanned_at: row.get(12)?,
        deleted_at: row.get(13)?,
        total_play_secs: row.get(14)?,
        last_played_at: row.get(15)?,
        session_count: row.get(16)?,
    })
}
