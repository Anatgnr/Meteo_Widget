mod storage;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let connection = rusqlite::Connection::open(directory.join("weatherglass.db"))?;
            connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")?;
            storage::migrate(&connection)?;
            app.manage(storage::Database(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![storage::read_value, storage::write_value, storage::clear_data])
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer WeatherGlass");
}
