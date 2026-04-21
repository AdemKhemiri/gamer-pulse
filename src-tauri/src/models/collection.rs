use serde::{Deserialize, Serialize};

/// A user-created collection (shelf) of games with a defined order.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    /// Hex color used for visual identity in the UI (e.g. "#6c7086").
    pub color: String,
    /// Lucide icon name (e.g. "folder", "gamepad-2", "star").
    pub icon: String,
    /// Sort order among collections; lower = earlier.
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
    /// Number of games currently in this collection (computed via JOIN).
    pub game_count: i64,
}

/// Payload for creating a new collection.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewCollection {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

/// Partial-update payload for an existing collection.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionPatch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}
