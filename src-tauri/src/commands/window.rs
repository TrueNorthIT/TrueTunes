use tauri::{Manager, Runtime, WebviewWindow};

fn main_window<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window("main")
}

#[tauri::command]
pub fn win_minimize<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(w) = main_window(&app) {
        w.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn win_maximize<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(w) = main_window(&app) {
        let max = w.is_maximized().unwrap_or(false);
        if max {
            w.unmaximize().map_err(|e| e.to_string())?;
        } else {
            w.maximize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn win_close<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(w) = main_window(&app) {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn win_is_maximized<R: Runtime>(app: tauri::AppHandle<R>) -> bool {
    main_window(&app)
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}
