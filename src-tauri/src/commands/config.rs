use crate::config::ConfigState;
use tauri::State;

#[tauri::command]
pub fn config_get_display_name(state: State<'_, ConfigState>) -> Option<String> {
    state.inner.lock().ok()?.display_name.clone()
}

#[tauri::command]
pub fn config_set_display_name(state: State<'_, ConfigState>, name: String) {
    if let Ok(mut guard) = state.inner.lock() {
        guard.display_name = Some(name);
    }
    state.save();
}

#[tauri::command]
pub fn config_get_queue_docked_width(state: State<'_, ConfigState>) -> u32 {
    state
        .inner
        .lock()
        .ok()
        .and_then(|g| g.queue_docked_width)
        .unwrap_or(380)
}

#[tauri::command]
pub fn config_set_queue_docked_width(state: State<'_, ConfigState>, width: u32) {
    if let Ok(mut guard) = state.inner.lock() {
        guard.queue_docked_width = Some(width);
    }
    state.save();
}
