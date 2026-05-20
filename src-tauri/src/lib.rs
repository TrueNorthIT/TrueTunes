mod auth;
mod azure;
mod commands;
mod config;
mod menu;
mod pubsub;
mod sonos;
mod ws;

use commands::{
    api as api_cmd, app as app_cmd, auth as auth_cmd, config as cfg_cmd, debug as dbg_cmd,
    game as game_cmd, genius as gen_cmd, group as grp_cmd, image as img_cmd, mini as mini_cmd,
    playback as pb_cmd, playlist as pl_cmd, profile as prof_cmd, queue as q_cmd,
    stats as stats_cmd, telemetry as tel_cmd, update as upd_cmd, window as win_cmd,
};
use config::ConfigState;
use pubsub::PubSubClient;
use sonos::{SonosClient, SonosState};
use std::sync::Arc;
use tauri::{Emitter, Manager, WindowEvent};
use ws::WsClient;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let cfg = ConfigState::load(app.handle());
            app.manage(cfg);

            let sonos_state = Arc::new(SonosState::new());
            let client = Arc::new(SonosClient::new(sonos_state.clone()));
            let ws_client = Arc::new(WsClient::new(sonos_state.clone()));
            app.manage(sonos_state.clone());
            app.manage(client);
            app.manage(ws_client.clone());

            // Application menu (Edit + Debug submenu)
            if let Ok(m) = menu::build(app.handle()) {
                let _ = app.set_menu(m);
            }
            app.on_menu_event(|app, event| {
                menu::handle_event(app, event.id.as_ref());
            });

            // Forward main-window maximize/unmaximize to renderer
            if let Some(win) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::Resized(_) = event {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let is_max = w.is_maximized().unwrap_or(false);
                            let _ = app_handle.emit("win:maximized", is_max);
                        }
                    }
                });
            }

            // Auth bootstrap
            let auth_handle = app.handle().clone();
            let auth_state = sonos_state.clone();
            tauri::async_runtime::spawn(async move {
                auth_cmd::bootstrap_auth(auth_handle, auth_state).await;
            });

            // WS supervisor
            ws_client.spawn(app.handle().clone());

            // Web PubSub supervisor (waits for displayName, then connects + reconnects)
            let pubsub_client = Arc::new(PubSubClient::new());
            app.manage(pubsub_client.clone());
            pubsub_client.spawn(app.handle().clone());

            // Auto-updater poll (15-min loop, debug builds skip)
            #[cfg(not(debug_assertions))]
            {
                use std::time::Duration;
                use tauri_plugin_updater::UpdaterExt;
                let upd_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    loop {
                        if let Ok(updater) = upd_handle.updater() {
                            if let Ok(Some(update)) = updater.check().await {
                                let version = update.version.clone();
                                let app_for_dl = upd_handle.clone();
                                let _ = update
                                    .download_and_install(|_, _| {}, move || {
                                        let _ = app_for_dl.emit("update:downloaded", &version);
                                    })
                                    .await;
                                break;
                            }
                        }
                        tokio::time::sleep(Duration::from_secs(15 * 60)).await;
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_cmd::app_version,
            app_cmd::app_is_new_version,
            app_cmd::app_open_external,
            win_cmd::win_minimize,
            win_cmd::win_maximize,
            win_cmd::win_close,
            win_cmd::win_is_maximized,
            cfg_cmd::config_get_display_name,
            cfg_cmd::config_set_display_name,
            cfg_cmd::config_get_queue_docked_width,
            cfg_cmd::config_set_queue_docked_width,
            tel_cmd::telemetry_event,
            api_cmd::api_fetch,
            auth_cmd::auth_set_token,
            auth_cmd::auth_logout,
            auth_cmd::auth_is_logged_in,
            auth_cmd::auth_open_login,
            pb_cmd::playback_play,
            pb_cmd::playback_pause,
            pb_cmd::playback_skip_next,
            pb_cmd::playback_skip_prev,
            pb_cmd::playback_skip_to_track,
            pb_cmd::playback_seek,
            pb_cmd::playback_set_play_modes,
            pb_cmd::playback_load_content,
            pb_cmd::playback_refresh,
            pb_cmd::playback_state,
            grp_cmd::group_get_active,
            grp_cmd::group_set,
            grp_cmd::volume_group_set,
            grp_cmd::ws_resync,
            grp_cmd::queue_set_id,
            q_cmd::queue_reorder,
            q_cmd::queue_remove,
            q_cmd::queue_clear,
            pl_cmd::playlist_list,
            pl_cmd::playlist_get,
            pl_cmd::playlist_create,
            pl_cmd::playlist_update,
            pl_cmd::playlist_delete,
            pl_cmd::playlist_add_track,
            pl_cmd::playlist_remove_track,
            pl_cmd::playlist_reorder_tracks,
            pl_cmd::playlist_join,
            pl_cmd::playlist_upload_image,
            prof_cmd::users_list,
            prof_cmd::profile_get,
            prof_cmd::profile_upload_image,
            prof_cmd::profile_ensure_favourites,
            game_cmd::game_fetch,
            game_cmd::game_submit,
            game_cmd::game_leaderboard,
            game_cmd::game_dates,
            game_cmd::game_my_score,
            game_cmd::game_stats,
            stats_cmd::stats_fetch,
            stats_cmd::history_recent,
            stats_cmd::attribution_refresh,
            stats_cmd::pubsub_publish_queued,
            gen_cmd::genius_description,
            gen_cmd::genius_artist,
            gen_cmd::genius_album_year,
            img_cmd::image_fetch,
            mini_cmd::mini_open,
            mini_cmd::mini_close,
            dbg_cmd::debug_open_ws_monitor,
            dbg_cmd::debug_open_http_monitor,
            dbg_cmd::debug_open_dev_tools,
            upd_cmd::update_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
