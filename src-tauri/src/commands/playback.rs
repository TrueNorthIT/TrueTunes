use crate::sonos::client::{FetchRequest, FetchResponse, SonosClient};
use crate::sonos::SonosState;
use crate::ws::WsClient;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

async fn ws_playback(
    ws: &WsClient,
    state: &SonosState,
    command: &str,
    payload: Value,
) -> Result<Value, String> {
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
            json!({ "namespace": "playback", "groupId": group_id, "command": command }),
            payload,
        )
        .await
}

#[tauri::command]
pub async fn playback_play(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
) -> Result<Value, String> {
    ws_playback(&ws, &state, "play", json!({})).await
}

#[tauri::command]
pub async fn playback_pause(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
) -> Result<Value, String> {
    ws_playback(&ws, &state, "pause", json!({})).await
}

#[tauri::command]
pub async fn playback_skip_next(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
) -> Result<Value, String> {
    ws_playback(&ws, &state, "skipToNextTrack", json!({})).await
}

#[tauri::command]
pub async fn playback_skip_prev(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
) -> Result<Value, String> {
    ws_playback(&ws, &state, "skipBack", json!({})).await
}

#[tauri::command]
pub async fn playback_skip_to_track(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
    track_number: i64,
) -> Result<Value, String> {
    ws_playback(
        &ws,
        &state,
        "skipToTrack",
        json!({ "trackNumber": track_number }),
    )
    .await
}

#[tauri::command]
pub async fn playback_seek(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
    position_millis: i64,
) -> Result<Value, String> {
    ws_playback(
        &ws,
        &state,
        "seek",
        json!({ "positionMillis": position_millis }),
    )
    .await
}

#[tauri::command]
pub async fn playback_set_play_modes(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
    modes: Value,
) -> Result<Value, String> {
    ws_playback(&ws, &state, "setPlayModes", json!({ "playModes": modes })).await
}

#[tauri::command]
pub async fn playback_load_content(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
    payload: Value,
) -> Result<Value, String> {
    ws_playback(&ws, &state, "loadContent", payload).await
}

/// Re-subscribe to playbackExtended for the active group to force a fresh push.
#[tauri::command]
pub async fn playback_refresh(
    ws: State<'_, Arc<WsClient>>,
    state: State<'_, Arc<SonosState>>,
) -> Result<(), String> {
    let group_id = match state.ids.read().await.group_id.clone() {
        Some(g) => g,
        None => return Ok(()),
    };
    let handle = match ws.handle().await {
        Some(h) => h,
        None => return Ok(()),
    };
    let _ = handle
        .send(
            json!({ "namespace": "playbackExtended", "groupId": group_id, "command": "subscribe" }),
            json!({}),
        )
        .await;
    Ok(())
}

/// Fallback HTTP playback state fetch (mirrors getPlaybackState operation).
#[tauri::command]
pub async fn playback_state(
    client: State<'_, Arc<SonosClient>>,
) -> Result<FetchResponse, String> {
    Ok(client
        .fetch(FetchRequest {
            operation_id: "getPlaybackState".into(),
            path_params: HashMap::new(),
            query: HashMap::new(),
            body: None,
            headers: HashMap::new(),
        })
        .await)
}
