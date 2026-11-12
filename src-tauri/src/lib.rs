mod geometry;
mod storage;
mod widget;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(widget::Widget::default())
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let connection = rusqlite::Connection::open(directory.join("weatherglass.db"))?;
            connection.execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
            )?;
            storage::migrate(&connection)?;
            app.manage(storage::Database(Mutex::new(connection)));
            if let Some(window) = app.get_webview_window("main") {
                widget::restore(&window)?;
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(30));
                let _ = handle.emit("weather-tick", ());
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::ScaleFactorChanged { .. } = event {
                let _ = window.emit("widget-display-changed", ());
            }
            if let tauri::WindowEvent::Moved(position) = event {
                if let Ok(mut state) = window.state::<widget::Widget>().inner().0.lock() {
                    if !state.busy && !state.expanded {
                        if let Some(bounds) = state.compact.as_mut() {
                            bounds.x = position.x;
                            bounds.y = position.y;
                        }
                    }
                }
            }
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(webview) = window.app_handle().get_webview_window("main") {
                    let _ = widget::persist(&webview);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            storage::read_value,
            storage::write_value,
            storage::clear_data,
            storage::clear_cache,
            widget::widget_transition,
            widget::widget_screens,
            widget::widget_place
        ])
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer WeatherGlass");
}
