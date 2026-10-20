'use strict';
const fs = require('fs');
const path = require('path');

/** Carpetas donde se guardan los PDF y archivos generados (fuera de git). */
const ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(__dirname, '../../storage');

const dirs = {
  root: ROOT,
  boletines: path.join(ROOT, 'Boletines Generados'),
  consolidados: path.join(ROOT, 'Consolidados Generados'),
  promociones: path.join(ROOT, 'Promociones'),
  firmas: path.join(ROOT, 'Firmas'),
  chat: path.join(ROOT, 'Chat'),
};

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Borra una carpeta completa (sin fallar si no existe). */
function removeDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignora */ }
  // también del respaldo en la base (carga perezosa para evitar dependencia circular)
  try { require('../services/fileVault').removeTree(dir); } catch (_) { /* ignora */ }
}

/** Evita "../" y rutas fuera de la carpeta base. */
function safeJoin(base, ...parts) {
  const full = path.resolve(base, ...parts);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('Ruta no permitida');
  return full;
}

module.exports = { dirs, ensure, removeDir, safeJoin };
