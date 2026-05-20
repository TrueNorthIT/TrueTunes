use crate::sonos::operations::{BASE_URL, SPOOF_UA};
use serde_json::Value;

/// Pair of (serviceId, accountId) parsed out of a Sonos integrations-registrations item.
/// Sonos returns hyphenated keys (`service-id`, `account-id`); some legacy items use camelCase.
pub fn parse_creds(data: &Value) -> Vec<(String, String)> {
    let items: Vec<&Value> = match data {
        Value::Array(arr) => arr.iter().collect(),
        Value::Object(_) => vec![data],
        _ => Vec::new(),
    };
    let mut out = Vec::new();
    for item in items {
        let obj = match item.as_object() {
            Some(o) => o,
            None => continue,
        };
        let sid = obj
            .get("service-id")
            .or_else(|| obj.get("serviceId"))
            .and_then(value_as_string);
        let aid = obj
            .get("account-id")
            .or_else(|| obj.get("accountId"))
            .and_then(value_as_string);
        if let (Some(s), Some(a)) = (sid, aid) {
            out.push((s, a));
        }
    }
    out
}

fn value_as_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Hit `/api/content/v1/households/:householdId/integrations/registrations` and return the
/// first `(serviceId, accountId)` Sonos lists for this user. The primary content service is
/// always the first entry — it owns the queue, favourites, and history.
pub async fn discover_primary(token: &str, household_id: &str) -> Result<(String, String), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "{BASE_URL}/api/content/v1/households/{household_id}/integrations/registrations"
    );
    let res = client
        .get(url)
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
        return Err(format!("integrations/registrations {}", res.status().as_u16()));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    parse_creds(&json)
        .into_iter()
        .next()
        .ok_or_else(|| "no service credentials returned".to_string())
}
