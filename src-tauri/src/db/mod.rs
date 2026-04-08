use std::sync::Mutex;

use rusqlite::Connection;

use crate::error::Result;

pub mod migrations;

pub struct DbPool {
    pub conn: Mutex<Connection>,
}

impl DbPool {
    pub fn open(path: &std::path::Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        Ok(DbPool {
            conn: Mutex::new(conn),
        })
    }
}
