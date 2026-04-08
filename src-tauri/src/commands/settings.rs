use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::{AppError, Result};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    pub scan_on_launch: bool,
    pub scan_interval_hours: u32,
    pub enable_steam: bool,
    pub enable_epic: bool,
    pub enable_gog: bool,
    pub enable_xbox: bool,
    pub minimize_to_tray: bool,
    pub theme: String,
    #[serde(default)]
    pub steamgriddb_api_key: String,
    #[serde(default)]
    pub custom_scan_paths: Vec<String>,
    #[serde(default)]
    pub custom_theme_colors: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub saved_themes: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
}

impl Default for UserSettings {
    fn default() -> Self {
        UserSettings {
            scan_on_launch: true,
            scan_interval_hours: 24,
            enable_steam: true,
            enable_epic: true,
            enable_gog: true,
            enable_xbox: true,
            minimize_to_tray: true,
            theme: "catppuccin".to_string(),
            steamgriddb_api_key: env!("SGDB_API_KEY").to_string(),
            custom_scan_paths: vec![],
            custom_theme_colors: std::collections::HashMap::new(),
            saved_themes: std::collections::HashMap::new(),
        }
    }
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<UserSettings> {
    let conn = state.db.conn.lock().unwrap();
    let json: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'user_settings'",
            [],
            |r| r.get(0),
        )
        .ok();

    if let Some(j) = json {
        Ok(serde_json::from_str(&j).unwrap_or_default())
    } else {
        Ok(UserSettings::default())
    }
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: UserSettings,
) -> Result<UserSettings> {
    let conn = state.db.conn.lock().unwrap();
    let json = serde_json::to_string(&settings)?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at)
         VALUES ('user_settings', ?1, ?2)",
        rusqlite::params![json, now],
    )?;
    Ok(settings)
}

/// Searches SteamGridDB for cover art. Returns a list of image URLs (600x900 grids).
#[tauri::command]
pub async fn search_covers(game_name: String, api_key: String) -> Result<Vec<String>> {
    const DEFAULT_KEY: &str = env!("SGDB_API_KEY");
    let api_key = if api_key.trim().is_empty() {
        DEFAULT_KEY.to_string()
    } else {
        api_key
    };

    let client = reqwest::Client::new();

    // Step 1: find the game on SteamGridDB
    let search_url = format!(
        "https://www.steamgriddb.com/api/v2/search/autocomplete/{}",
        game_name.replace(' ', "%20")
    );
    let search_resp: serde_json::Value = client
        .get(&search_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    let game_id = search_resp["data"][0]["id"]
        .as_u64()
        .ok_or_else(|| AppError::Other("Game not found on SteamGridDB".into()))?;

    // Step 2: fetch grid covers (600x900)
    let grids_url = format!(
        "https://www.steamgriddb.com/api/v2/grids/game/{}?dimensions=600x900&limit=12",
        game_id
    );
    let grids_resp: serde_json::Value = client
        .get(&grids_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
        .json()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    let urls: Vec<String> = grids_resp["data"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|g| g["url"].as_str().map(|s| s.to_string()))
        .collect();

    Ok(urls)
}

#[tauri::command]
pub async fn open_db_folder(app: tauri::AppHandle) -> Result<()> {
    use tauri::Manager;
    let db_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(db_dir)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("open")
            .arg(db_dir)
            .spawn()
            .map_err(|e| AppError::Other(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reset_database(state: State<'_, AppState>) -> Result<()> {
    let conn = state.db.conn.lock().unwrap();
    conn.execute_batch(
        "DELETE FROM achievements;
         DELETE FROM sessions;
         DELETE FROM games;
         DELETE FROM settings;",
    )?;
    Ok(())
}

#[tauri::command]
pub async fn export_data(state: State<'_, AppState>) -> Result<String> {
    let conn = state.db.conn.lock().unwrap();

    let mut games_stmt = conn.prepare("SELECT * FROM games ORDER BY name")?;
    let games: Vec<serde_json::Value> = games_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "source": row.get::<_, String>(2)?,
                "status": row.get::<_, String>(7)?,
            }))
        })?
        .flatten()
        .collect();

    let mut sessions_stmt = conn.prepare(
        "SELECT s.id, g.name, s.started_at, s.ended_at, s.duration_secs
         FROM sessions s JOIN games g ON g.id = s.game_id
         WHERE s.ended_at IS NOT NULL ORDER BY s.started_at",
    )?;
    let sessions: Vec<serde_json::Value> = sessions_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "game": row.get::<_, String>(1)?,
                "startedAt": row.get::<_, String>(2)?,
                "endedAt": row.get::<_, Option<String>>(3)?,
                "durationSecs": row.get::<_, Option<i64>>(4)?,
            }))
        })?
        .flatten()
        .collect();

    let export = serde_json::json!({
        "exportedAt": Utc::now().to_rfc3339(),
        "games": games,
        "sessions": sessions,
    });

    Ok(serde_json::to_string_pretty(&export)?)
}
