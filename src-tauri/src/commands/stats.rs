use tauri::State;

use crate::error::Result;
use crate::models::{
    Achievement, DailyPlaytime, GameStats, GlobalStats, HeatmapEntry, StreakInfo, TopGame,
};
use crate::state::AppState;

const BADGE_META: &[(&str, &str, &str)] = &[
    ("first_hour", "First Hour", "Played for 1 hour"),
    ("ten_hours", "Dedicated", "Played for 10 hours"),
    ("fifty_hours", "Veteran", "Played for 50 hours"),
    ("hundred_hours", "Century", "Played for 100 hours"),
    ("night_owl", "Night Owl", "Played past midnight"),
    ("collector", "Collector", "Played 10 different games"),
    (
        "marathon",
        "Marathon",
        "Played for 3+ hours in a single session",
    ),
    (
        "dedicated_streak",
        "Dedicated",
        "Played a game 7 days in a row",
    ),
    (
        "speed_runner",
        "Speed Runner",
        "Completed a session under 30 minutes",
    ),
    (
        "early_bird",
        "Early Bird",
        "Started a session between 4am and 7am",
    ),
    ("variety_pack", "Variety Pack", "Played 5 different games"),
    ("game_hoarder", "Game Hoarder", "Played 25 different games"),
    (
        "total_100h",
        "Century Club",
        "100 hours played across all games",
    ),
    (
        "total_500h",
        "Obsessed",
        "500 hours played across all games",
    ),
];

#[tauri::command]
pub async fn get_game_stats(state: State<'_, AppState>, game_id: String) -> Result<GameStats> {
    let conn = state.db.conn.lock().unwrap();
    let stats = conn.query_row(
        r#"SELECT
             ?1 AS game_id,
             COALESCE(SUM(duration_secs), 0) AS total_secs,
             COUNT(id) AS session_count,
             COALESCE(AVG(duration_secs), 0) AS avg_session_secs,
             COALESCE(MAX(duration_secs), 0) AS longest_session_secs,
             MIN(started_at) AS first_played_at,
             MAX(started_at) AS last_played_at
           FROM sessions
           WHERE game_id = ?1 AND ended_at IS NOT NULL"#,
        rusqlite::params![game_id],
        |row| {
            Ok(GameStats {
                game_id: row.get(0)?,
                total_secs: row.get(1)?,
                session_count: row.get(2)?,
                avg_session_secs: row.get::<_, f64>(3).map(|v| v as i64)?,
                longest_session_secs: row.get(4)?,
                first_played_at: row.get(5)?,
                last_played_at: row.get(6)?,
                current_streak: 0,
                longest_streak: 0,
            })
        },
    )?;
    let streak = compute_game_streak(&conn, &stats.game_id);
    Ok(GameStats {
        current_streak: streak.0,
        longest_streak: streak.1,
        ..stats
    })
}

/// Returns (current_streak, longest_streak) for a single game.
fn compute_game_streak(conn: &rusqlite::Connection, game_id: &str) -> (i64, i64) {
    let days: Vec<String> = {
        let mut stmt = match conn.prepare(
            "SELECT DISTINCT DATE(started_at, 'localtime') AS day
             FROM sessions WHERE game_id = ?1 AND ended_at IS NOT NULL
             ORDER BY day DESC",
        ) {
            Ok(s) => s,
            Err(_) => return (0, 0),
        };
        stmt.query_map(rusqlite::params![game_id], |r| r.get(0))
            .unwrap()
            .flatten()
            .collect()
    };

    if days.is_empty() {
        return (0, 0);
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    let mut current = 0i64;
    if days[0] == today || days[0] == yesterday {
        let mut expected = days[0].clone();
        for day in &days {
            if *day == expected {
                current += 1;
                let d = chrono::NaiveDate::parse_from_str(&expected, "%Y-%m-%d").unwrap();
                expected = (d - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string();
            } else {
                break;
            }
        }
    }

    let mut longest = 0i64;
    let mut run = 1i64;
    for i in 0..days.len().saturating_sub(1) {
        let a = chrono::NaiveDate::parse_from_str(&days[i], "%Y-%m-%d");
        let b = chrono::NaiveDate::parse_from_str(&days[i + 1], "%Y-%m-%d");
        if let (Ok(a), Ok(b)) = (a, b) {
            if (a - b).num_days() == 1 {
                run += 1;
            } else {
                longest = longest.max(run);
                run = 1;
            }
        }
    }
    longest = longest.max(run);

    (current, longest)
}

#[tauri::command]
pub async fn get_global_stats(state: State<'_, AppState>) -> Result<GlobalStats> {
    let conn = state.db.conn.lock().unwrap();

    let total_games: i64 = conn.query_row(
        "SELECT COUNT(*) FROM games WHERE status != 'hidden'",
        [],
        |r| r.get(0),
    )?;
    let installed_games: i64 = conn.query_row(
        "SELECT COUNT(*) FROM games WHERE status = 'installed'",
        [],
        |r| r.get(0),
    )?;
    let deleted_games: i64 = conn.query_row(
        "SELECT COUNT(*) FROM games WHERE status = 'deleted'",
        [],
        |r| r.get(0),
    )?;
    let total_play_secs: i64 = conn.query_row(
        "SELECT COALESCE(SUM(duration_secs), 0) FROM sessions WHERE ended_at IS NOT NULL",
        [],
        |r| r.get(0),
    )?;
    let total_sessions: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE ended_at IS NOT NULL",
        [],
        |r| r.get(0),
    )?;
    let unique_days: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT DATE(started_at, 'localtime')) FROM sessions WHERE ended_at IS NOT NULL",
            [],
            |r| r.get(0),
        )?;

    let streak = compute_streak(&conn);

    let most_played: Option<(String, String)> = conn
        .query_row(
            r#"SELECT g.id, g.name
               FROM sessions s JOIN games g ON g.id = s.game_id
               WHERE s.ended_at IS NOT NULL
               GROUP BY s.game_id
               ORDER BY SUM(s.duration_secs) DESC
               LIMIT 1"#,
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    Ok(GlobalStats {
        total_games,
        installed_games,
        deleted_games,
        total_play_secs,
        total_sessions,
        unique_days_played: unique_days,
        current_streak: streak.current_streak,
        longest_streak: streak.longest_streak,
        most_played_game_id: most_played.as_ref().map(|(id, _)| id.clone()),
        most_played_game_name: most_played.map(|(_, name)| name),
    })
}

#[tauri::command]
pub async fn get_heatmap(
    state: State<'_, AppState>,
    game_id: Option<String>,
    year: i32,
) -> Result<Vec<HeatmapEntry>> {
    let conn = state.db.conn.lock().unwrap();

    let entries: Vec<HeatmapEntry> = if let Some(gid) = game_id {
        let mut stmt = conn.prepare(
            r#"SELECT DATE(started_at, 'localtime') AS day,
                      SUM(duration_secs) / 60 AS minutes,
                      COUNT(*) AS session_count
               FROM sessions
               WHERE ended_at IS NOT NULL AND game_id = ?1
                 AND strftime('%Y', started_at, 'localtime') = ?2
               GROUP BY day
               ORDER BY day"#,
        )?;
        let v: rusqlite::Result<Vec<HeatmapEntry>> = stmt
            .query_map(rusqlite::params![gid, year.to_string()], row_to_heatmap)?
            .collect();
        v?
    } else {
        let mut stmt = conn.prepare(
            r#"SELECT DATE(started_at, 'localtime') AS day,
                      SUM(duration_secs) / 60 AS minutes,
                      COUNT(*) AS session_count
               FROM sessions
               WHERE ended_at IS NOT NULL
                 AND strftime('%Y', started_at, 'localtime') = ?1
               GROUP BY day
               ORDER BY day"#,
        )?;
        let v: rusqlite::Result<Vec<HeatmapEntry>> = stmt
            .query_map(rusqlite::params![year.to_string()], row_to_heatmap)?
            .collect();
        v?
    };

    Ok(entries)
}

#[tauri::command]
pub async fn get_streak(state: State<'_, AppState>) -> Result<StreakInfo> {
    let conn = state.db.conn.lock().unwrap();
    Ok(compute_streak(&conn))
}

#[tauri::command]
pub async fn get_achievements(
    state: State<'_, AppState>,
    game_id: Option<String>,
) -> Result<Vec<Achievement>> {
    let conn = state.db.conn.lock().unwrap();

    let achievements: Vec<Achievement> = if let Some(gid) = game_id {
        let mut stmt = conn.prepare(
            r#"SELECT a.id, a.game_id, g.name, a.badge_key, a.earned_at
               FROM achievements a
               JOIN games g ON g.id = a.game_id
               WHERE a.game_id = ?1
               ORDER BY a.earned_at DESC"#,
        )?;
        let v: rusqlite::Result<Vec<Achievement>> = stmt
            .query_map(rusqlite::params![gid], row_to_achievement)?
            .collect();
        v?
    } else {
        let mut stmt = conn.prepare(
            r#"SELECT a.id, a.game_id, g.name, a.badge_key, a.earned_at
               FROM achievements a
               JOIN games g ON g.id = a.game_id
               ORDER BY a.earned_at DESC"#,
        )?;
        let v: rusqlite::Result<Vec<Achievement>> =
            stmt.query_map([], row_to_achievement)?.collect();
        v?
    };

    Ok(achievements)
}

#[tauri::command]
pub async fn get_game_streaks(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<serde_json::Value>> {
    let limit = limit.unwrap_or(5) as usize;
    let conn = state.db.conn.lock().unwrap();

    // Get all games that have at least one session
    let mut stmt = conn.prepare(
        r#"SELECT DISTINCT g.id, g.name, g.cover_url
           FROM games g
           JOIN sessions s ON s.game_id = g.id
           WHERE s.ended_at IS NOT NULL AND g.status = 'installed'"#,
    )?;

    let games: Vec<(String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut results: Vec<serde_json::Value> = games
        .into_iter()
        .map(|(id, name, cover_url)| {
            let (current, longest) = compute_game_streak(&conn, &id);
            serde_json::json!({
                "gameId": id,
                "gameName": name,
                "coverUrl": cover_url,
                "currentStreak": current,
                "longestStreak": longest,
            })
        })
        .filter(|v| {
            v["currentStreak"].as_i64().unwrap_or(0) > 0
                || v["longestStreak"].as_i64().unwrap_or(0) > 0
        })
        .collect();

    // Sort by current streak desc, then longest streak desc
    results.sort_by(|a, b| {
        b["currentStreak"]
            .as_i64()
            .unwrap_or(0)
            .cmp(&a["currentStreak"].as_i64().unwrap_or(0))
            .then(
                b["longestStreak"]
                    .as_i64()
                    .unwrap_or(0)
                    .cmp(&a["longestStreak"].as_i64().unwrap_or(0)),
            )
    });

    results.truncate(limit);
    Ok(results)
}

#[tauri::command]
pub async fn get_top_games(state: State<'_, AppState>, limit: Option<u32>) -> Result<Vec<TopGame>> {
    let limit = limit.unwrap_or(10);
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"SELECT g.id, g.name, COALESCE(SUM(s.duration_secs), 0) AS total_secs, g.cover_url
           FROM games g
           LEFT JOIN sessions s ON s.game_id = g.id AND s.ended_at IS NOT NULL
           WHERE g.status != 'hidden'
           GROUP BY g.id
           ORDER BY total_secs DESC
           LIMIT ?1"#,
    )?;

    let games = stmt
        .query_map(rusqlite::params![limit], |row| {
            Ok(TopGame {
                game_id: row.get(0)?,
                game_name: row.get(1)?,
                total_secs: row.get(2)?,
                cover_url: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(games)
}

#[tauri::command]
pub async fn get_daily_playtime(
    state: State<'_, AppState>,
    days: Option<u32>,
) -> Result<Vec<DailyPlaytime>> {
    let days = days.unwrap_or(30);
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        r#"SELECT DATE(started_at, 'localtime') AS day,
                  SUM(duration_secs) AS total_secs
           FROM sessions
           WHERE ended_at IS NOT NULL
             AND started_at >= DATE('now', 'localtime', ?1)
           GROUP BY day
           ORDER BY day ASC"#,
    )?;

    let modifier = format!("-{} days", days);
    let entries = stmt
        .query_map(rusqlite::params![modifier], |row| {
            Ok(DailyPlaytime {
                day: row.get(0)?,
                total_secs: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(entries)
}

fn compute_streak(conn: &rusqlite::Connection) -> StreakInfo {
    // Get all days with sessions, sorted descending
    let days: Vec<String> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT DATE(started_at, 'localtime') AS day
                 FROM sessions WHERE ended_at IS NOT NULL
                 ORDER BY day DESC",
            )
            .unwrap();
        stmt.query_map([], |r| r.get(0))
            .unwrap()
            .flatten()
            .collect()
    };

    if days.is_empty() {
        return StreakInfo {
            current_streak: 0,
            longest_streak: 0,
            last_played_date: None,
            streak_start_date: None,
        };
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let yesterday = (chrono::Local::now() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();

    // Current streak: count consecutive days back from today or yesterday
    let mut current = 0i64;
    let mut streak_start = None;

    if days[0] == today || days[0] == yesterday {
        let mut expected = days[0].clone();
        for day in &days {
            if *day == expected {
                current += 1;
                streak_start = Some(day.clone());
                // Move expected back one day
                let d = chrono::NaiveDate::parse_from_str(&expected, "%Y-%m-%d").unwrap();
                expected = (d - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string();
            } else {
                break;
            }
        }
    }

    // Longest streak: scan all days
    let mut longest = 0i64;
    let mut run = 1i64;
    for i in 0..days.len().saturating_sub(1) {
        let a = chrono::NaiveDate::parse_from_str(&days[i], "%Y-%m-%d");
        let b = chrono::NaiveDate::parse_from_str(&days[i + 1], "%Y-%m-%d");
        if let (Ok(a), Ok(b)) = (a, b) {
            if (a - b).num_days() == 1 {
                run += 1;
            } else {
                longest = longest.max(run);
                run = 1;
            }
        }
    }
    longest = longest.max(run);

    StreakInfo {
        current_streak: current,
        longest_streak: longest,
        last_played_date: days.first().cloned(),
        streak_start_date: streak_start,
    }
}

fn row_to_heatmap(row: &rusqlite::Row<'_>) -> rusqlite::Result<HeatmapEntry> {
    Ok(HeatmapEntry {
        day: row.get(0)?,
        minutes: row.get(1)?,
        session_count: row.get(2)?,
    })
}

fn row_to_achievement(row: &rusqlite::Row<'_>) -> rusqlite::Result<Achievement> {
    let badge_key: String = row.get(3)?;
    let (label, desc) = BADGE_META
        .iter()
        .find(|(k, _, _)| *k == badge_key.as_str())
        .map(|(_, l, d)| (*l, *d))
        .unwrap_or(("Unknown", ""));

    Ok(Achievement {
        id: row.get(0)?,
        game_id: row.get(1)?,
        game_name: row.get(2)?,
        badge_key,
        badge_label: label.to_string(),
        badge_description: desc.to_string(),
        earned_at: row.get(4)?,
    })
}
