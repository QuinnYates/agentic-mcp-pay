import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS challenges (
  nonce TEXT PRIMARY KEY, tool_name TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL, protocol TEXT NOT NULL, expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL, protocol TEXT NOT NULL, payer_address TEXT, tx_hash TEXT,
  nonce TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function createDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_V1);
  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | undefined;
  if (!row) db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(1);
  try { chmodSync(dbPath, 0o600); } catch {}
  return db;
}
