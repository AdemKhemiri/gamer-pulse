use chrono::{NaiveDate, Utc};
use uuid::Uuid;

use crate::state::AppState;

pub fn start_session(state: &AppState, game_id: &str, pid: u32, process_name: Option<&str>) {
    let conn = state.db.conn.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let _ = conn.execute(
        "INSERT INTO sessions (id, game_id, started_at, process_name, pid)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, game_id, now, process_name, pid as i64],
    );
}

/// Closes the most recent open session for this game. Returns duration in seconds.
pub fn end_session(state: &AppState, game_id: &str) -> Option<i64> {
    let conn = state.db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    // Find open session
    let session_id: Option<(String, String)> = conn
        .query_row(
            "SELECT id, started_at FROM sessions WHERE game_id = ?1 AND ended_at IS NULL
             ORDER BY started_at DESC LIMIT 1",
            rusqlite::params![game_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let (session_id, started_at) = session_id?;

    // Calculate duration
    let started = chrono::DateTime::parse_from_rfc3339(&started_at).ok()?;
    let ended = chrono::DateTime::parse_from_rfc3339(&now).ok()?;
    let duration = (ended - started).num_seconds().max(0);

    // Discard sessions shorter than 1 minute (accidental launches, crashes, etc.)
    if duration < 60 {
        let _ = conn.execute(
            "DELETE FROM sessions WHERE id = ?1",
            rusqlite::params![session_id],
        );
        return None;
    }

    let _ = conn.execute(
        "UPDATE sessions SET ended_at = ?1, duration_secs = ?2 WHERE id = ?3",
        rusqlite::params![now, duration, session_id],
    );

    Some(duration)
}

fn longest_streak_for_game(conn: &rusqlite::Connection, game_id: &str) -> i64 {
    let mut stmt = match conn.prepare(
        "SELECT DISTINCT DATE(started_at, 'localtime') AS day
         FROM sessions WHERE game_id = ?1 AND ended_at IS NOT NULL
         ORDER BY day DESC",
    ) {
        Ok(s) => s,
        Err(_) => return 0,
    };
    let days: Vec<String> = stmt
        .query_map(rusqlite::params![game_id], |r| r.get(0))
        .unwrap()
        .flatten()
        .collect();

    if days.len() < 7 {
        return days.len() as i64;
    }

    let mut longest = 0i64;
    let mut run = 1i64;
    for i in 0..days.len().saturating_sub(1) {
        let a = NaiveDate::parse_from_str(&days[i], "%Y-%m-%d");
        let b = NaiveDate::parse_from_str(&days[i + 1], "%Y-%m-%d");
        if let (Ok(a), Ok(b)) = (a, b) {
            if (a - b).num_days() == 1 {
                run += 1;
            } else {
                longest = longest.max(run);
                run = 1;
            }
        }
    }
    longest.max(run)
}

/// Award achievements based on cumulative playtime and session history.
pub fn check_achievements(state: &AppState, game_id: &str) {
    let conn = state.db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    // Get total playtime for this game
    let total_secs: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(duration_secs), 0) FROM sessions
             WHERE game_id = ?1 AND ended_at IS NOT NULL",
            rusqlite::params![game_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let _session_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sessions WHERE game_id = ?1 AND ended_at IS NOT NULL",
            rusqlite::params![game_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let badges: &[(&str, i64, &str)] = &[
        ("first_hour", 3600, "first_hour"),
        ("ten_hours", 36000, "ten_hours"),
        ("fifty_hours", 180000, "fifty_hours"),
        ("hundred_hours", 360000, "hundred_hours"),
    ];

    for (badge_key, threshold_secs, _) in badges {
        if total_secs >= *threshold_secs {
            // Check if already awarded
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) FROM achievements WHERE game_id = ?1 AND badge_key = ?2",
                    rusqlite::params![game_id, badge_key],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap_or(0)
                > 0;

            if !exists {
                let id = Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO achievements (id, game_id, badge_key, earned_at)
                     VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![id, game_id, badge_key, now],
                );
            }
        }
    }

    // Night Owl: session that ended after midnight (00:00-06:00)
    let night_owl_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM achievements WHERE game_id = ?1 AND badge_key = 'night_owl'",
            rusqlite::params![game_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !night_owl_exists {
        let late_session: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE game_id = ?1
                 AND ended_at IS NOT NULL
                 AND CAST(strftime('%H', ended_at, 'localtime') AS INTEGER) < 6",
                rusqlite::params![game_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if late_session {
            let id = Uuid::new_v4().to_string();
            let _ = conn.execute(
                "INSERT INTO achievements (id, game_id, badge_key, earned_at)
                 VALUES (?1, ?2, 'night_owl', ?3)",
                rusqlite::params![id, game_id, now],
            );
        }
    }

    // Marathon: single session >= 3 hours
    let marathon_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM achievements WHERE game_id = ?1 AND badge_key = 'marathon'",
            rusqlite::params![game_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !marathon_exists {
        let has_marathon: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE game_id = ?1
                 AND ended_at IS NOT NULL AND duration_secs >= 10800",
                rusqlite::params![game_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if has_marathon {
            let id = Uuid::new_v4().to_string();
            let _ = conn.execute(
                "INSERT INTO achievements (id, game_id, badge_key, earned_at)
                 VALUES (?1, ?2, 'marathon', ?3)",
                rusqlite::params![id, game_id, now],
            );
        }
    }

    // Dedicated: 7-day play streak on this game
    let dedicated_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM achievements WHERE game_id = ?1 AND badge_key = 'dedicated_streak'",
            rusqlite::params![game_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !dedicated_exists && longest_streak_for_game(&conn, game_id) >= 7 {
        let id = Uuid::new_v4().to_string();
        let _ = conn.execute(
            "INSERT INTO achievements (id, game_id, badge_key, earned_at)
             VALUES (?1, ?2, 'dedicated_streak', ?3)",
            rusqlite::params![id, game_id, now],
        );
    }

    // Speed Runner: completed a session between 5 and 30 minutes
    let speed_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM achievements WHERE game_id = ?1 AND badge_key = 'speed_runner'",
            rusqlite::params![game_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !speed_exists {
        let has_speed: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE game_id = ?1
                 AND ended_at IS NOT NULL AND duration_secs >= 300 AND duration_secs < 1800",
                rusqlite::params![game_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if has_speed {
            let id = Uuid::new_v4().to_string();
            let _ = conn.execute(
                "INSERT INTO achievements (id, game_id, badge_key, earned_at)
                 VALUES (?1, ?2, 'speed_runner', ?3)",
                rusqlite::params![id, game_id, now],
            );
        }
    }

    // Early Bird: session started before 7am local time
    let early_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM achievements WHERE game_id = ?1 AND badge_key = 'early_bird'",
            rusqlite::params![game_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if !early_exists {
        let has_early: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE game_id = ?1
                 AND ended_at IS NOT NULL
                 AND CAST(strftime('%H', started_at, 'localtime') AS INTEGER) BETWEEN 4 AND 6",
                rusqlite::params![game_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if has_early {
            let id = Uuid::new_v4().to_string();
            let _ = conn.execute(
                "INSERT INTO achievements (id, game_id, badge_key, earned_at)
                 VALUES (?1, ?2, 'early_bird', ?3)",
                rusqlite::params![id, game_id, now],
            );
        }
    }

    drop(conn);
    check_global_achievements(state, &now);
}

fn check_global_achievements(state: &AppState, now: &str) {
    let conn = state.db.conn.lock().unwrap();

    // Ensure the __global__ placeholder game exists once
    let _ = conn.execute(
        "INSERT OR IGNORE INTO games (id, name, source, status, added_at)
         VALUES ('__global__', 'Global', 'manual', 'hidden', ?1)",
        rusqlite::params![now],
    );

    let unique_games: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT game_id) FROM sessions WHERE ended_at IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total_secs: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(duration_secs), 0) FROM sessions WHERE ended_at IS NOT NULL",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Helper closure to award a global badge if not already earned
    let award = |badge_key: &str| {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM achievements WHERE game_id = '__global__' AND badge_key = ?1",
                rusqlite::params![badge_key],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if !exists {
            let id = Uuid::new_v4().to_string();
            let _ = conn.execute(
                "INSERT INTO achievements (id, game_id, badge_key, earned_at)
                 VALUES (?1, '__global__', ?2, ?3)",
                rusqlite::params![id, badge_key, now],
            );
        }
    };

    if unique_games >= 5 {
        award("variety_pack");
    }
    if unique_games >= 10 {
        award("collector");
    }
    if unique_games >= 25 {
        award("game_hoarder");
    }

    if total_secs >= 360_000 {
        award("total_100h");
    }
    if total_secs >= 1_800_000 {
        award("total_500h");
    }
}

/// On startup: close any sessions left open from a previous crash, preserving elapsed time.
pub fn recover_orphaned_sessions(state: &AppState) {
    let conn = state.db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    let _ = conn.execute(
        "UPDATE sessions
         SET ended_at = ?1,
             duration_secs = MAX(0, CAST((julianday(?1) - julianday(started_at)) * 86400 AS INTEGER))
         WHERE ended_at IS NULL",
        rusqlite::params![now],
    );
}
