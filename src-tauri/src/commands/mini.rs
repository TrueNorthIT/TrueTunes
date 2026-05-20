use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn mini_open(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("mini") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(&app, "mini", WebviewUrl::default())
        .title("True Tunes — Mini")
        .inner_size(340.0, 116.0)
        .min_inner_size(340.0, 116.0)
        .max_inner_size(340.0, 116.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .initialization_script("window.location.hash = '#/mini';")
        .build()
        .map_err(|e| e.to_string())?;

    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
pub async fn mini_close(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("mini") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
