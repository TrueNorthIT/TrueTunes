use crate::sonos::operations::SPOOF_UA;
use crate::sonos::SonosState;
use base64::Engine;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

#[tauri::command]
pub async fn image_fetch(state: State<'_, Arc<SonosState>>, url: String) -> Result<Value, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Ok(json!({ "error": "Invalid URL" }));
    }

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => return Ok(json!({ "error": e.to_string() })),
    };

    let mut req = client
        .get(&url)
        .header(reqwest::header::USER_AGENT, SPOOF_UA);

    if let Some(token) = state.token().await {
        req = req.header(
            reqwest::header::COOKIE,
            format!("__Secure-next-auth.session-token={token}"),
        );
    }

    let res = match req.send().await {
        Ok(r) => r,
        Err(e) => return Ok(json!({ "error": e.to_string() })),
    };
    let status = res.status();
    if !status.is_success() {
        return Ok(json!({ "error": format!("{} {}", status.as_u16(), status.canonical_reason().unwrap_or("")) }));
    }
    let mime = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or(s).to_string())
        .unwrap_or_else(|| "image/jpeg".to_string());
    let bytes = match res.bytes().await {
        Ok(b) => b,
        Err(e) => return Ok(json!({ "error": e.to_string() })),
    };
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(json!({ "data": encoded, "mimeType": mime }))
}
