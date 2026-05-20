use crate::azure::{get_json, raw_post_bytes, send_json, url_encode, FUNCTION_URL};
use crate::config::ConfigState;
use reqwest::Method;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn users_list(cfg: State<'_, ConfigState>) -> Result<Value, String> {
    let exclude = cfg
        .inner
        .lock()
        .ok()
        .and_then(|g| g.display_name.clone())
        .unwrap_or_default();
    let url = if exclude.is_empty() {
        format!("{FUNCTION_URL}/api/users")
    } else {
        format!("{FUNCTION_URL}/api/users?exclude={}", url_encode(&exclude))
    };
    match get_json(&url).await {
        Ok(v) if v.is_array() => Ok(v),
        _ => Ok(Value::Array(Vec::new())),
    }
}

#[tauri::command]
pub async fn profile_get(user_name: String) -> Result<Value, String> {
    let url = format!("{FUNCTION_URL}/api/profile/{}", url_encode(&user_name));
    get_json(&url).await
}

#[tauri::command]
pub async fn profile_upload_image(
    user_name: String,
    data: Vec<u8>,
    mime_type: String,
) -> Result<Value, String> {
    let url = format!(
        "{FUNCTION_URL}/api/profile/{}/image",
        url_encode(&user_name)
    );
    raw_post_bytes(&url, &mime_type, data).await
}

#[tauri::command]
pub async fn profile_ensure_favourites(cfg: State<'_, ConfigState>) -> Result<Value, String> {
    let user = cfg
        .inner
        .lock()
        .ok()
        .and_then(|g| g.display_name.clone())
        .ok_or_else(|| "No display name set".to_string())?;
    send_json(
        Method::POST,
        &format!(
            "{FUNCTION_URL}/api/profile/{}/favourites",
            url_encode(&user)
        ),
        None,
    )
    .await
}
