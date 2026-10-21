'use strict';
/**
 * Respaldo de archivos en la base de datos (tabla stored_files).
 *
 * Para no perder boletines, consolidados, promociones, firmas, archivos del chat ni fotos de
 * perfil si el disco del servidor se daña o se cambia de equipo, cada archivo que el backend
 * escribe a disco se copia también a TiDB/MySQL, y al arrancar se restauran los que falten. El resto del código sigue usando el sistema de archivos.
 *
 * Límite por archivo: 5 MB (TiDB Cloud limita una fila a ~6 MB). Si no hay base de datos
 * disponible o FILE_VAULT=false, todo sigue funcionando solo con el disco.
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { dirs } = require('../config/storage');
const { UPLOAD_ROOT } = require('../middleware/upload');

const MAX_BYTES = 5 * 1024 * 1024;
const enabled = !/^(0|false|no|off)$/i.test(String(process.env.FILE_VAULT || 'true'));

const ROOTS = [
  { prefix: 'storage', dir: dirs.root },
  { prefix: 'uploads', dir: UPLOAD_ROOT },
];

/** Ruta absoluta -> clave estable ("storage/Boletines Generados/Periodo 1/..."). */
function keyOf(abs) {
  const full = path.resolve(abs);
  for (const r of ROOTS) {
    if (full === r.dir || full.startsWith(r.dir + path.sep)) {
      return `${r.prefix}/${path.relative(r.dir, full).split(path.sep).join('/')}`;
    }
  }
  return null; // fuera de las carpetas gestionadas
}

/** Clave -> ruta absoluta (sin salirse de la carpeta base). */
function absOf(key) {
  const i = key.indexOf('/');
  const root = ROOTS.find((r) => r.prefix === key.slice(0, i));
  if (!root) return null;
  const full = path.resolve(root.dir, ...key.slice(i + 1).split('/'));
  return full.startsWith(root.dir + path.sep) ? full : null;
}

let ready = false;

async function ensureTable() {
  if (!enabled) return false;
  await db.exec(`CREATE TABLE IF NOT EXISTS stored_files (
    path       VARCHAR(500) NOT NULL PRIMARY KEY,
    content    LONGBLOB NOT NULL,
    size_bytes INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ready = true;
  return true;
}

/** Copia a la base un archivo que ya está en disco. Nunca lanza error: solo avisa en consola. */
async function persist(absPath, buffer) {
  if (!enabled) return;
  try {
    if (!ready && !(await ensureTable())) return;
    const key = keyOf(absPath);
    if (!key) return;
    const data = buffer || fs.readFileSync(absPath);
    if (data.length > MAX_BYTES) {
      console.warn(`[fileVault] "${key}" pesa ${(data.length / 1048576).toFixed(1)} MB (> 5 MB): no se respalda en la base.`);
      return;
    }
    await db.exec(
      `INSERT INTO stored_files (path, content, size_bytes) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), size_bytes = VALUES(size_bytes)`,
      [key, data, data.length]
    );
  } catch (e) {
    console.warn(`[fileVault] no se pudo respaldar ${absPath}: ${e.message}`);
  }
}

/** Quita un archivo del respaldo. */
async function remove(absPath) {
  if (!enabled || !ready) return;
  try {
    const key = keyOf(absPath);
    if (key) await db.exec('DELETE FROM stored_files WHERE path = ?', [key]);
  } catch (e) { console.warn(`[fileVault] no se pudo borrar ${absPath}: ${e.message}`); }
}

/** Quita del respaldo una carpeta completa. */
async function removeTree(absDir) {
  if (!enabled || !ready) return;
  try {
    const key = keyOf(absDir);
    if (!key) return;
    const like = `${key.replace(/[\\%_]/g, '\\$&')}/%`;
    await db.exec("DELETE FROM stored_files WHERE path = ? OR path LIKE ? ESCAPE '\\\\'", [key, like]);
  } catch (e) { console.warn(`[fileVault] no se pudo borrar la carpeta ${absDir}: ${e.message}`); }
}

/** Al arrancar: baja a disco los archivos guardados en la base que no existan (uno por uno, poca memoria). */
async function restoreAll() {
  if (!enabled) return { restored: 0, total: 0 };
  await ensureTable();
  const rows = await db.query('SELECT path, size_bytes FROM stored_files');
  let restored = 0;
  for (const row of rows) {
    const abs = absOf(row.path);
    if (!abs) continue;
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).size === row.sizeBytes) continue;
      const [data] = await db.pool.query('SELECT content FROM stored_files WHERE path = ?', [row.path]);
      if (!data.length) continue;
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, data[0].content);
      restored += 1;
    } catch (e) { console.warn(`[fileVault] no se pudo restaurar ${row.path}: ${e.message}`); }
  }
  return { restored, total: rows.length };
}

module.exports = { enabled, ensureTable, persist, remove, removeTree, restoreAll, keyOf, absOf };
