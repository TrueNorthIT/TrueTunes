use crate::sonos::client::{FetchRequest, FetchResponse, SonosClient};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn api_fetch(
    client: State<'_, Arc<SonosClient>>,
    request: FetchRequest,
) -> Result<FetchResponse, String> {
    Ok(client.fetch(request).await)
}
