// Vixan — capa de datos (SQLite nativo de Node, sin dependencias externas)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.VIXAN_DB || path.join(__dirname, '..', 'data', 'vixan.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'estandar',
  activo INTEGER DEFAULT 1,
  webhook_key TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER REFERENCES tenants(id),
  email TEXT UNIQUE NOT NULL,
  nombre TEXT,
  rol TEXT DEFAULT 'operador',          -- superadmin | admin | operador
  pass_hash TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tenant_id INTEGER,
  expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_records_te ON records(tenant_id, entity);
CREATE INDEX IF NOT EXISTS idx_records_ext ON records(tenant_id, entity, json_extract(data, '$.external_id'));
CREATE TABLE IF NOT EXISTS settings (
  tenant_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (tenant_id, key)
);
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  nombre TEXT,
  key_hash TEXT NOT NULL,
  prefijo TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  user_id INTEGER,
  tipo TEXT,
  detalle TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Alcance de las claves de API: "completa" (toda la API del cliente) o "tienda" (solo leer el catálogo para Vixan Tienda)
if (!db.prepare('PRAGMA table_info(api_keys)').all().some((c) => c.name === 'alcance')) {
  db.exec("ALTER TABLE api_keys ADD COLUMN alcance TEXT DEFAULT 'completa'");
}

// ── Contraseñas: scrypt con sal ──
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function checkPassword(pw, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const calc = crypto.scryptSync(pw, salt, 64);
  const buf = Buffer.from(h, 'hex');
  return buf.length === calc.length && crypto.timingSafeEqual(buf, calc);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── Registros genéricos por entidad ──
function parse(row) {
  if (!row) return null;
  return { id: row.id, ...JSON.parse(row.data), _created: row.created_at, _updated: row.updated_at };
}
function list(tenantId, entity) {
  return db.prepare('SELECT * FROM records WHERE tenant_id=? AND entity=? ORDER BY id DESC').all(tenantId, entity).map(parse);
}
function get(tenantId, entity, id) {
  return parse(db.prepare('SELECT * FROM records WHERE tenant_id=? AND entity=? AND id=?').get(tenantId, entity, Number(id)));
}
function clean(data) {
  const d = { ...data };
  delete d.id; delete d._created; delete d._updated;
  return d;
}
function create(tenantId, entity, data) {
  const r = db.prepare('INSERT INTO records (tenant_id, entity, data) VALUES (?,?,?)').run(tenantId, entity, JSON.stringify(clean(data)));
  return get(tenantId, entity, r.lastInsertRowid);
}
// Busca un registro por su id en la plataforma de origen (pedido de Woo o ML) sin leer toda la tabla
function porExterno(tenantId, entity, externalId) {
  const n = Number(externalId);
  return db.prepare("SELECT * FROM records WHERE tenant_id=? AND entity=? AND json_extract(data, '$.external_id') IN (?, ?)")
    .all(tenantId, entity, String(externalId), Number.isFinite(n) ? n : String(externalId)).map(parse);
}
// Agrupa muchas escrituras en una sola transacción (mucho más rápido en el servidor)
function enTransaccion(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
function update(tenantId, entity, id, patch) {
  const cur = get(tenantId, entity, id);
  if (!cur) return null;
  const next = { ...clean(cur), ...clean(patch) };
  db.prepare("UPDATE records SET data=?, updated_at=datetime('now') WHERE tenant_id=? AND entity=? AND id=?")
    .run(JSON.stringify(next), tenantId, entity, Number(id));
  return get(tenantId, entity, id);
}
function remove(tenantId, entity, id) {
  return db.prepare('DELETE FROM records WHERE tenant_id=? AND entity=? AND id=?').run(tenantId, entity, Number(id)).changes > 0;
}
function count(tenantId, entity) {
  return db.prepare('SELECT COUNT(*) c FROM records WHERE tenant_id=? AND entity=?').get(tenantId, entity).c;
}

function getSettings(tenantId) {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings WHERE tenant_id=?').all(tenantId)) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}
function setSetting(tenantId, key, value) {
  db.prepare('INSERT INTO settings (tenant_id, key, value) VALUES (?,?,?) ON CONFLICT(tenant_id,key) DO UPDATE SET value=excluded.value')
    .run(tenantId, key, JSON.stringify(value));
}
function logEvent(tenantId, userId, tipo, detalle) {
  db.prepare('INSERT INTO event_log (tenant_id, user_id, tipo, detalle) VALUES (?,?,?,?)').run(tenantId, userId || null, tipo, typeof detalle === 'string' ? detalle : JSON.stringify(detalle));
}

module.exports = { db, hashPassword, checkPassword, sha256, list, get, create, update, remove, count, getSettings, setSetting, logEvent , porExterno, enTransaccion };
