use crate::sonos::operations::{BASE_URL, SPOOF_UA};

/// Verify a Sonos session token by hitting `/api/mfe` and checking the response is 2xx.
pub async fn validate_token(token: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

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
        .await;

    match res {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}
