use chrono::{NaiveDate, Utc};
use uuid::Uuid;

use crate::state::AppState;

// ─── Types ────────────────────────────────────────────────────────────────────

/// A badge that was just unlocked during an achievement check.
#[derive(Debug)]
pub struct UnlockedBadge {
    pub badge_key: String,
    pub badge_label: String,
    pub badge_description: String,
}

// ─── Badge catalogue ──────────────────────────────────────────────────────────

/// Complete badge catalogue: (key, display_label, description).
static BADGE_CATALOGUE: &[(&str, &str, &str)] = &[
    ("first_hour",       "First Hour",    "Played for 1 hour"),
    ("ten_hours",        "Dedicated",     "Played for 10 hours"),
    ("fifty_hours",      "Veteran",       "Played for 50 hours"),
    ("hundred_hours",    "Century",       "Played for 100 hours"),
    ("night_owl",        "Night Owl",     "Played past midnight"),
    ("marathon",         "Marathon",      "Played 3+ hours in a single session"),
    ("dedicated_streak", "On a Roll",     "Played 7 days in a row"),
    ("speed_runner",     "Speed Runner",  "Completed a session in under 30 minutes"),
    ("early_bird",       "Early Bird",    "Started a session between 4 am and 7 am"),
    ("variety_pack",     "Variety Pack",  "Played 5 different games"),
    ("collector",        "Collector",     "Played 10 different games"),
    ("game_hoarder",     "Game Hoarder",  "Played 25 different games"),
    ("total_100h",       "Century Club",  "100+ hours across all games"),
    ("total_500h",       "Legend",        "500+ hours across all games"),
];

fn badge_meta(key: &str) -> (&'static str, &'static str) {
    BADGE_CATALOGUE
        .iter()
        .find(|(k, _, _)| *k == key)
        .map(|(_, label, desc)| (*label, *desc))
        .unwrap_or(("Achievement", ""))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Insert a badge row if not already present.
/// Returns `Some(UnlockedBadge)` only when the badge is newly awarded.
fn try_award(
    conn: &rusqlite::Connection,
    game_id: &str,
    badge_key: &str,
    now: &str,
) -> Option<UnlockedBadge> {
    let already_earned: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM achievements WHERE game_id = ?1 AND badge_key = ?2",
            rusqlite::params![game_id, badge_key],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if already_earned {
        return None;
    }

    let id = Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT INTO achievements (id, game_id, badge_key, earned_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, game_id, badge_key, now],
    );

    let (label, desc) = badge_meta(badge_key);
    Some(UnlockedBadge {
        badge_key: badge_key.to_owned(),
        badge_label: label.to_owned(),
        badge_description: desc.to_owned(),
    })
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

// ─── Public API ───────────────────────────────────────────────────────────────

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

    let session_id: Option<(String, String)> = conn
        .query_row(
            "SELECT id, started_at FROM sessions WHERE game_id = ?1 AND ended_at IS NULL
             ORDER BY started_at DESC LIMIT 1",
            rusqlite::params![game_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let (session_id, started_at) = session_id?;

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

/// Award achievements based on the completed session. Returns every badge that was
/// newly unlocked so the caller can surface notifications.
pub fn check_achievements(state: &AppState, game_id: &str) -> Vec<UnlockedBadge> {
    let conn = state.db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    let mut unlocked: Vec<UnlockedBadge> = Vec::new();

    // ── Cumulative playtime milestones ─────────────────────────────────────────
    let total_secs: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(duration_secs), 0) FROM sessions
             WHERE game_id = ?1 AND ended_at IS NOT NULL",
            rusqlite::params![game_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    for (badge_key, threshold) in &[
        ("first_hour",    3_600_i64),
        ("ten_hours",    36_000_i64),
        ("fifty_hours",  180_000_i64),
        ("hundred_hours",360_000_i64),
    ] {
        if total_secs >= *threshold {
            if let Some(b) = try_award(&conn, game_id, badge_key, &now) {
                unlocked.push(b);
            }
        }
    }

    // ── Night Owl: session ended 00:00–05:59 local ────────────────────────────
    let has_night: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sessions WHERE game_id = ?1
             AND ended_at IS NOT NULL
             AND CAST(strftime('%H', ended_at, 'localtime') AS INTEGER) < 6",
            rusqlite::params![game_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0)
        > 0;

    if has_night {
        if let Some(b) = try_award(&conn, game_id, "night_owl", &now) {
            unlocked.push(b);
        }
    }

    // ── Marathon: single session ≥ 3 hours ────────────────────────────────────
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
        if let Some(b) = try_award(&conn, game_id, "marathon", &now) {
            unlocked.push(b);
        }
    }

    // ── Dedicated Streak: 7 consecutive days on this game ─────────────────────
    if longest_streak_for_game(&conn, game_id) >= 7 {
        if let Some(b) = try_award(&conn, game_id, "dedicated_streak", &now) {
            unlocked.push(b);
        }
    }

    // ── Speed Runner: session between 5–30 minutes ────────────────────────────
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
        if let Some(b) = try_award(&conn, game_id, "speed_runner", &now) {
            unlocked.push(b);
        }
    }

    // ── Early Bird: session started 04:00–06:59 local ─────────────────────────
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
        if let Some(b) = try_award(&conn, game_id, "early_bird", &now) {
            unlocked.push(b);
        }
    }

    // ── Global achievements (cross-game) ──────────────────────────────────────
    drop(conn);
    unlocked.extend(check_global_achievements(state, &now));

    unlocked
}

fn check_global_achievements(state: &AppState, now: &str) -> Vec<UnlockedBadge> {
    let conn = state.db.conn.lock().unwrap();
    let mut unlocked: Vec<UnlockedBadge> = Vec::new();

    // Ensure the __global__ placeholder game exists
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

    for (threshold, badge_key) in &[
        (5i64,  "variety_pack"),
        (10i64, "collector"),
        (25i64, "game_hoarder"),
    ] {
        if unique_games >= *threshold {
            if let Some(b) = try_award(&conn, "__global__", badge_key, now) {
                unlocked.push(b);
            }
        }
    }

    for (threshold_secs, badge_key) in &[
        (360_000_i64,   "total_100h"),
        (1_800_000_i64, "total_500h"),
    ] {
        if total_secs >= *threshold_secs {
            if let Some(b) = try_award(&conn, "__global__", badge_key, now) {
                unlocked.push(b);
            }
        }
    }

    unlocked
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
