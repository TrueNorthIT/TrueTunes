use tauri::{AppHandle, Manager};

/// WS/HTTP monitor windows were Electron dev-only insecure windows.
/// Dropped during the migration — leaving as no-ops so the renderer's bridge
/// surface stays callable without breaking dev menus.
#[tauri::command]
pub async fn debug_open_ws_monitor() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn debug_open_http_monitor() -> Result<(), String> {
    Ok(())
}

/// Toggle DevTools on the main window in debug builds.
#[tauri::command]
pub fn debug_open_dev_tools(app: AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    if let Some(win) = app.get_webview_window("main") {
        if win.is_devtools_open() {
            win.close_devtools();
        } else {
            win.open_devtools();
        }
    }
    let _ = app;
    Ok(())
}
