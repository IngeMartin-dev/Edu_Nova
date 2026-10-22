'use strict';
/**
 * Acceso a PostgreSQL (Supabase). Mantiene la misma interfaz que tenía con MySQL
 * (query / one / exec / tx con marcadores "?") para no tocar el resto del backend:
 *  - "?" se convierte a $1, $2… y las listas en "IN (?)" se expanden.
 *  - INSERT devuelve { insertId } (se añade "RETURNING id" si la tabla tiene columna id).
 *  - SMALLINT (indicadores 0/1)  -> boolean      · true/false al guardar -> 1/0
 *  - NUMERIC / BIGINT            -> number
 *  - DATE                        -> "YYYY-MM-DD"
 *  - TIMESTAMP                   -> "YYYY-MM-DDTHH:mm:ss" (ISO local, sin zona)
 *  - snake_case -> camelCase en las claves de cada fila.
 */
const { Pool, types } = require('pg');
const env = require('./env');

types.setTypeParser(20, (v) => (v === null ? null : Number(v)));          // BIGINT
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));       // NUMERIC
types.setTypeParser(21, (v) => (v === null ? null : v !== '0'));         // SMALLINT (indicadores)
types.setTypeParser(1082, (v) => v);                                      // DATE
types.setTypeParser(1114, (v) => (v ? v.replace(' ', 'T').replace(/\.\d+$/, '') : v)); // TIMESTAMP

const poolConfig = env.db.url
  ? { connectionString: env.db.url }
  : { host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, database: env.db.name };
if (env.db.ssl) poolConfig.ssl = { rejectUnauthorized: false }; // el pooler de Supabase usa su propia CA

const pool = new Pool({
  ...poolConfig,
  // En Vercel cada instancia es pequeña y hay muchas: pocas conexiones por instancia (Supabase tiene un cupo total).
  max: process.env.VERCEL ? Math.min(env.db.connectionLimit, 3) : env.db.connectionLimit,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  allowExitOnIdle: true,
});
pool.on('error', (e) => console.error('[db] error en conexión inactiva:', e.message));

/** "?" -> $n (omite texto entre comillas), expande listas y convierte booleanos a 1/0. */
function compile(sql, params = []) {
  let out = '';
  const values = [];
  let i = 0;
  let quote = null;
  for (let k = 0; k < sql.length; k += 1) {
    const ch = sql[k];
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    if (ch !== '?') { out += ch; continue; }
    const p = params[i]; i += 1;
    if (Array.isArray(p)) {
      if (!p.length) { out += 'NULL'; continue; }
      out += p.map((v) => { values.push(typeof v === 'boolean' ? (v ? 1 : 0) : v); return `$${values.length}`; }).join(', ');
    } else {
      values.push(typeof p === 'boolean' ? (p ? 1 : 0) : p);
      out += `$${values.length}`;
    }
  }
  return { text: out, values };
}

/** snake_case -> camelCase en las claves de una fila. */
const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
function camelize(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) out[camel(k)] = row[k];
  return out;
}

let idTables = null; // tablas que tienen columna "id" (para RETURNING id)
async function tablesWithId() {
  if (!idTables) {
    const r = await pool.query("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'id'");
    idTables = new Set(r.rows.map((x) => x.table_name));
  }
  return idTables;
}

/** Ejecuta una consulta y devuelve las filas (camelizadas). */
async function query(sql, params = [], conn = pool) {
  const { text, values } = compile(sql, params);
  const res = await conn.query(text, values);
  return res.rows.map(camelize);
}

/** Devuelve la primera fila o null. */
async function one(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows.length ? rows[0] : null;
}

/** INSERT/UPDATE/DELETE: devuelve { insertId, affectedRows }. */
async function exec(sql, params = [], conn = pool) {
  let stmt = sql;
  const ins = /^\s*INSERT\s+INTO\s+"?([a-z_0-9]+)"?/i.exec(stmt);
  const wantsId = ins && !/\bRETURNING\b/i.test(stmt) && (await tablesWithId()).has(ins[1].toLowerCase());
  if (wantsId) stmt = `${stmt.replace(/;\s*$/, '')} RETURNING id`;
  const { text, values } = compile(stmt, params);
  const res = await conn.query(text, values);
  return { insertId: wantsId && res.rows[0] ? Number(res.rows[0].id) : null, affectedRows: res.rowCount };
}

/** Ejecuta fn(client) dentro de una transacción; hace rollback si falla. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, one, exec, tx, camelize, compile };
