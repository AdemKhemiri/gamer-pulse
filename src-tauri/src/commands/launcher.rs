use crate::error::{AppError, Result};
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn launch_game(state: State<'_, AppState>, game_id: String) -> Result<()> {
    let (source, source_id, exe_path) = {
        let conn = state.db.conn.lock().unwrap();
        conn.query_row(
            "SELECT source, source_id, exe_path FROM games WHERE id = ?1",
            rusqlite::params![game_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )?
    };

    // Build the launch target: URL scheme for known launchers, exe path otherwise
    let target: String = match source.as_str() {
        "steam" => {
            let id = source_id.ok_or_else(|| AppError::Other("Steam app ID missing".into()))?;
            format!("steam://rungameid/{}", id)
        }
        "epic" => {
            let id = source_id.ok_or_else(|| AppError::Other("Epic app ID missing".into()))?;
            format!(
                "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                id
            )
        }
        _ => exe_path.ok_or_else(|| {
            AppError::Other(
                "No executable path set for this game. Edit the game and add an exe path.".into(),
            )
        })?,
    };

    // Use Windows ShellExecute via `cmd /c start` which handles both URLs and exe files.
    // CREATE_NO_WINDOW (0x08000000) prevents the cmd console from flashing on screen.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &target])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| AppError::Other(format!("Launch failed: {}", e)))?;
    }

    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| AppError::Other(format!("Launch failed: {}", e)))?;
    }

    Ok(())
}
