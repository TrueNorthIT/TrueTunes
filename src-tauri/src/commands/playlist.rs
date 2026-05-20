use crate::azure::{get_json, raw_post_bytes, send_json, url_encode, FUNCTION_URL};
use crate::config::ConfigState;
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;

fn display_name(cfg: &ConfigState) -> String {
    cfg.inner
        .lock()
        .ok()
        .and_then(|g| g.display_name.clone())
        .unwrap_or_default()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFilter {
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub member: Option<String>,
}

#[tauri::command]
pub async fn playlist_list(filter: ListFilter) -> Result<Value, String> {
    let mut url = format!("{FUNCTION_URL}/api/playlists?");
    if let Some(o) = filter.owner {
        url.push_str(&format!("owner={}&", url_encode(&o)));
    }
    if let Some(m) = filter.member {
        url.push_str(&format!("member={}&", url_encode(&m)));
    }
    get_json(&url).await
}

#[tauri::command]
pub async fn playlist_get(id: String) -> Result<Value, String> {
    let url = format!("{FUNCTION_URL}/api/playlist/{}", url_encode(&id));
    get_json(&url).await
}

#[tauri::command]
pub async fn playlist_create(
    cfg: State<'_, ConfigState>,
    name: String,
    is_public: bool,
) -> Result<Value, String> {
    let owner = display_name(&cfg);
    send_json(
        Method::POST,
        &format!("{FUNCTION_URL}/api/playlists"),
        Some(&json!({ "name": name, "isPublic": is_public, "owner": owner })),
    )
    .await
}

#[tauri::command]
pub async fn playlist_update(
    cfg: State<'_, ConfigState>,
    playlist_id: String,
    patch: Value,
) -> Result<Value, String> {
    let user = display_name(&cfg);
    let mut body = patch.as_object().cloned().unwrap_or_default();
    body.insert("userName".into(), Value::String(user));
    send_json(
        Method::PUT,
        &format!("{FUNCTION_URL}/api/playlist/{}", url_encode(&playlist_id)),
        Some(&Value::Object(body)),
    )
    .await
}

#[tauri::command]
pub async fn playlist_delete(
    cfg: State<'_, ConfigState>,
    playlist_id: String,
) -> Result<Value, String> {
    let user = display_name(&cfg);
    send_json(
        Method::DELETE,
        &format!("{FUNCTION_URL}/api/playlist/{}", url_encode(&playlist_id)),
        Some(&json!({ "userName": user })),
    )
    .await
}

#[tauri::command]
pub async fn playlist_add_track(
    cfg: State<'_, ConfigState>,
    playlist_id: String,
    track: Value,
) -> Result<Value, String> {
    let user = display_name(&cfg);
    send_json(
        Method::POST,
        &format!(
            "{FUNCTION_URL}/api/playlist/{}/tracks",
            url_encode(&playlist_id)
        ),
        Some(&json!({ "track": track, "userName": user })),
    )
    .await
}

#[tauri::command]
pub async fn playlist_remove_track(
    cfg: State<'_, ConfigState>,
    playlist_id: String,
    uri: String,
) -> Result<Value, String> {
    let user = display_name(&cfg);
    send_json(
        Method::DELETE,
        &format!(
            "{FUNCTION_URL}/api/playlist/{}/tracks",
            url_encode(&playlist_id)
        ),
        Some(&json!({ "userName": user, "uri": uri })),
    )
    .await
}

#[tauri::command]
pub async fn playlist_reorder_tracks(
    cfg: State<'_, ConfigState>,
    playlist_id: String,
    from_index: i64,
    to_index: i64,
) -> Result<Value, String> {
    let user = display_name(&cfg);
    send_json(
        Method::PATCH,
        &format!(
            "{FUNCTION_URL}/api/playlist/{}/tracks",
            url_encode(&playlist_id)
        ),
        Some(&json!({ "userName": user, "fromIndex": from_index, "toIndex": to_index })),
    )
    .await
}

#[tauri::command]
pub async fn playlist_join(
    cfg: State<'_, ConfigState>,
    playlist_id: String,
    action: String,
) -> Result<Value, String> {
    let user = display_name(&cfg);
    send_json(
        Method::POST,
        &format!(
            "{FUNCTION_URL}/api/playlist/{}/members",
            url_encode(&playlist_id)
        ),
        Some(&json!({ "userName": user, "action": action })),
    )
    .await
}

#[tauri::command]
pub async fn playlist_upload_image(
    playlist_id: String,
    data: Vec<u8>,
    mime_type: String,
    user_name: String,
) -> Result<Value, String> {
    let url = format!(
        "{FUNCTION_URL}/api/playlist/{}/image?userName={}",
        url_encode(&playlist_id),
        url_encode(&user_name)
    );
    raw_post_bytes(&url, &mime_type, data).await
}
