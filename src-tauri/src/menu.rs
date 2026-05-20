use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let reload = MenuItemBuilder::with_id("debug-reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;
    let devtools = MenuItemBuilder::with_id("debug-devtools", "DevTools")
        .accelerator("CmdOrCtrl+Alt+I")
        .build(app)?;
    let debug = SubmenuBuilder::new(app, "Debug")
        .item(&reload)
        .item(&devtools)
        .build()?;

    Menu::with_items(app, &[&edit, &debug])
}

pub fn handle_event<R: Runtime>(app: &AppHandle<R>, event_id: &str) {
    match event_id {
        "debug-reload" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("window.location.reload()");
            }
        }
        "debug-devtools" => {
            #[cfg(debug_assertions)]
            if let Some(win) = app.get_webview_window("main") {
                if win.is_devtools_open() {
                    win.close_devtools();
                } else {
                    win.open_devtools();
                }
            }
        }
        _ => {}
    }
}
