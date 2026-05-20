use crate::azure::{http_client, url_encode, FUNCTION_URL};
use crate::config::ConfigState;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

const HUB: &str = "office";
const SUBPROTOCOL: &str = "json.webpubsub.azure.v1";

#[derive(Clone)]
struct PubSubHandle {
    tx: mpsc::Sender<Value>,
}

pub struct PubSubClient {
    handle: RwLock<Option<PubSubHandle>>,
}

impl PubSubClient {
    pub fn new() -> Self {
        Self {
            handle: RwLock::new(None),
        }
    }

    /// Best-effort broadcast via the live WS. Silently drops if not connected.
    pub async fn broadcast(&self, event: Value) {
        if let Some(h) = self.handle.read().await.clone() {
            let _ = h
                .tx
                .send(json!({
                    "type": "sendToGroup",
                    "group": HUB,
                    "data": event,
                    "dataType": "json",
                    "noEcho": true,
                }))
                .await;
        }
    }

    pub fn spawn(self: Arc<Self>, app: AppHandle) {
        tauri::async_runtime::spawn(async move {
            let mut delay = Duration::from_secs(1);
            loop {
                // Wait for a configured displayName
                let username = wait_for_username(&app).await;

                match self.clone().connect_once(&app, &username).await {
                    Ok(()) => {
                        delay = Duration::from_secs(1);
                    }
                    Err(e) => {
                        eprintln!("[pubsub] connect failed: {e}");
                    }
                }

                tokio::time::sleep(delay).await;
                delay = (delay * 2).min(Duration::from_secs(60));
            }
        });
    }

    async fn connect_once(self: Arc<Self>, app: &AppHandle, username: &str) -> Result<(), String> {
        // Negotiate: POST /api/connect?username=...
        let neg_url = format!(
            "{FUNCTION_URL}/api/connect?username={}",
            url_encode(username)
        );
        let res = http_client()
            .post(&neg_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("negotiate HTTP {}", res.status().as_u16()));
        }
        let body: Value = res.json().await.map_err(|e| e.to_string())?;
        let ws_url = body
            .get("webPubSubUrl")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "no webPubSubUrl in negotiate response".to_string())?
            .to_string();

        // Refresh attribution map from Cosmos on each reconnect
        if let Ok(r) = http_client()
            .get(format!("{FUNCTION_URL}/api/attribution"))
            .send()
            .await
        {
            if let Ok(map) = r.json::<Value>().await {
                let _ = app.emit("attribution:map", map);
            }
        }

        let mut request = ws_url.into_client_request().map_err(|e| e.to_string())?;
        request.headers_mut().insert(
            "Sec-WebSocket-Protocol",
            HeaderValue::from_static(SUBPROTOCOL),
        );

        let (ws_stream, _resp) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| format!("WS connect: {e}"))?;
        let (mut sink, mut stream) = ws_stream.split();

        // Join group on open
        let join = json!({ "type": "joinGroup", "group": HUB }).to_string();
        sink.send(Message::Text(join.into()))
            .await
            .map_err(|e| e.to_string())?;

        let (tx, mut rx) = mpsc::channel::<Value>(32);
        *self.handle.write().await = Some(PubSubHandle { tx });

        let writer = tokio::spawn(async move {
            while let Some(frame) = rx.recv().await {
                if sink
                    .send(Message::Text(frame.to_string().into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            let _ = sink.close().await;
        });

        // Reader loop
        while let Some(msg) = stream.next().await {
            let msg = match msg {
                Ok(m) => m,
                Err(_) => break,
            };
            let text = match msg {
                Message::Text(t) => t.to_string(),
                Message::Binary(b) => String::from_utf8_lossy(&b).into_owned(),
                Message::Close(_) => break,
                _ => continue,
            };

            let Ok(parsed) = serde_json::from_str::<Value>(&text) else {
                continue;
            };

            let is_group_msg = parsed.get("type").and_then(|v| v.as_str()) == Some("message")
                && parsed.get("from").and_then(|v| v.as_str()) == Some("group")
                && parsed.get("group").and_then(|v| v.as_str()) == Some(HUB);
            if !is_group_msg {
                continue;
            }
            let Some(event) = parsed.get("data") else {
                continue;
            };
            if event.get("type").and_then(|v| v.as_str()) != Some("queued") {
                continue;
            }
            let _ = app.emit("attribution:event", event.clone());
        }

        writer.abort();
        *self.handle.write().await = None;
        Ok(())
    }
}

async fn wait_for_username(app: &AppHandle) -> String {
    loop {
        let cfg = app.state::<ConfigState>();
        let name = cfg
            .inner
            .lock()
            .ok()
            .and_then(|g| g.display_name.clone())
            .unwrap_or_default();
        if !name.is_empty() {
            return name;
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}
