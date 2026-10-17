'use strict';
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(path.join(UPLOAD_ROOT, 'profile-pictures'), { recursive: true });

/** Subidas en memoria (se validan antes de escribir a disco). */
const memory = (maxMb) => multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024 } });

/** Detecta el tipo REAL de imagen por sus primeros bytes (no confía en la extensión ni en el Content-Type). */
function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

module.exports = { UPLOAD_ROOT, memory, sniffImage };
