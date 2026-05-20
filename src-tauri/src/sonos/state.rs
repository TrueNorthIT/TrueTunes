use tokio::sync::RwLock;

#[derive(Debug, Default, Clone)]
pub struct SonosRuntimeIds {
    pub service_id: Option<String>,
    pub account_id: Option<String>,
    pub household_id: Option<String>,
    pub group_id: Option<String>,
    pub queue_id: Option<String>,
}

pub struct SonosState {
    pub session_token: RwLock<Option<String>>,
    pub ids: RwLock<SonosRuntimeIds>,
}

impl SonosState {
    pub fn new() -> Self {
        Self {
            session_token: RwLock::new(None),
            ids: RwLock::new(SonosRuntimeIds::default()),
        }
    }

    pub async fn set_token(&self, token: Option<String>) {
        *self.session_token.write().await = token;
    }

    pub async fn token(&self) -> Option<String> {
        self.session_token.read().await.clone()
    }
}
