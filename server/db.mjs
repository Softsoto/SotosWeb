/* ============================================================
   Sotos OS — base de datos (SQLite integrado en Node) y secretos
   © 2026 Sebastian Sotomontes
   ============================================================ */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { fileURLToPath } from "node:url";
export const DATA_DIR = path.resolve(process.env.SOTOS_DATA || fileURLToPath(new URL("./data", import.meta.url)));
export const BLOB_DIR = path.join(DATA_DIR, "blobs");
fs.mkdirSync(BLOB_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "sotos.db"));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  pass TEXT NOT NULL, quota INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL, expires INTEGER NOT NULL, agent TEXT);
CREATE TABLE IF NOT EXISTS fs_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, json TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, perm TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER);
CREATE TABLE IF NOT EXISTS share_users (
  token TEXT NOT NULL REFERENCES shares(token) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY (token, user_id));
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
`);

/* secretos persistentes (firmas de ONLYOFFICE, etc.) */
const SECRETS = path.join(DATA_DIR, "secrets.json");
let secrets = {};
try { secrets = JSON.parse(fs.readFileSync(SECRETS, "utf8")); } catch {}
export function secret(name) {
  if (process.env["SOTOS_" + name.toUpperCase()]) return process.env["SOTOS_" + name.toUpperCase()];
  if (!secrets[name]) { secrets[name] = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(SECRETS, JSON.stringify(secrets, null, 2), { mode: 0o600 }); }
  return secrets[name];
}

export const now = () => Date.now();
export const rid = (n = 16) => crypto.randomBytes(n).toString("hex");
