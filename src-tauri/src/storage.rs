use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;

pub struct Database(pub Mutex<Connection>);

pub fn migrate(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(include_str!("../migrations/001_initial.sql"))
}

#[tauri::command]
pub fn read_value(key: String, state: tauri::State<'_, Database>) -> Result<Option<String>, String> {
    if key.len() > 300 { return Err("Clé invalide".into()); }
    let db = state.inner().0.lock().map_err(|_| "Stockage indisponible")?;
    db.query_row("SELECT value_json FROM settings WHERE key = ?1", [&key], |row| row.get(0))
        .optional().map_err(|e| e.to_string())
}

fn save(db: &mut Connection, key: &str, value_json: &str) -> Result<(), String> {
    if key.len() > 300 || value_json.len() > 2_000_000 { return Err("Données trop volumineuses".into()); }
    let value: serde_json::Value = serde_json::from_str(value_json).map_err(|_| "JSON invalide")?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO settings(key, value_json, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at", params![key, value_json]).map_err(|e| e.to_string())?;
    if key.starts_with("weather:") {
        if let (Some(city), Some(retrieved)) = (value["cityId"].as_str(), value["retrievedAt"].as_str()) {
            if let Some(points) = value["originalForecasts"].as_array().or_else(|| value["hourly"].as_array()) {
                let mut statement = tx.prepare_cached("INSERT OR IGNORE INTO forecasts(city_id, model_id, retrieved_at, issued_at, valid_at, payload_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").map_err(|e| e.to_string())?;
                for point in points {
                    statement.execute(params![city, point["modelId"].as_str().unwrap_or("unknown"), point["retrievedAt"].as_str().unwrap_or(retrieved), point["issuedAt"].as_str(), point["validAt"].as_str(), point.to_string()]).map_err(|e| e.to_string())?;
                }
            }
        }
        tx.execute("DELETE FROM forecasts WHERE julianday(retrieved_at) < julianday('now', '-30 days')", []).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM settings WHERE key LIKE 'weather:%' AND key NOT IN (SELECT key FROM settings WHERE key LIKE 'weather:%' ORDER BY updated_at DESC LIMIT 24)", []).map_err(|e| e.to_string())?;
    }
    if key == "preferences" {
        if let Some(favorites) = value["favorites"].as_array() {
            tx.execute("DELETE FROM cities", []).map_err(|e| e.to_string())?;
            for city in favorites {
                tx.execute("INSERT INTO cities(id, payload_json) VALUES (?1, ?2)", params![city["id"].as_str(), city.to_string()]).map_err(|e| e.to_string())?;
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_value(key: String, value_json: String, state: tauri::State<'_, Database>) -> Result<(), String> {
    let mut db = state.inner().0.lock().map_err(|_| "Stockage indisponible")?;
    save(&mut db, &key, &value_json)
}

#[tauri::command]
pub fn clear_data(state: tauri::State<'_, Database>) -> Result<(), String> {
    let db = state.inner().0.lock().map_err(|_| "Stockage indisponible")?;
    db.execute_batch("BEGIN; DELETE FROM settings; DELETE FROM cities; DELETE FROM forecasts; DELETE FROM observations; DELETE FROM rain_events; DELETE FROM source_performance; DELETE FROM fusion_weights; DELETE FROM radar_cache_metadata; COMMIT; VACUUM;")
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migrations_are_idempotent_and_values_are_parameterized() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap(); migrate(&db).unwrap();
        save(&mut db, "quote'key", r#"{"label":"Bordeaux"}"#).unwrap();
        let count: i64 = db.query_row("SELECT count(*) FROM settings", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        assert!(save(&mut db, "invalid", "undefined").is_err());
    }
}
