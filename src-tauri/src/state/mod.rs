use std::sync::Arc;

use crate::db::DbPool;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<DbPool>,
}

impl AppState {
    pub fn new(db: DbPool) -> Self {
        AppState { db: Arc::new(db) }
    }
}
