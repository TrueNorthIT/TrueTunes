use std::collections::HashMap;

#[tauri::command]
pub fn telemetry_event(_name: String, _properties: Option<HashMap<String, String>>) {
    // No-op: per migration plan, App Insights moves into the renderer.
    // Kept as a command so the bridge surface stays callable during the cutover.
}
