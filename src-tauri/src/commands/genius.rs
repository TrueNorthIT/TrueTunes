use crate::azure::{http_client, url_encode};
use serde_json::{json, Value};

const SEARCH_URL: &str = "https://api.genius.com/search";

fn token() -> Option<String> {
    std::env::var("GENIUS_ACCESS_TOKEN").ok().filter(|s| !s.is_empty())
}

async fn search(query: &str, token: &str) -> Result<Vec<Value>, String> {
    let url = format!("{SEARCH_URL}?q={}", url_encode(query));
    let res = http_client()
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Genius HTTP {}", res.status().as_u16()));
    }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(body
        .pointer("/response/hits")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default())
}

#[tauri::command]
pub async fn genius_description(
    track_name: String,
    artist_name: String,
) -> Result<Value, String> {
    let Some(key) = token() else {
        return Ok(Value::Null);
    };
    let q = format!("{track_name} {artist_name}");
    let hits = match search(&q, &key).await {
        Ok(h) => h,
        Err(_) => return Ok(Value::Null),
    };
    let Some(song_id) = hits
        .first()
        .and_then(|h| h.pointer("/result/id"))
        .and_then(|v| v.as_i64())
    else {
        return Ok(Value::Null);
    };

    let url = format!("https://api.genius.com/songs/{song_id}");
    let res = http_client()
        .get(&url)
        .header("Authorization", format!("Bearer {key}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(Value::Null);
    }
    let body: Value = res.json().await.unwrap_or(Value::Null);
    Ok(body
        .pointer("/response/song/description/dom")
        .cloned()
        .unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn genius_artist(
    artist_name: String,
    track_hint: Option<String>,
) -> Result<Value, String> {
    let Some(key) = token() else {
        return Ok(Value::Null);
    };
    let q = match &track_hint {
        Some(h) if !h.is_empty() => format!("{h} {artist_name}"),
        _ => artist_name.clone(),
    };
    let hits = match search(&q, &key).await {
        Ok(h) => h,
        Err(_) => return Ok(Value::Null),
    };

    let lower = artist_name.to_lowercase();
    let hit = hits
        .iter()
        .find(|h| {
            h.pointer("/result/primary_artist/name")
                .and_then(|v| v.as_str())
                .map(|n| n.to_lowercase().contains(&lower))
                .unwrap_or(false)
        })
        .or_else(|| hits.first());
    let Some(artist_id) = hit
        .and_then(|h| h.pointer("/result/primary_artist/id"))
        .and_then(|v| v.as_i64())
    else {
        return Ok(Value::Null);
    };

    let url = format!("https://api.genius.com/artists/{artist_id}");
    let res = http_client()
        .get(&url)
        .header("Authorization", format!("Bearer {key}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok(Value::Null);
    }
    let body: Value = res.json().await.unwrap_or(Value::Null);
    let Some(a) = body.pointer("/response/artist") else {
        return Ok(Value::Null);
    };
    Ok(json!({
        "description": a.pointer("/description/dom").cloned().unwrap_or(Value::Null),
        "alternateNames": a.get("alternate_names").cloned().unwrap_or(Value::Array(Vec::new())),
        "imageUrl": a.get("image_url").cloned().unwrap_or(Value::Null),
        "headerImageUrl": a.get("header_image_url").cloned().unwrap_or(Value::Null),
        "instagram": a.get("instagram_name").cloned().unwrap_or(Value::Null),
        "twitter": a.get("twitter_name").cloned().unwrap_or(Value::Null),
    }))
}

#[tauri::command]
pub async fn genius_album_year(
    album_name: String,
    artist_name: String,
) -> Result<Value, String> {
    let Some(key) = token() else {
        return Ok(Value::Null);
    };
    let q = format!("{album_name} {artist_name}");
    let hits = match search(&q, &key).await {
        Ok(h) => h,
        Err(_) => return Ok(Value::Null),
    };

    let lower = artist_name.to_lowercase();
    let hit = hits
        .iter()
        .find(|h| {
            h.pointer("/result/primary_artist/name")
                .and_then(|v| v.as_str())
                .map(|n| n.to_lowercase().contains(&lower))
                .unwrap_or(false)
        })
        .or_else(|| hits.first());
    Ok(hit
        .and_then(|h| h.pointer("/result/release_date_components/year"))
        .cloned()
        .unwrap_or(Value::Null))
}
