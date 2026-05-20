use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_coordinator_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_docked_width: Option<u32>,
}

pub struct ConfigState {
    pub inner: Mutex<AppConfig>,
    pub path: PathBuf,
}

impl ConfigState {
    pub fn load(app: &tauri::AppHandle) -> Self {
        let dir = app
            .path()
            .app_data_dir()
            .expect("failed to resolve app data dir");
        std::fs::create_dir_all(&dir).ok();
        let path = dir.join("config.json");
        let cfg = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<AppConfig>(&s).ok())
            .unwrap_or_default();
        Self {
            inner: Mutex::new(cfg),
            path,
        }
    }

    pub fn save(&self) {
        if let Ok(guard) = self.inner.lock() {
            if let Ok(json) = serde_json::to_string_pretty(&*guard) {
                let _ = std::fs::write(&self.path, json);
            }
        }
    }
}
