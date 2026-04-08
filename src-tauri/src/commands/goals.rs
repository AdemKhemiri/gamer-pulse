use chrono::{Datelike, Utc};
use tauri::State;
use uuid::Uuid;

use crate::error::Result;
use crate::models::GameGoal;
use crate::state::AppState;

/// Compute current_secs for a given period by querying sessions directly.
fn current_secs_for_period(
    conn: &rusqlite::Connection,
    game_id: &str,
    period: &str,
) -> rusqlite::Result<i64> {
    match period {
        "weekly" => {
            let now = Utc::now();
            let days_from_monday = now.weekday().num_days_from_monday();
            let week_start = (now - chrono::Duration::days(days_from_monday as i64))
                .format("%Y-%m-%d")
                .to_string();
            conn.query_row(
                "SELECT COALESCE(SUM(duration_secs), 0) FROM sessions \
                 WHERE game_id = ?1 AND ended_at IS NOT NULL AND DATE(started_at) >= ?2",
                rusqlite::params![game_id, week_start],
                |r| r.get(0),
            )
        }
        "monthly" => {
            let month_start = Utc::now().format("%Y-%m-01").to_string();
            conn.query_row(
                "SELECT COALESCE(SUM(duration_secs), 0) FROM sessions \
                 WHERE game_id = ?1 AND ended_at IS NOT NULL AND DATE(started_at) >= ?2",
                rusqlite::params![game_id, month_start],
                |r| r.get(0),
            )
        }
        _ => {
            // "total" — all time
            conn.query_row(
                "SELECT COALESCE(SUM(duration_secs), 0) FROM sessions \
                 WHERE game_id = ?1 AND ended_at IS NOT NULL",
                rusqlite::params![game_id],
                |r| r.get(0),
            )
        }
    }
}

#[tauri::command]
pub async fn get_goals(state: State<'_, AppState>, game_id: String) -> Result<Vec<GameGoal>> {
    let conn = state.db.conn.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, game_id, period, target_secs, created_at \
         FROM game_goals WHERE game_id = ?1 ORDER BY created_at",
    )?;

    let rows = stmt
        .query_map(rusqlite::params![game_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut goals = Vec::new();
    for (id, gid, period, target_secs, created_at) in rows {
        let current_secs = current_secs_for_period(&conn, &gid, &period)?;
        goals.push(GameGoal {
            id,
            game_id: gid,
            period,
            target_secs,
            current_secs,
            created_at,
        });
    }

    Ok(goals)
}

#[tauri::command]
pub async fn set_goal(
    state: State<'_, AppState>,
    game_id: String,
    period: String,
    target_secs: i64,
) -> Result<Vec<GameGoal>> {
    {
        let conn = state.db.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO game_goals (id, game_id, period, target_secs, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(game_id, period) DO UPDATE SET target_secs = excluded.target_secs",
            rusqlite::params![id, game_id, period, target_secs, now],
        )?;
    }
    get_goals(state, game_id).await
}

#[tauri::command]
pub async fn delete_goal(
    state: State<'_, AppState>,
    game_id: String,
    period: String,
) -> Result<()> {
    let conn = state.db.conn.lock().unwrap();
    conn.execute(
        "DELETE FROM game_goals WHERE game_id = ?1 AND period = ?2",
        rusqlite::params![game_id, period],
    )?;
    Ok(())
}
