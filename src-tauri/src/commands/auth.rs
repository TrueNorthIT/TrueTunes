use crate::auth::{storage, validate};
use crate::sonos::SonosState;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

const SONOS_LOGIN_URL: &str = "https://play.sonos.com/en-us/login";
const SONOS_BASE_URL: &str = "https://play.sonos.com";
const SESSION_COOKIE: &str = "__Secure-next-auth.session-token";

#[tauri::command]
pub async fn auth_set_token(
    app: AppHandle,
    state: State<'_, Arc<SonosState>>,
    token: String,
) -> Result<bool, String> {
    if !validate::validate_token(&token).await {
        return Ok(false);
    }
    storage::save(&token).map_err(|e| e.to_string())?;
    state.set_token(Some(token)).await;
    let _ = app.emit("auth:ready", ());
    Ok(true)
}

#[tauri::command]
pub async fn auth_logout(
    app: AppHandle,
    state: State<'_, Arc<SonosState>>,
) -> Result<(), String> {
    storage::clear().map_err(|e| e.to_string())?;
    state.set_token(None).await;
    let _ = app.emit("auth:expired", ());
    Ok(())
}

#[tauri::command]
pub async fn auth_is_logged_in(state: State<'_, Arc<SonosState>>) -> Result<bool, String> {
    Ok(state.token().await.is_some())
}

/// Opens the Sonos login page in a dedicated webview and polls its cookie jar.
/// When `__Secure-next-auth.session-token` appears, validates it, persists to
/// keyring, populates SonosState, emits `auth:ready`, and closes the window.
#[tauri::command]
pub async fn auth_open_login(app: AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(existing) = app.get_webview_window("login") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let url = SONOS_LOGIN_URL
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;
    let win = WebviewWindowBuilder::new(&app, "login", WebviewUrl::External(url))
        .title("Sign in to Sonos")
        .inner_size(520.0, 720.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        poll_for_session_cookie(app_handle, win).await;
    });
    Ok(())
}

async fn poll_for_session_cookie(app: AppHandle, win: tauri::WebviewWindow) {
    // Poll up to ~5 minutes. Tauri's cookies API returns all cookies for the webview;
    // we filter for the HttpOnly session token issued by next-auth on play.sonos.com.
    let base_url = match SONOS_BASE_URL.parse::<url::Url>() {
        Ok(u) => u,
        Err(_) => return,
    };
    for _ in 0..300 {
        if win.is_closable().is_err() {
            return; // window already destroyed
        }
        let cookies = win.cookies_for_url(base_url.clone()).unwrap_or_default();
        if let Some(token) = cookies
            .iter()
            .find(|c| c.name() == SESSION_COOKIE)
            .map(|c| c.value().to_string())
        {
            if validate::validate_token(&token).await {
                let _ = storage::save(&token);
                if let Some(state) = app.try_state::<Arc<SonosState>>() {
                    state.set_token(Some(token)).await;
                }
                let _ = app.emit("auth:ready", ());
                let _ = win.close();
                return;
            }
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

/// Boot-time auth: load the stored token, validate, push into state, emit the right event.
/// When no valid token is present, auto-opens the Sonos login webview so the user
/// can sign in without needing a Sign-in button in the renderer.
pub async fn bootstrap_auth(app: AppHandle, state: Arc<SonosState>) {
    let stored = storage::load();
    let valid = match &stored {
        Some(t) => validate::validate_token(t).await,
        None => false,
    };

    if valid {
        state.set_token(stored).await;
        let _ = app.emit("auth:ready", ());
        return;
    }

    if stored.is_some() {
        let _ = storage::clear();
    }
    let _ = app.emit("auth:expired", ());

    if let Err(e) = auth_open_login(app.clone()).await {
        eprintln!("auth_open_login failed: {e}");
    }
}
