import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('applique la migration SQLite deux fois et conserve les métadonnées temporelles', () => {
  const db = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../src-tauri/migrations/001_initial.sql', import.meta.url), 'utf8');
  db.exec(migration); db.exec(migration);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
  expect(tables).toContain('source_performance'); expect(tables).toContain('forecasts');
  db.prepare('INSERT INTO settings(key, value_json) VALUES (?, ?)').run("city'quote", JSON.stringify({ name: 'Bordeaux' }));
  expect(db.prepare('SELECT value_json FROM settings WHERE key = ?').get("city'quote")?.value_json).toBe('{"name":"Bordeaux"}');
  const fields = db.prepare('PRAGMA table_info(forecasts)').all().map(row => row.name);
  expect(fields).toEqual(expect.arrayContaining(['issued_at', 'retrieved_at', 'valid_at']));
  expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(1);
  db.close();
});
