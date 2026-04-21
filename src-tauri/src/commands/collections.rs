use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::error::Result;
use crate::models::{Collection, CollectionPatch, Game, NewCollection};
use crate::state::AppState;

// ─── helpers ──────────────────────────────────────────────────────────────────

/// Load a single collection row (with game_count) from an open connection.
fn load_collection(conn: &rusqlite::Connection, id: &str) -> rusqlite::Result<Collection> {
    conn.query_row(
        "SELECT c.id, c.name, c.description, c.color, c.icon, c.position,
                c.created_at, c.updated_at,
                COUNT(cg.game_id) AS game_count
         FROM collections c
         LEFT JOIN collection_games cg ON cg.collection_id = c.id
         WHERE c.id = ?1
         GROUP BY c.id",
        rusqlite::params![id],
        row_to_collection,
    )
}

fn row_to_collection(row: &rusqlite::Row<'_>) -> rusqlite::Result<Collection> {
    Ok(Collection {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        color: row.get(3)?,
        icon: row.get(4)?,
        position: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        game_count: row.get(8)?,
    })
}

/// Load all games belonging to a collection, ordered by their position within it.
/// Reuses the same rich query that `get_games` uses (with play stats via JOIN).
fn load_collection_games(conn: &rusqlite::Connection, collection_id: &str) -> rusqlite::Result<Vec<Game>> {
    let mut stmt = conn.prepare(
        "SELECT g.id, g.name, g.source, g.source_id, g.install_path, g.exe_path,
                g.cover_url, g.bg_url, g.status, g.is_favorite, g.notes, g.tags,
                g.added_at, g.last_scanned_at, g.deleted_at,
                COALESCE(s.total_play_secs, 0) AS total_play_secs,
                s.last_played_at,
                COALESCE(s.session_count, 0) AS session_count
         FROM games g
         JOIN collection_games cg ON cg.game_id = g.id
         LEFT JOIN (
             SELECT game_id,
                    SUM(duration_secs)  AS total_play_secs,
                    COUNT(*)            AS session_count,
                    MAX(started_at)     AS last_played_at
             FROM sessions
             WHERE ended_at IS NOT NULL
             GROUP BY game_id
         ) s ON s.game_id = g.id
         WHERE cg.collection_id = ?1
           AND g.status NOT IN ('deleted', 'blocked')
         ORDER BY cg.position ASC, g.name ASC",
    )?;

    let rows = stmt
        .query_map(rusqlite::params![collection_id], |row| {
            let tags_json: String = row.get(11)?;
            let tags: Vec<String> =
                serde_json::from_str(&tags_json).unwrap_or_default();
            Ok(Game {
                id: row.get(0)?,
                name: row.get(1)?,
                source: row.get(2)?,
                source_id: row.get(3)?,
                install_path: row.get(4)?,
                exe_path: row.get(5)?,
                cover_url: row.get(6)?,
                bg_url: row.get(7)?,
                status: row.get(8)?,
                is_favorite: row.get::<_, i64>(9)? != 0,
                notes: row.get(10)?,
                tags,
                added_at: row.get(12)?,
                last_scanned_at: row.get(13)?,
                deleted_at: row.get(14)?,
                total_play_secs: row.get(15)?,
                last_played_at: row.get(16)?,
                session_count: row.get(17)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

// ─── commands ─────────────────────────────────────────────────────────────────

/// Return all collections ordered by their `position`, with game counts.
#[tauri::command]
pub async fn get_collections(state: State<'_, AppState>) -> Result<Vec<Collection>> {
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.description, c.color, c.icon, c.position,
                c.created_at, c.updated_at,
                COUNT(cg.game_id) AS game_count
         FROM collections c
         LEFT JOIN collection_games cg ON cg.collection_id = c.id
         GROUP BY c.id
         ORDER BY c.position ASC, c.created_at ASC",
    )?;

    let collections = stmt
        .query_map([], row_to_collection)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(collections)
}

/// Return a single collection by id.
#[tauri::command]
pub async fn get_collection(state: State<'_, AppState>, id: String) -> Result<Collection> {
    let conn = state.db.conn.lock().unwrap();
    Ok(load_collection(&conn, &id)?)
}

/// Create a new collection and return it.
#[tauri::command]
pub async fn create_collection(
    state: State<'_, AppState>,
    payload: NewCollection,
) -> Result<Collection> {
    let conn = state.db.conn.lock().unwrap();
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // Assign position = max(existing) + 1 so new collections land at the bottom.
    let next_pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM collections",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let color = payload.color.unwrap_or_else(|| "#6c7086".to_string());
    let icon = payload.icon.unwrap_or_else(|| "folder".to_string());

    conn.execute(
        "INSERT INTO collections (id, name, description, color, icon, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        rusqlite::params![
            id,
            payload.name,
            payload.description,
            color,
            icon,
            next_pos,
            now
        ],
    )?;

    Ok(load_collection(&conn, &id)?)
}

/// Update mutable fields on a collection and return the updated record.
#[tauri::command]
pub async fn update_collection(
    state: State<'_, AppState>,
    id: String,
    patch: CollectionPatch,
) -> Result<Collection> {
    let conn = state.db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    if let Some(name) = patch.name {
        conn.execute(
            "UPDATE collections SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, now, id],
        )?;
    }
    if let Some(desc) = patch.description {
        conn.execute(
            "UPDATE collections SET description = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![desc, now, id],
        )?;
    }
    if let Some(color) = patch.color {
        conn.execute(
            "UPDATE collections SET color = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![color, now, id],
        )?;
    }
    if let Some(icon) = patch.icon {
        conn.execute(
            "UPDATE collections SET icon = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![icon, now, id],
        )?;
    }

    Ok(load_collection(&conn, &id)?)
}

/// Delete a collection (cascade removes all collection_games entries).
#[tauri::command]
pub async fn delete_collection(state: State<'_, AppState>, id: String) -> Result<()> {
    let conn = state.db.conn.lock().unwrap();
    conn.execute("DELETE FROM collections WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

/// Reorder collections by providing the full ordered list of ids.
/// Any id not present in the list keeps its current position.
#[tauri::command]
pub async fn reorder_collections(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<Vec<Collection>> {
    {
        let conn = state.db.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        for (pos, cid) in ids.iter().enumerate() {
            conn.execute(
                "UPDATE collections SET position = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![pos as i64, now, cid],
            )?;
        }
    }
    get_collections(state).await
}

/// Return all games in a collection, ordered by position then name.
#[tauri::command]
pub async fn get_collection_games(
    state: State<'_, AppState>,
    collection_id: String,
) -> Result<Vec<Game>> {
    let conn = state.db.conn.lock().unwrap();
    Ok(load_collection_games(&conn, &collection_id)?)
}

/// Add a game to a collection. If already present, this is a no-op.
/// The game is appended at the end (max position + 1).
#[tauri::command]
pub async fn add_game_to_collection(
    state: State<'_, AppState>,
    collection_id: String,
    game_id: String,
) -> Result<()> {
    let conn = state.db.conn.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    let next_pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM collection_games WHERE collection_id = ?1",
            rusqlite::params![collection_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT OR IGNORE INTO collection_games (collection_id, game_id, position, added_at)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![collection_id, game_id, next_pos, now],
    )?;

    Ok(())
}

/// Remove a game from a collection.
#[tauri::command]
pub async fn remove_game_from_collection(
    state: State<'_, AppState>,
    collection_id: String,
    game_id: String,
) -> Result<()> {
    let conn = state.db.conn.lock().unwrap();
    conn.execute(
        "DELETE FROM collection_games WHERE collection_id = ?1 AND game_id = ?2",
        rusqlite::params![collection_id, game_id],
    )?;
    Ok(())
}

/// Reorder games within a collection by providing the full ordered list of game ids.
#[tauri::command]
pub async fn reorder_collection_games(
    state: State<'_, AppState>,
    collection_id: String,
    game_ids: Vec<String>,
) -> Result<Vec<Game>> {
    {
        let conn = state.db.conn.lock().unwrap();
        for (pos, gid) in game_ids.iter().enumerate() {
            conn.execute(
                "UPDATE collection_games SET position = ?1
                 WHERE collection_id = ?2 AND game_id = ?3",
                rusqlite::params![pos as i64, collection_id, gid],
            )?;
        }
    }
    get_collection_games(state, collection_id).await
}

/// Return all collections that contain a given game (useful for the GameDetail page).
#[tauri::command]
pub async fn get_game_collections(
    state: State<'_, AppState>,
    game_id: String,
) -> Result<Vec<Collection>> {
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.description, c.color, c.icon, c.position,
                c.created_at, c.updated_at,
                COUNT(cg2.game_id) AS game_count
         FROM collections c
         JOIN collection_games cg ON cg.collection_id = c.id AND cg.game_id = ?1
         LEFT JOIN collection_games cg2 ON cg2.collection_id = c.id
         GROUP BY c.id
         ORDER BY c.position ASC",
    )?;

    let collections = stmt
        .query_map(rusqlite::params![game_id], row_to_collection)?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(collections)
}
