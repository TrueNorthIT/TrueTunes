use crate::sonos::operations::{BASE_URL, SPOOF_UA};
use serde_json::Value;

/// Fetch /api/mfe and deep-search for the websocket ticket UUID (any key containing "ticket").
pub async fn fetch_ticket(token: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(format!("{BASE_URL}/api/mfe"))
        .header(
            reqwest::header::COOKIE,
            format!("__Secure-next-auth.session-token={token}"),
        )
        .header(reqwest::header::USER_AGENT, SPOOF_UA)
        .header(reqwest::header::ACCEPT, "*/*")
        .header(
            reqwest::header::REFERER,
            format!("{BASE_URL}/en-us/web-app"),
        )
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("MFE fetch {}", res.status().as_u16()));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    find_ticket(&json, 0).ok_or_else(|| "No ticket found in MFE response".to_string())
}

fn is_uuid(s: &str) -> bool {
    // 8-4-4-4-12 hex
    let bytes = s.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (i, b) in bytes.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if *b != b'-' {
                    return false;
                }
            }
            _ => {
                if !b.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

fn find_ticket(v: &Value, depth: usize) -> Option<String> {
    if depth > 10 {
        return None;
    }
    match v {
        Value::Array(arr) => {
            for item in arr {
                if let Some(t) = find_ticket(item, depth + 1) {
                    return Some(t);
                }
            }
            None
        }
        Value::Object(map) => {
            for (k, val) in map {
                if k.to_lowercase().contains("ticket") {
                    if let Value::String(s) = val {
                        if is_uuid(s) {
                            return Some(s.clone());
                        }
                    }
                }
            }
            for val in map.values() {
                if let Some(t) = find_ticket(val, depth + 1) {
                    return Some(t);
                }
            }
            None
        }
        _ => None,
    }
}
