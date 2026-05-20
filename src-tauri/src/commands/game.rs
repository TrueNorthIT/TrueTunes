use crate::azure::{get_json, http_client, raw_get, url_encode, FUNCTION_URL};
use serde::Deserialize;
use serde_json::{json, Value};

fn date_or_today(date: Option<String>) -> String {
    date.filter(|s| !s.is_empty()).unwrap_or_else(|| "today".to_string())
}

#[tauri::command]
pub async fn game_fetch(date: Option<String>) -> Result<Value, String> {
    let d = date_or_today(date);
    let url = format!("{FUNCTION_URL}/api/game?date={}", url_encode(&d));
    let (status, json) = raw_get(&url).await?;
    if status == 404 || status == 202 {
        return Ok(json!({ "status": "pending" }));
    }
    Ok(json)
}

#[derive(Debug, Deserialize)]
pub struct GameGuesses {
    pub main: Vec<String>,
    pub bonus: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSubmitInput {
    pub game_id: String,
    pub user_name: String,
    pub guesses: GameGuesses,
}

#[tauri::command]
pub async fn game_submit(input: GameSubmitInput) -> Result<Value, String> {
    let body = json!({
        "gameId": input.game_id,
        "userName": input.user_name,
        "guesses": {
            "main": input.guesses.main,
            "bonus": input.guesses.bonus,
        }
    });
    let res = http_client()
        .post(format!("{FUNCTION_URL}/api/score"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    let parsed: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    if status.as_u16() == 409 {
        return Ok(json!({ "duplicate": true, "existing": parsed.get("existing").cloned().unwrap_or(Value::Null) }));
    }
    if !status.is_success() {
        let msg = parsed
            .get("error")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
        return Ok(json!({ "error": msg }));
    }
    Ok(json!({ "ok": true, "score": parsed }))
}

#[tauri::command]
pub async fn game_leaderboard(date: Option<String>) -> Result<Value, String> {
    let d = date_or_today(date);
    let url = format!("{FUNCTION_URL}/api/game-leaderboard?date={}", url_encode(&d));
    get_json(&url).await
}

#[tauri::command]
pub async fn game_dates(user_name: String) -> Result<Value, String> {
    let url = format!("{FUNCTION_URL}/api/game-dates?userName={}", url_encode(&user_name));
    get_json(&url).await
}

#[tauri::command]
pub async fn game_my_score(game_id: String, user_name: String) -> Result<Value, String> {
    let url = format!(
        "{FUNCTION_URL}/api/my-score?gameId={}&userName={}",
        url_encode(&game_id),
        url_encode(&user_name)
    );
    get_json(&url).await
}

#[tauri::command]
pub async fn game_stats(date: Option<String>) -> Result<Value, String> {
    let d = date_or_today(date);
    let url = format!("{FUNCTION_URL}/api/game-stats?date={}", url_encode(&d));
    get_json(&url).await
}
