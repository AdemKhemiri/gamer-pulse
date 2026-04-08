use tauri::State;

use crate::error::Result;
use crate::models::Session;
use crate::state::AppState;

#[tauri::command]
pub async fn get_sessions(state: State<'_, AppState>, game_id: String) -> Result<Vec<Session>> {
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"SELECT s.id, s.game_id, g.name, s.started_at, s.ended_at, s.duration_secs, s.process_name
           FROM sessions s
           JOIN games g ON g.id = s.game_id
           WHERE s.game_id = ?1
           ORDER BY s.started_at DESC"#,
    )?;

    let sessions = stmt
        .query_map(rusqlite::params![game_id], row_to_session)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(sessions)
}

#[tauri::command]
pub async fn get_recent_sessions(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<Session>> {
    let limit = limit.unwrap_or(20);
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"SELECT s.id, s.game_id, g.name, s.started_at, s.ended_at, s.duration_secs, s.process_name
           FROM sessions s
           JOIN games g ON g.id = s.game_id
           WHERE s.ended_at IS NOT NULL
           ORDER BY s.started_at DESC
           LIMIT ?1"#,
    )?;

    let sessions = stmt
        .query_map(rusqlite::params![limit], row_to_session)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(sessions)
}

#[tauri::command]
pub async fn delete_session(state: State<'_, AppState>, session_id: String) -> Result<()> {
    let conn = state.db.conn.lock().unwrap();
    conn.execute(
        "DELETE FROM sessions WHERE id = ?1",
        rusqlite::params![session_id],
    )?;
    Ok(())
}

fn row_to_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get(0)?,
        game_id: row.get(1)?,
        game_name: row.get(2)?,
        started_at: row.get(3)?,
        ended_at: row.get(4)?,
        duration_secs: row.get(5)?,
        process_name: row.get(6)?,
    })
}
