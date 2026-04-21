use tauri::State;

use crate::error::Result;
use crate::models::Session;
use crate::state::AppState;

#[tauri::command]
pub async fn get_sessions(state: State<'_, AppState>, game_id: String) -> Result<Vec<Session>> {
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"SELECT s.id, s.game_id, g.name, s.started_at, s.ended_at, s.duration_secs, s.process_name, s.notes
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
        r#"SELECT s.id, s.game_id, g.name, s.started_at, s.ended_at, s.duration_secs, s.process_name, s.notes
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

/// Update the start/end timestamps of a completed session and recompute its duration.
#[tauri::command]
pub async fn update_session(
    state: State<'_, AppState>,
    session_id: String,
    started_at: String,
    ended_at: String,
) -> Result<Session> {
    use chrono::DateTime;

    let start = DateTime::parse_from_rfc3339(&started_at)
        .map_err(|e| crate::error::AppError::Other(format!("Invalid started_at: {e}")))?;
    let end = DateTime::parse_from_rfc3339(&ended_at)
        .map_err(|e| crate::error::AppError::Other(format!("Invalid ended_at: {e}")))?;

    if end <= start {
        return Err(crate::error::AppError::Other(
            "ended_at must be later than started_at".into(),
        ));
    }

    let duration_secs = (end - start).num_seconds();

    let conn = state.db.conn.lock().unwrap();

    let rows_changed = conn.execute(
        "UPDATE sessions SET started_at = ?1, ended_at = ?2, duration_secs = ?3 WHERE id = ?4",
        rusqlite::params![started_at, ended_at, duration_secs, session_id],
    )?;

    if rows_changed == 0 {
        return Err(crate::error::AppError::NotFound(format!(
            "session {session_id} not found"
        )));
    }

    let session = conn.query_row(
        r#"SELECT s.id, s.game_id, g.name, s.started_at, s.ended_at, s.duration_secs, s.process_name, s.notes
           FROM sessions s
           JOIN games g ON g.id = s.game_id
           WHERE s.id = ?1"#,
        rusqlite::params![session_id],
        row_to_session,
    )?;

    Ok(session)
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
        notes: row.get(7)?,
    })
}

/// Update (or clear) the notes on a session.
#[tauri::command]
pub async fn update_session_notes(
    state: State<'_, AppState>,
    session_id: String,
    notes: String,
) -> Result<Session> {
    let notes_val: Option<String> = if notes.trim().is_empty() { None } else { Some(notes.trim().to_string()) };

    let conn = state.db.conn.lock().unwrap();

    let rows_changed = conn.execute(
        "UPDATE sessions SET notes = ?1 WHERE id = ?2",
        rusqlite::params![notes_val, session_id],
    )?;

    if rows_changed == 0 {
        return Err(crate::error::AppError::NotFound(format!(
            "session {session_id} not found"
        )));
    }

    let session = conn.query_row(
        r#"SELECT s.id, s.game_id, g.name, s.started_at, s.ended_at, s.duration_secs, s.process_name, s.notes
           FROM sessions s
           JOIN games g ON g.id = s.game_id
           WHERE s.id = ?1"#,
        rusqlite::params![session_id],
        row_to_session,
    )?;

    Ok(session)
}
