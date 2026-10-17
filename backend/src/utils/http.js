'use strict';

/** Error con código HTTP; el middleware de errores lo convierte en JSON { error }. */
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Envuelve un handler async para que cualquier excepción llegue al middleware de errores. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Convierte a número entero o devuelve null. */
function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Texto recortado o null si viene vacío. */
function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Normaliza el salón: "A" -> "Salon A"; "Salon A" se deja igual (así se llaman en toda la app). */
function normalizeClassroom(v) {
  const s = str(v);
  if (!s) return null;
  return s.length === 1 ? `Salon ${s.toUpperCase()}` : s;
}

/** Quita saltos de línea y recorta antes de loguear datos controlados por el usuario. */
function sanitizeForLog(input) {
  if (input === null || input === undefined) return '';
  const cleaned = String(input).replace(/[\r\n]/g, '_');
  return cleaned.length > 100 ? `${cleaned.slice(0, 100)}...` : cleaned;
}

/** Texto sin tildes, minúsculas y con espacios colapsados (para comparar nombres). */
function norm(t) {
  if (!t) return '';
  return String(t).trim().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').toLowerCase();
}

/** Exige que los parámetros de ruta indicados sean enteros positivos (400 si no). */
function numericParams(router, names = ['id', 'userId', 'studentId', 'teacherId', 'period', 'periodo', 'n', 'messageId']) {
  for (const name of names) {
    router.param(name, (req, res, next, val) => (/^\d{1,15}$/.test(val) ? next() : next(new HttpError(400, `Parámetro ${name} inválido`))));
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = { numericParams, HttpError, asyncHandler, toInt, str, normalizeClassroom, sanitizeForLog, norm, EMAIL_RE };
