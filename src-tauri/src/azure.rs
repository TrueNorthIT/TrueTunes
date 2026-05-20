use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::Client;
use serde_json::Value;
use std::time::Duration;

pub const FUNCTION_URL: &str = "https://truetunes-fn.azurewebsites.net";

pub fn url_encode(s: &str) -> String {
    utf8_percent_encode(s, NON_ALPHANUMERIC).to_string()
}

pub fn http_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .expect("reqwest client")
}

pub async fn get_json(url: &str) -> Result<Value, String> {
    let res = http_client().get(url).send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() && status.as_u16() != 404 && status.as_u16() != 202 {
        return Err(format!("HTTP {} — {}", status.as_u16(), text));
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}

pub async fn raw_get(url: &str) -> Result<(u16, Value), String> {
    let res = http_client().get(url).send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let text = res.text().await.unwrap_or_default();
    let json = serde_json::from_str(&text).unwrap_or(Value::Null);
    Ok((status, json))
}

pub async fn send_json(
    method: reqwest::Method,
    url: &str,
    body: Option<&Value>,
) -> Result<Value, String> {
    let mut req = http_client().request(method, url);
    if let Some(b) = body {
        req = req
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(serde_json::to_vec(b).unwrap_or_default());
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    let parsed: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    if !status.is_success() {
        let msg = parsed
            .get("error")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
        return Err(msg);
    }
    Ok(parsed)
}

pub async fn raw_post_bytes(
    url: &str,
    content_type: &str,
    body: Vec<u8>,
) -> Result<Value, String> {
    let res = http_client()
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, content_type)
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let text = res.text().await.unwrap_or_default();
    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}
