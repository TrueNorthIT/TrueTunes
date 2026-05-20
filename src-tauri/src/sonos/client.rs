use super::operations::{
    registry, Operation, BASE_URL, PLATFORM_ACCOUNT_ID, PLATFORM_SERVICE_ID,
    SEARCH_ACCOUNT_ID, SEARCH_SERVICE_ID, SPOOF_UA,
};
use super::state::SonosState;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    pub operation_id: String,
    #[serde(default)]
    pub path_params: HashMap<String, String>,
    #[serde(default)]
    pub query: HashMap<String, Option<String>>,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct FetchResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
}

impl FetchResponse {
    fn err(msg: impl Into<String>) -> Self {
        Self {
            error: Some(msg.into()),
            ..Default::default()
        }
    }
}

pub struct SonosClient {
    http: reqwest::Client,
    state: Arc<SonosState>,
}

impl SonosClient {
    pub fn new(state: Arc<SonosState>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .expect("reqwest client");
        Self { http, state }
    }

    fn build_url(
        &self,
        op_path: &str,
        path_params: &HashMap<String, String>,
        query: &HashMap<String, Option<String>>,
        ids: &super::state::SonosRuntimeIds,
    ) -> Result<String, String> {
        let mut defaults: HashMap<String, String> = HashMap::new();
        if let Some(v) = &ids.household_id {
            defaults.insert("householdId".into(), v.clone());
        }
        if let Some(v) = &ids.service_id {
            defaults.insert("serviceId".into(), v.clone());
        }
        if let Some(v) = &ids.account_id {
            defaults.insert("accountId".into(), v.clone());
        }
        if let Some(v) = &ids.group_id {
            defaults.insert("groupId".into(), v.clone());
        }
        if let Some(v) = &ids.queue_id {
            defaults.insert("queueId".into(), v.clone());
        }
        defaults.insert("searchServiceId".into(), SEARCH_SERVICE_ID.into());
        defaults.insert("searchAccountId".into(), SEARCH_ACCOUNT_ID.into());
        defaults.insert("platformServiceId".into(), PLATFORM_SERVICE_ID.into());
        defaults.insert("platformAccountId".into(), PLATFORM_ACCOUNT_ID.into());
        for (k, v) in path_params {
            defaults.insert(k.clone(), v.clone());
        }

        let mut out = String::with_capacity(op_path.len());
        let bytes = op_path.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b':' {
                let start = i + 1;
                let mut end = start;
                while end < bytes.len() && (bytes[end].is_ascii_alphabetic() || bytes[end] == b'_') {
                    end += 1;
                }
                let key = &op_path[start..end];
                let val = defaults
                    .get(key)
                    .ok_or_else(|| format!("Missing path param: {key}"))?;
                out.push_str(&utf8_percent_encode(val, NON_ALPHANUMERIC).to_string());
                i = end;
            } else {
                out.push(bytes[i] as char);
                i += 1;
            }
        }

        let qs: Vec<String> = query
            .iter()
            .filter_map(|(k, v)| {
                v.as_ref().map(|val| {
                    format!(
                        "{}={}",
                        utf8_percent_encode(k, NON_ALPHANUMERIC),
                        utf8_percent_encode(val, NON_ALPHANUMERIC)
                    )
                })
            })
            .collect();

        let url = if qs.is_empty() {
            format!("{BASE_URL}{out}")
        } else {
            format!("{BASE_URL}{out}?{}", qs.join("&"))
        };
        Ok(url)
    }

    pub async fn fetch(&self, request: FetchRequest) -> FetchResponse {
        let token = match self.state.token().await {
            Some(t) => t,
            None => return FetchResponse::err("No session token — please log in first"),
        };

        let ops = registry();
        let op: &Operation = match ops.get(request.operation_id.as_str()) {
            Some(o) => o,
            None => return FetchResponse::err(format!("Unknown operation: {}", request.operation_id)),
        };

        let ids = self.state.ids.read().await.clone();
        let url = match self.build_url(op.path, &request.path_params, &request.query, &ids) {
            Ok(u) => u,
            Err(e) => return FetchResponse::err(e),
        };

        let mut headers = HeaderMap::new();
        headers.insert(
            reqwest::header::COOKIE,
            HeaderValue::from_str(&format!("__Secure-next-auth.session-token={token}"))
                .unwrap_or_else(|_| HeaderValue::from_static("")),
        );
        headers.insert(HeaderName::from_static("x-sonos-timezone"), HeaderValue::from_static("+01:00"));
        headers.insert(HeaderName::from_static("x-sonos-debug"), HeaderValue::from_static("use-section-text=true"));
        headers.insert(reqwest::header::ACCEPT, HeaderValue::from_static("*/*"));
        headers.insert(reqwest::header::REFERER, HeaderValue::from_str(&format!("{BASE_URL}/en-us/web-app")).unwrap());
        headers.insert(reqwest::header::USER_AGENT, HeaderValue::from_static(SPOOF_UA));
        if request.body.is_some() {
            headers.insert(reqwest::header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
        }
        for (k, v) in &request.headers {
            if let (Ok(name), Ok(value)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v)) {
                headers.insert(name, value);
            }
        }

        let is_idempotent = op.method.is_idempotent();
        let retry_delays = [250u64, 750];

        let mut last_err: Option<String> = None;
        for attempt in 0..=if is_idempotent { 2 } else { 0 } {
            let mut req = self.http.request(op.method.as_reqwest(), &url).headers(headers.clone());
            if let Some(body) = &request.body {
                req = req.json(body);
            }
            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    let etag = resp
                        .headers()
                        .get(reqwest::header::ETAG)
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    let text = resp.text().await.unwrap_or_default();

                    if status.is_success() {
                        let data: serde_json::Value = serde_json::from_str(&text)
                            .unwrap_or(serde_json::Value::Null);
                        return FetchResponse {
                            data: Some(data),
                            error: None,
                            etag,
                        };
                    }

                    let is_transient = matches!(status.as_u16(), 500 | 502 | 503 | 504);
                    if is_idempotent && is_transient && attempt < 2 {
                        tokio::time::sleep(Duration::from_millis(retry_delays[attempt])).await;
                        continue;
                    }
                    return FetchResponse::err(format!("HTTP {} — {}", status.as_u16(), text));
                }
                Err(err) => {
                    last_err = Some(format!("Fetch failed: {err}"));
                    if is_idempotent && attempt < 2 {
                        tokio::time::sleep(Duration::from_millis(retry_delays[attempt])).await;
                        continue;
                    }
                    return FetchResponse::err(last_err.unwrap());
                }
            }
        }

        FetchResponse::err(last_err.unwrap_or_else(|| "Unknown error".into()))
    }
}
