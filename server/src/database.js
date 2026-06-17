import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

/**
 * Capa de datos async unificada.
 *
 * - Si hay DATABASE_URL (postgres://…), usa PostgreSQL (producción).
 * - Si no, usa better-sqlite3 sobre un archivo local (desarrollo).
 *
 * La aplicación escribe SQL portable con placeholders `?`; esta capa los
 * traduce a `$1..$n` para Postgres. Las fechas "ahora/hoy" se calculan en JS
 * y se pasan como parámetros (ver date.js), así no dependemos del dialecto
 * de fechas de cada motor.
 *
 * API:
 *   await q.one(sql, params)  -> primera fila o undefined
 *   await q.all(sql, params)  -> array de filas
 *   await q.run(sql, params)  -> { id, changes }   (id = PK del INSERT)
 *   await q.exec(sql)         -> ejecuta DDL (varias sentencias)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL || '';
export const isPostgres = /^postgres(ql)?:\/\//.test(DATABASE_URL);

let pgPool = null;
let sqlite = null;

/**
 * Decide si la conexión a Postgres usa SSL.
 * - Override explícito: PGSSL=require / PGSSL=disable
 * - Sin SSL: red interna de Railway (*.railway.internal) y conexiones locales
 * - Con SSL: el resto (Neon, Supabase, proxies públicos…), que lo exigen
 */
function shouldUseSsl(url) {
  if (process.env.PGSSL === 'disable' || /sslmode=disable/.test(url)) return false;
  if (process.env.PGSSL === 'require' || /sslmode=require/.test(url)) return true;
  if (/\.railway\.internal|localhost|127\.0\.0\.1/.test(url)) return false;
  return true;
}

if (isPostgres) {
  const pg = (await import('pg')).default;
  pgPool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 10),
  });
  pgPool.on('error', (err) => console.error('[db] error inesperado en el pool de PG:', err.message));
} else {
  const Database = (await import('better-sqlite3')).default;
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  sqlite = new Database(path.join(dataDir, 'turnobot.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
}

/** Traduce placeholders `?` a `$1..$n` (Postgres). */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** better-sqlite3 no acepta `undefined`: lo normalizamos a null. */
function clean(params) {
  return (params || []).map((p) => (p === undefined ? null : p));
}

export const q = {
  async one(sql, params = []) {
    if (isPostgres) {
      const res = await pgPool.query(toPg(sql), clean(params));
      return res.rows[0];
    }
    return sqlite.prepare(sql).get(...clean(params));
  },

  async all(sql, params = []) {
    if (isPostgres) {
      const res = await pgPool.query(toPg(sql), clean(params));
      return res.rows;
    }
    return sqlite.prepare(sql).all(...clean(params));
  },

  async run(sql, params = []) {
    if (isPostgres) {
      let text = toPg(sql);
      // Para recuperar el id del INSERT de forma uniforme.
      if (/^\s*insert/i.test(sql) && !/returning/i.test(sql)) text += ' RETURNING id';
      const res = await pgPool.query(text, clean(params));
      return { id: res.rows[0]?.id, changes: res.rowCount };
    }
    const info = sqlite.prepare(sql).run(...clean(params));
    return { id: info.lastInsertRowid, changes: info.changes };
  },

  async exec(sql) {
    if (isPostgres) {
      await pgPool.query(sql);
      return;
    }
    sqlite.exec(sql);
  },
};

/** Tipo de columna autoincremental según motor. */
const PK = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
/** DEFAULT de timestamp en formato 'YYYY-MM-DD HH:MM:SS' UTC en ambos motores. */
const TS_DEFAULT = isPostgres
  ? "TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))"
  : 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP';

async function addColumn(table, columnDef) {
  try {
    await q.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch {
    /* la columna ya existe */
  }
}

/** Crea el esquema y aplica migraciones aditivas. Llamar una vez al arrancar. */
export async function initDb() {
  await q.exec(`
CREATE TABLE IF NOT EXISTS users (
  id ${PK},
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at ${TS_DEFAULT}
);

CREATE TABLE IF NOT EXISTS tenants (
  id ${PK},
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  slot_interval_min INTEGER NOT NULL DEFAULT 30,
  booking_horizon_days INTEGER NOT NULL DEFAULT 14,
  welcome_message TEXT NOT NULL DEFAULT '',
  fallback_message TEXT NOT NULL DEFAULT '',
  bot_enabled INTEGER NOT NULL DEFAULT 1,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  anthropic_api_key TEXT NOT NULL DEFAULT '',
  ai_instructions TEXT NOT NULL DEFAULT '',
  wa_phone_number_id TEXT NOT NULL DEFAULT '',
  wa_access_token TEXT NOT NULL DEFAULT '',
  wa_verify_token TEXT NOT NULL DEFAULT '',
  wa_display_phone TEXT NOT NULL DEFAULT '',
  wa_connected INTEGER NOT NULL DEFAULT 0,
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at ${TS_DEFAULT}
);

CREATE TABLE IF NOT EXISTS services (
  id ${PK},
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  price REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS working_hours (
  id ${PK},
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  open_time TEXT NOT NULL DEFAULT '09:00',
  close_time TEXT NOT NULL DEFAULT '18:00',
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(tenant_id, weekday)
);

CREATE TABLE IF NOT EXISTS faqs (
  id ${PK},
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id ${PK},
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  last_seen ${TS_DEFAULT},
  created_at ${TS_DEFAULT},
  UNIQUE(tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS appointments (
  id ${PK},
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_via TEXT NOT NULL DEFAULT 'manual',
  customer_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at ${TS_DEFAULT}
);

CREATE TABLE IF NOT EXISTS messages (
  id ${PK},
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  via TEXT NOT NULL DEFAULT 'whatsapp',
  created_at ${TS_DEFAULT}
);

CREATE TABLE IF NOT EXISTS bot_sessions (
  id ${PK},
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT '{}',
  updated_at ${TS_DEFAULT},
  UNIQUE(tenant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date ON appointments(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_customer ON messages(tenant_id, customer_id);
`);

  // Migraciones aditivas (columnas agregadas después del esquema inicial)
  await addColumn('tenants', "owner_phone TEXT NOT NULL DEFAULT ''");
  await addColumn('tenants', 'notify_owner INTEGER NOT NULL DEFAULT 0');
  await addColumn('tenants', 'reminders_enabled INTEGER NOT NULL DEFAULT 1');
  await addColumn('appointments', 'reminder_sent INTEGER NOT NULL DEFAULT 0');
  await addColumn('tenants', "wa_waba_id TEXT NOT NULL DEFAULT ''");
  await addColumn('appointments', 'confirmed_by_customer INTEGER NOT NULL DEFAULT 0');
  await addColumn('tenants', 'daily_digest INTEGER NOT NULL DEFAULT 0');
  await addColumn('tenants', 'digest_hour INTEGER NOT NULL DEFAULT 8');
  await addColumn('tenants', "last_digest_date TEXT NOT NULL DEFAULT ''");
  await addColumn('customers', 'bot_paused INTEGER NOT NULL DEFAULT 0');
}
