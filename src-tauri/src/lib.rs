mod commands;
mod db;
mod error;
mod models;
mod monitor;
mod scanners;
mod state;

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::db::DbPool;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the existing window when a second instance is launched
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let db_path = get_db_path(app.handle());
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent)?;
            }

            // One-time migration: if the new DB is empty but an old DB exists under a
            // previous app identifier, copy it over so playtime history is preserved.
            migrate_legacy_db(&db_path);

            let db = DbPool::open(&db_path).expect("Failed to open database");

            // Run migrations
            {
                let mut conn = db.conn.lock().unwrap();
                let migrations = db::migrations::get_migrations();
                migrations.to_latest(&mut conn).expect("Migration failed");
            }

            let state = AppState::new(db);

            // Recover any orphaned sessions from a previous crash
            monitor::session_recorder::recover_orphaned_sessions(&state);

            // Manage state in Tauri (commands use State<'_, AppState>)
            app.manage(state.clone());

            // Start background process monitor with a clone of the state
            let app_handle: AppHandle = app.handle().clone();
            let state_for_monitor = state.clone();
            tauri::async_runtime::spawn(async move {
                monitor::start_monitor(app_handle, state_for_monitor).await;
            });

            // Set up system tray — store handle so it isn't dropped
            let tray = setup_tray(app)?;
            app.manage(tray);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                // Read minimize_to_tray from saved settings
                let minimize = app.try_state::<AppState>().map_or(true, |state| {
                    let conn = state.db.conn.lock().unwrap();
                    conn.query_row(
                        "SELECT value FROM settings WHERE key = 'user_settings'",
                        [],
                        |r| r.get::<_, String>(0),
                    )
                    .ok()
                    .and_then(|j| serde_json::from_str::<serde_json::Value>(&j).ok())
                    .and_then(|v| v["minimizeToTray"].as_bool())
                    .unwrap_or(true)
                });

                if minimize {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Games
            commands::games::get_games,
            commands::games::get_game,
            commands::games::add_manual_game,
            commands::games::update_game,
            commands::games::delete_game,
            commands::games::permanently_delete_game,
            commands::games::set_favorite,
            // Sessions
            commands::sessions::get_sessions,
            commands::sessions::get_recent_sessions,
            commands::sessions::delete_session,
            commands::sessions::update_session,
            commands::sessions::update_session_notes,
            // Scanner
            commands::scanner::trigger_scan,
            // Stats
            commands::stats::get_game_stats,
            commands::stats::get_global_stats,
            commands::stats::get_heatmap,
            commands::stats::get_streak,
            commands::stats::get_achievements,
            commands::stats::get_top_games,
            commands::stats::get_game_streaks,
            commands::stats::get_daily_playtime,
            // Settings
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::export_data,
            commands::settings::reset_database,
            commands::settings::search_covers,
            commands::settings::search_heroes,
            commands::settings::open_db_folder,
            commands::settings::get_autostart,
            commands::settings::set_autostart,
            // Goals
            commands::goals::get_goals,
            commands::goals::set_goal,
            commands::goals::delete_goal,
            // Collections
            commands::collections::get_collections,
            commands::collections::get_collection,
            commands::collections::create_collection,
            commands::collections::update_collection,
            commands::collections::delete_collection,
            commands::collections::reorder_collections,
            commands::collections::get_collection_games,
            commands::collections::add_game_to_collection,
            commands::collections::remove_game_from_collection,
            commands::collections::reorder_collection_games,
            commands::collections::get_game_collections,
            // Launcher
            commands::launcher::launch_game,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn get_db_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir unavailable")
        .join("game-tracker.db")
}

/// If the current DB is essentially empty (schema only, < 16 KB) and a DB from a
/// previous app-identifier directory exists, copy it over so history is preserved.
/// This handles renames like com.gametracker.app → com.gamerpulse.app.
fn migrate_legacy_db(new_db_path: &std::path::Path) {
    const LEGACY_IDENTIFIERS: &[&str] = &["com.gamerpulse.app", "com.gametracker.app", "game-tracker"];

    // Skip if the current DB already has real data.
    if new_db_path.exists() {
        if let Ok(meta) = std::fs::metadata(new_db_path) {
            if meta.len() > 16_384 {
                return;
            }
        }
    }

    // Look for a legacy DB in a sibling app-data folder.
    let roaming = match new_db_path
        .parent()           // …/Roaming/com.gamerpulse.app
        .and_then(|p| p.parent()) // …/Roaming
    {
        Some(p) => p,
        None => return,
    };

    for old_id in LEGACY_IDENTIFIERS {
        let old_path = roaming.join(old_id).join("game-tracker.db");
        if !old_path.exists() {
            continue;
        }
        // Checkpoint the WAL so the .db file is self-contained before copying.
        if let Ok(conn) = rusqlite::Connection::open(&old_path) {
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
        if std::fs::copy(&old_path, new_db_path).is_ok() {
            eprintln!(
                "[migrate] Copied legacy database from {:?} to {:?}",
                old_path, new_db_path
            );
        }
        return; // Stop after the first successful migration.
    }
}

fn setup_tray(app: &tauri::App) -> Result<tauri::tray::TrayIcon, Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(tray)
}
