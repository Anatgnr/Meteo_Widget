use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;

pub struct Database(pub Mutex<Connection>);

pub fn migrate(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(include_str!("../migrations/001_initial.sql"))
}

#[tauri::command]
pub fn read_value(
    key: String,
    state: tauri::State<'_, Database>,
) -> Result<Option<String>, String> {
    if key.len() > 300 {
        return Err("Clé invalide".into());
    }
    let db = state
        .inner()
        .0
        .lock()
        .map_err(|_| "Stockage indisponible")?;
    db.query_row(
        "SELECT value_json FROM settings WHERE key = ?1",
        [&key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn save(db: &mut Connection, key: &str, value_json: &str) -> Result<(), String> {
    if key.len() > 300 || value_json.len() > 2_000_000 {
        return Err("Données trop volumineuses".into());
    }
    let value: serde_json::Value = serde_json::from_str(value_json).map_err(|_| "JSON invalide")?;
    let tx = db.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO settings(key, value_json, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at", params![key, value_json]).map_err(|e| e.to_string())?;
    if key.starts_with("weather:") {
        if let (Some(city), Some(retrieved)) =
            (value["cityId"].as_str(), value["retrievedAt"].as_str())
        {
            if let Some(points) = value["originalForecasts"]
                .as_array()
                .or_else(|| value["hourly"].as_array())
            {
                let mut statement = tx.prepare_cached("INSERT OR IGNORE INTO forecasts(city_id, model_id, retrieved_at, issued_at, valid_at, payload_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").map_err(|e| e.to_string())?;
                for point in points {
                    statement
                        .execute(params![
                            city,
                            point["modelId"].as_str().unwrap_or("unknown"),
                            point["retrievedAt"].as_str().unwrap_or(retrieved),
                            point["issuedAt"].as_str(),
                            point["validAt"].as_str(),
                            point.to_string()
                        ])
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        tx.execute("DELETE FROM settings WHERE key LIKE 'weather:%' AND key NOT IN (SELECT key FROM settings WHERE key LIKE 'weather:%' ORDER BY updated_at DESC LIMIT 24)", []).map_err(|e| e.to_string())?;
    }
    if key == "radar:metadata" {
        let expires = value["at"].as_f64().ok_or("Horodatage radar invalide")? / 1000.0 + 300.0;
        tx.execute("INSERT INTO radar_cache_metadata(key,expires_at,metadata_json) VALUES(?1,datetime(?2,'unixepoch'),?3) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at,metadata_json=excluded.metadata_json", params![key, expires, value_json]).map_err(|e| e.to_string())?;
    }
    if key == "preferences" {
        if let Some(favorites) = value["favorites"].as_array() {
            tx.execute("DELETE FROM cities", [])
                .map_err(|e| e.to_string())?;
            for city in favorites {
                tx.execute(
                    "INSERT INTO cities(id, payload_json) VALUES (?1, ?2)",
                    params![city["id"].as_str(), city.to_string()],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    if let Some(city) = key.strip_prefix("observations:") {
        if let Some(observations) = value.as_array() {
            for observation in observations {
                if observation["kind"].as_str() != Some("observation")
                    || observation["cityId"].as_str() != Some(city)
                {
                    return Err("Observation incompatible".into());
                }
                tx.execute("INSERT INTO observations(city_id,source,valid_at,retrieved_at,payload_json) VALUES(?1,?2,?3,datetime('now'),?4) ON CONFLICT(city_id,source,valid_at) DO UPDATE SET payload_json=excluded.payload_json", params![city, observation["source"].as_str(), observation["validAt"].as_str(), observation.to_string()]).map_err(|e| e.to_string())?;
            }
        }
    }
    if let Some(city) = key.strip_prefix("learning:") {
        if let Some(scores) = value["scores"].as_object() {
            for (key, score) in scores {
                if let Some((model, horizon)) = key.rsplit_once(':') {
                    let horizon: i64 = horizon.parse().map_err(|_| "Horizon invalide")?;
                    let count = score["count"].as_i64().unwrap_or(0);
                    tx.execute("INSERT INTO source_performance(city_id,model_id,horizon_bucket,sample_count,metrics_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(city_id,model_id,horizon_bucket) DO UPDATE SET sample_count=excluded.sample_count,metrics_json=excluded.metrics_json", params![city, model, horizon, count, score.to_string()]).map_err(|e| e.to_string())?;
                    let n = score["temperatureCount"].as_f64().unwrap_or(0.0);
                    let error = score["temperatureError"].as_f64().unwrap_or(0.0);
                    let weight = if n >= 30.0 {
                        (1.0 / (1.0 + error / n / 3.0)).max(0.2)
                    } else {
                        1.0
                    };
                    tx.execute("INSERT INTO fusion_weights(city_id,model_id,horizon_bucket,weight,sample_count) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(city_id,model_id,horizon_bucket) DO UPDATE SET weight=excluded.weight,sample_count=excluded.sample_count", params![city, model, horizon, weight, n as i64]).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    if key.starts_with("weather:") || key == "preferences" {
        let preferences: Option<String> = tx
            .query_row(
                "SELECT value_json FROM settings WHERE key='preferences'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let days = preferences
            .and_then(|p| serde_json::from_str::<serde_json::Value>(&p).ok())
            .and_then(|p| p["settings"]["retentionDays"].as_i64())
            .filter(|d| [7, 30, 90].contains(d))
            .unwrap_or(30);
        let cutoff = format!("-{} days", days);
        tx.execute(
            "DELETE FROM forecasts WHERE julianday(retrieved_at) < julianday('now',?1)",
            [&cutoff],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM observations WHERE julianday(valid_at) < julianday('now',?1)",
            [&cutoff],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_value(
    key: String,
    value_json: String,
    state: tauri::State<'_, Database>,
) -> Result<(), String> {
    let mut db = state
        .inner()
        .0
        .lock()
        .map_err(|_| "Stockage indisponible")?;
    save(&mut db, &key, &value_json)
}

#[tauri::command]
pub fn clear_cache(state: tauri::State<'_, Database>) -> Result<(), String> {
    let db = state
        .inner()
        .0
        .lock()
        .map_err(|_| "Stockage indisponible")?;
    db.execute_batch("BEGIN; DELETE FROM settings WHERE key LIKE 'weather:%' OR key LIKE 'radar:%'; DELETE FROM radar_cache_metadata; COMMIT;")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_data(state: tauri::State<'_, Database>) -> Result<(), String> {
    let db = state
        .inner()
        .0
        .lock()
        .map_err(|_| "Stockage indisponible")?;
    db.execute_batch("BEGIN; DELETE FROM settings; DELETE FROM cities; DELETE FROM forecasts; DELETE FROM observations; DELETE FROM rain_events; DELETE FROM source_performance; DELETE FROM fusion_weights; DELETE FROM radar_cache_metadata; COMMIT; VACUUM;")
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migrations_are_idempotent_and_values_are_parameterized() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap();
        migrate(&db).unwrap();
        save(&mut db, "quote'key", r#"{"label":"Bordeaux"}"#).unwrap();
        let count: i64 = db
            .query_row("SELECT count(*) FROM settings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert!(save(&mut db, "invalid", "undefined").is_err());
    }
    #[test]
    fn independent_observations_and_scores_survive_migration() {
        let mut db = Connection::open_in_memory().unwrap();
        migrate(&db).unwrap();
        let observation = serde_json::json!([{"cityId":"bordeaux","source":"station-test","kind":"observation","validAt":"2026-11-12T10:00:00Z","temperatureC":12,"precipitationMm":0.1,"intervalMinutes":60}]);
        save(&mut db, "observations:bordeaux", &observation.to_string()).unwrap();
        let learning = serde_json::json!({"scores":{"model-a:0":{"count":30,"temperatureCount":30,"temperatureError":90,"rainCount":30,"rainError":3}},"forecasts":[],"evaluated":[]});
        save(&mut db, "learning:bordeaux", &learning.to_string()).unwrap();
        let count: i64 = db
            .query_row("SELECT count(*) FROM observations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let weight: f64 = db
            .query_row(
                "SELECT weight FROM fusion_weights WHERE model_id='model-a' AND horizon_bucket=0",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!((weight - 0.5).abs() < 1e-9);
        let samples: i64 = db
            .query_row("SELECT sample_count FROM source_performance", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(samples, 30);
        migrate(&db).unwrap();
        assert_eq!(
            db.query_row("SELECT count(*) FROM observations", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
