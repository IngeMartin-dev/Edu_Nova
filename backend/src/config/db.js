'use strict';
const mysql = require('mysql2/promise');
const env = require('./env');

/**
 * Convierte tipos de MySQL a los que el frontend (React) espera,
 * igual que lo hacía Jackson en el backend Java:
 *  - TINYINT(1)      -> boolean
 *  - DATETIME/TIMESTAMP -> "YYYY-MM-DDTHH:mm:ss" (ISO local, sin zona)
 *  - DATE            -> "YYYY-MM-DD"
 *  - DECIMAL/NEWDECIMAL -> number
 */
function typeCast(field, next) {
  switch (field.type) {
    case 'TINY':
      if (field.length === 1) {
        const v = field.string();
        return v === null ? null : v === '1';
      }
      return next();
    case 'DATETIME':
    case 'TIMESTAMP': {
      const v = field.string();
      return v ? v.replace(' ', 'T') : null;
    }
    case 'DATE':
      return field.string();
    case 'NEWDECIMAL':
    case 'DECIMAL': {
      const v = field.string();
      return v === null ? null : Number(v);
    }
    default:
      return next();
  }
}

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  connectionLimit: env.db.connectionLimit,
  waitForConnections: true,
  charset: 'utf8mb4',
  ssl: env.db.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
  typeCast,
  namedPlaceholders: false,
});

/** snake_case -> camelCase en las claves de una fila. */
const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
function camelize(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) out[camel(k)] = row[k];
  return out;
}

/** Ejecuta una consulta y devuelve las filas (camelizadas). */
async function query(sql, params = [], conn = pool) {
  const [rows] = await conn.query(sql, params);
  return Array.isArray(rows) ? rows.map(camelize) : rows;
}

/** Devuelve la primera fila o null. */
async function one(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows.length ? rows[0] : null;
}

/** INSERT/UPDATE/DELETE: devuelve { insertId, affectedRows }. */
async function exec(sql, params = [], conn = pool) {
  const [res] = await conn.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}

/** Ejecuta fn(conn) dentro de una transacción; hace rollback si falla. */
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, exec, tx, camelize };
