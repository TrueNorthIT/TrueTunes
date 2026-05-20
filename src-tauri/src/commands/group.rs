use crate::sonos::SonosState;
use crate::ws::WsClient;
use serde_json::json;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn group_get_active(state: State<'_, Arc<SonosState>>) -> Result<Option<String>, String> {
    Ok(state.ids.read().await.group_id.clone())
}

#[tauri::command]
pub async fn group_set(
    state: State<'_, Arc<SonosState>>,
    ws: State<'_, Arc<WsClient>>,
    group_id: String,
) -> Result<serde_json::Value, String> {
    let groups = ws.groups.read().await;
    let target = groups
        .iter()
        .find(|g| g.id == group_id || g.coordinator_id == group_id)
        .cloned();
    drop(groups);

    let Some(group) = target else {
        return Ok(json!({ "error": "Unknown group" }));
    };

    {
        let mut ids = state.ids.write().await;
        ids.group_id = Some(group.id.clone());
        ids.queue_id = Some(group.coordinator_id.clone());
    }

    // Re-subscribe so Sonos pushes fresh state for the new group
    if let Some(handle) = ws.handle().await {
        let _ = handle
            .send(
                json!({ "namespace": "playbackExtended", "groupId": group.id, "command": "subscribe" }),
                json!({}),
            )
            .await;
        let _ = handle
            .send(
                json!({ "namespace": "groupVolume", "groupId": group.id, "command": "subscribe" }),
                json!({}),
            )
            .await;
    }

    Ok(json!({ "ok": true, "groupId": group.id }))
}

#[tauri::command]
pub async fn volume_group_set(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
    volume: i64,
) -> Result<serde_json::Value, String> {
    let group_id = state
        .ids
        .read()
        .await
        .group_id
        .clone()
        .ok_or_else(|| "No active group".to_string())?;
    let handle = ws
        .handle()
        .await
        .ok_or_else(|| "WS not connected".to_string())?;
    handle
        .send(
            json!({ "namespace": "groupVolume", "groupId": group_id, "command": "setVolume" }),
            json!({ "volume": volume }),
        )
        .await
}

#[tauri::command]
pub async fn ws_resync(_ws: State<'_, Arc<WsClient>>) -> Result<(), String> {
    // No-op for now — supervised reconnect handles drops automatically.
    // TODO: trigger a forced reconnect via a notify channel.
    Ok(())
}

#[tauri::command]
pub async fn queue_set_id(
    state: State<'_, Arc<SonosState>>,
    queue_id: String,
) -> Result<(), String> {
    let mut ids = state.ids.write().await;
    ids.queue_id = Some(queue_id);
    Ok(())
}
