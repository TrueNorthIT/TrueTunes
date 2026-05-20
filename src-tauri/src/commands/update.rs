use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Install a previously-downloaded update and quit. Mirrors electron-updater's
/// `quitAndInstall(true, true)`. Safe to call even when no update is pending —
/// returns an error string instead of panicking.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => {
            let _bytes = update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(|e| e.to_string())?;
            app.restart();
        }
        Ok(None) => Err("No update available".into()),
        Err(e) => Err(e.to_string()),
    }
}
