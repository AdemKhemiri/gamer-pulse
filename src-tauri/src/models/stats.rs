use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStats {
    pub game_id: String,
    pub total_secs: i64,
    pub session_count: i64,
    pub avg_session_secs: i64,
    pub longest_session_secs: i64,
    pub first_played_at: Option<String>,
    pub last_played_at: Option<String>,
    pub current_streak: i64,
    pub longest_streak: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStats {
    pub total_games: i64,
    pub installed_games: i64,
    pub deleted_games: i64,
    pub total_play_secs: i64,
    pub total_sessions: i64,
    pub unique_days_played: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub most_played_game_id: Option<String>,
    pub most_played_game_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeatmapEntry {
    pub day: String, // "YYYY-MM-DD"
    pub minutes: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakInfo {
    pub current_streak: i64,
    pub longest_streak: i64,
    pub last_played_date: Option<String>,
    pub streak_start_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: String,
    pub game_id: String,
    pub game_name: Option<String>,
    pub badge_key: String,
    pub badge_label: String,
    pub badge_description: String,
    pub earned_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPlaytime {
    pub day: String,
    pub total_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopGame {
    pub game_id: String,
    pub game_name: String,
    pub total_secs: i64,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameGoal {
    pub id: String,
    pub game_id: String,
    /// "weekly" | "monthly" | "total"
    pub period: String,
    pub target_secs: i64,
    /// Computed at query time for the current period window
    pub current_secs: i64,
    pub created_at: String,
}
