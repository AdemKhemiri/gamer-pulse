use rusqlite_migration::{Migrations, M};

pub fn get_migrations() -> Migrations<'static> {
    Migrations::new(vec![M::up(
        // Migration 1 – initial schema (games, sessions, achievements, settings)
        "CREATE TABLE IF NOT EXISTS games (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                source          TEXT NOT NULL,
                source_id       TEXT,
                install_path    TEXT,
                exe_path        TEXT,
                cover_url       TEXT,
                status          TEXT NOT NULL DEFAULT 'installed',
                is_favorite     INTEGER NOT NULL DEFAULT 0,
                notes           TEXT,
                tags            TEXT DEFAULT '[]',
                added_at        TEXT NOT NULL,
                last_scanned_at TEXT,
                deleted_at      TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_games_source   ON games(source);
            CREATE INDEX IF NOT EXISTS idx_games_status   ON games(status);
            CREATE INDEX IF NOT EXISTS idx_games_favorite ON games(is_favorite);

            CREATE TABLE IF NOT EXISTS sessions (
                id              TEXT PRIMARY KEY,
                game_id         TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                started_at      TEXT NOT NULL,
                ended_at        TEXT,
                duration_secs   INTEGER,
                process_name    TEXT,
                pid             INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_game_id    ON sessions(game_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

            CREATE TABLE IF NOT EXISTS achievements (
                id          TEXT PRIMARY KEY,
                game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                badge_key   TEXT NOT NULL,
                earned_at   TEXT NOT NULL,
                metadata    TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_achievements_game ON achievements(game_id);

            CREATE TABLE IF NOT EXISTS settings (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );",
    ),
    M::up(
        // Migration 2 – per-game playtime goals
        "CREATE TABLE IF NOT EXISTS game_goals (
            id          TEXT PRIMARY KEY,
            game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
            period      TEXT NOT NULL CHECK(period IN ('weekly', 'monthly', 'total')),
            target_secs INTEGER NOT NULL,
            created_at  TEXT NOT NULL,
            UNIQUE(game_id, period)
        );
        CREATE INDEX IF NOT EXISTS idx_game_goals_game ON game_goals(game_id);",
    )])
}
