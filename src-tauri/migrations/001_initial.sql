CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY, payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS weather_sources (
  id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL
);
INSERT OR IGNORE INTO weather_sources VALUES
  ('open-meteo', 1, '{"auth":"none","license":"CC-BY-4.0; API gratuite non commerciale"}'),
  ('rainviewer', 1, '{"auth":"none","product":"past-radar-only","maxZoom":7}'),
  ('meteofrance-direct', 0, '{"status":"requires-access-validation"}');
CREATE TABLE IF NOT EXISTS forecasts (
  id INTEGER PRIMARY KEY,
  city_id TEXT NOT NULL, model_id TEXT NOT NULL,
  retrieved_at TEXT NOT NULL, issued_at TEXT, valid_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(city_id, model_id, retrieved_at, valid_at)
);
CREATE INDEX IF NOT EXISTS forecasts_validity ON forecasts(city_id, valid_at);
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY, city_id TEXT NOT NULL, source TEXT NOT NULL,
  valid_at TEXT NOT NULL, retrieved_at TEXT NOT NULL, payload_json TEXT NOT NULL,
  UNIQUE(city_id, source, valid_at)
);
CREATE TABLE IF NOT EXISTS rain_events (
  id INTEGER PRIMARY KEY, city_id TEXT NOT NULL, kind TEXT NOT NULL,
  from_utc TEXT NOT NULL, to_utc TEXT NOT NULL, confidence REAL
);
CREATE TABLE IF NOT EXISTS source_performance (
  city_id TEXT NOT NULL, model_id TEXT NOT NULL, horizon_bucket INTEGER NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0, metrics_json TEXT NOT NULL,
  PRIMARY KEY(city_id, model_id, horizon_bucket)
);
CREATE TABLE IF NOT EXISTS fusion_weights (
  city_id TEXT NOT NULL, model_id TEXT NOT NULL, horizon_bucket INTEGER NOT NULL,
  weight REAL NOT NULL CHECK(weight >= 0), sample_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(city_id, model_id, horizon_bucket)
);
CREATE TABLE IF NOT EXISTS radar_cache_metadata (
  key TEXT PRIMARY KEY, expires_at TEXT NOT NULL, metadata_json TEXT NOT NULL
);
PRAGMA user_version = 1;
