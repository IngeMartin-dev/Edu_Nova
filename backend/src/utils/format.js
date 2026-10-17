'use strict';
const env = require('../config/env');

/** Redondeo "mitad hacia arriba" (igual que String.format de Java), sin errores de coma flotante. */
function roundHalfUp(x, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(Number((x * f).toPrecision(15))) / f;
}

/** Número con N decimales y el separador decimal configurado (por defecto coma: 4,12). */
function fmt(x, decimals = 2, sep = env.decimalSeparator) {
  const s = roundHalfUp(x, decimals).toFixed(decimals);
  return sep === '.' ? s : s.replace('.', sep);
}

const escapeHtml = (s) =>
  s === null || s === undefined
    ? ''
    : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Quita tildes, deja letras/números/guion bajo (para nombres de archivo). */
const fileSafe = (t) =>
  String(t || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9_]+/g, '_');

/** "Grado 5º" -> "5"; sin número devuelve el texto recortado. */
function gradeNumberText(grade) {
  if (grade === null || grade === undefined) return 'SinGrado';
  const m = /(\d+)/.exec(grade);
  return m ? m[1] : String(grade).trim();
}

/** "Salon A" -> "A". */
function classroomLetter(classroom) {
  if (!classroom) return '';
  const parts = String(classroom).trim().split(/\s+/);
  return (parts[parts.length - 1] || '').toUpperCase();
}

/** "Grado 5º" + "Salon A" -> "5A" (carpeta de PDF). */
const salonFolder = (grade, classroom) => gradeNumberText(grade) + classroomLetter(classroom);

module.exports = { roundHalfUp, fmt, escapeHtml, fileSafe, gradeNumberText, classroomLetter, salonFolder };
