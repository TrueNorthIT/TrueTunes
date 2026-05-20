use crate::azure::{get_json, url_encode, FUNCTION_URL};
use crate::config::ConfigState;
use crate::pubsub::PubSubClient;
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn stats_fetch(
    period: String,
    user_id: Option<String>,
    count: Option<i64>,
) -> Result<Value, String> {
    let mut url = format!("{FUNCTION_URL}/api/stats?period={}", url_encode(&period));
    if let Some(u) = user_id {
        url.push_str(&format!("&userId={}", url_encode(&u)));
    }
    if let Some(c) = count {
        url.push_str(&format!("&count={c}"));
    }
    get_json(&url).await
}

#[tauri::command]
pub async fn history_recent(user_id: String) -> Result<Value, String> {
    let url = format!(
        "{FUNCTION_URL}/api/recently-played?userId={}",
        url_encode(&user_id)
    );
    get_json(&url).await
}

/// Refresh the attribution map from Cosmos and emit it to renderers.
#[tauri::command]
pub async fn attribution_refresh(app: AppHandle) -> Result<(), String> {
    let url = format!("{FUNCTION_URL}/api/attribution");
    match get_json(&url).await {
        Ok(v) => {
            let _ = app.emit("attribution:map", v);
            Ok(())
        }
        Err(_) => Ok(()),
    }
}

/// Publish a queued event to /api/log-event AND broadcast attribution:event locally so
/// the queueing user sees their own badge update before the WS round-trip.
#[tauri::command]
pub async fn pubsub_publish_queued(
    app: AppHandle,
    cfg: State<'_, ConfigState>,
    pubsub: State<'_, Arc<PubSubClient>>,
    item: Value,
) -> Result<(), String> {
    let user = cfg
        .inner
        .lock()
        .ok()
        .and_then(|g| g.display_name.clone())
        .unwrap_or_default();

    let mut event = serde_json::Map::new();
    event.insert("type".into(), Value::String("queued".into()));
    if let Some(et) = item.get("eventType") {
        event.insert("eventType".into(), et.clone());
    }
    event.insert("user".into(), Value::String(user.clone()));
    for k in [
        "uri", "trackName", "artist", "artistId", "album", "albumId", "imageUrl",
    ] {
        if let Some(v) = item.get(k) {
            event.insert(k.into(), v.clone());
        }
    }
    event.insert(
        "timestamp".into(),
        Value::Number(serde_json::Number::from(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        )),
    );

    // Fire-and-forget POST to log-event; failures swallowed (silent failure mode).
    let payload = Value::Object(event.clone());
    let _ = crate::azure::send_json(
        reqwest::Method::POST,
        &format!("{FUNCTION_URL}/api/log-event"),
        Some(&payload),
    )
    .await;

    // Broadcast to other connected clients via Web PubSub (noEcho: we already emit locally)
    pubsub.broadcast(payload).await;

    let _ = app.emit("attribution:event", Value::Object(event));
    Ok(())
}
