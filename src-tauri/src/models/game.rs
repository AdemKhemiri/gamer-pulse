use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GameSource {
    Steam,
    Epic,
    Gog,
    Xbox,
    Riot,
    Ubisoft,
    Ea,
    Battlenet,
    Custom,  // games found via custom path scanning
    Manual,  // games added manually by the user via the UI
}

impl GameSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            GameSource::Steam => "steam",
            GameSource::Epic => "epic",
            GameSource::Gog => "gog",
            GameSource::Xbox => "xbox",
            GameSource::Riot => "riot",
            GameSource::Ubisoft => "ubisoft",
            GameSource::Ea => "ea",
            GameSource::Battlenet => "battlenet",
            GameSource::Custom => "custom",
            GameSource::Manual => "manual",
        }
    }
}

impl std::fmt::Display for GameSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for GameSource {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "steam" => Ok(GameSource::Steam),
            "epic" => Ok(GameSource::Epic),
            "gog" => Ok(GameSource::Gog),
            "xbox" => Ok(GameSource::Xbox),
            "riot" => Ok(GameSource::Riot),
            "ubisoft" => Ok(GameSource::Ubisoft),
            "ea" => Ok(GameSource::Ea),
            "battlenet" => Ok(GameSource::Battlenet),
            "custom" => Ok(GameSource::Custom),
            "manual" => Ok(GameSource::Manual),
            _ => Err(format!("Unknown source: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GameStatus {
    Installed,
    Deleted,
    Hidden,
}

impl GameStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            GameStatus::Installed => "installed",
            GameStatus::Deleted => "deleted",
            GameStatus::Hidden => "hidden",
        }
    }
}

impl std::fmt::Display for GameStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for GameStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "installed" => Ok(GameStatus::Installed),
            "deleted" => Ok(GameStatus::Deleted),
            "hidden" => Ok(GameStatus::Hidden),
            _ => Err(format!("Unknown status: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub name: String,
    pub source: String,
    pub source_id: Option<String>,
    pub install_path: Option<String>,
    pub exe_path: Option<String>,
    pub cover_url: Option<String>,
    pub bg_url: Option<String>,
    pub status: String,
    pub is_favorite: bool,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub added_at: String,
    pub last_scanned_at: Option<String>,
    pub deleted_at: Option<String>,
    // Computed fields from joins
    pub total_play_secs: Option<i64>,
    pub last_played_at: Option<String>,
    pub session_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewManualGame {
    pub name: String,
    pub exe_path: Option<String>,
    pub cover_url: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GamePatch {
    pub name: Option<String>,
    pub exe_path: Option<String>,
    pub cover_url: Option<String>,
    pub bg_url: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<Vec<String>>,
    pub is_favorite: Option<bool>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameFilter {
    pub search: Option<String>,
    pub source: Option<String>,
    pub status: Option<String>,
    pub tag: Option<String>,
    pub favorites_only: Option<bool>,
    pub sort_by: Option<String>, // "name" | "playtime" | "last_played" | "added"
    pub sort_dir: Option<String>, // "asc" | "desc"
}

/// Internal struct used by scanners to report discovered games
#[derive(Debug, Clone)]
pub struct DetectedGame {
    pub source: GameSource,
    pub source_id: String,
    pub name: String,
    pub install_path: Option<String>,
    pub exe_path: Option<String>,
    pub cover_url: Option<String>,
}
