'use strict';
const fs = require('fs');
const path = require('path');
const { query, one, exec } = require('../config/db');
const { dirs, ensure, removeDir, safeJoin } = require('../config/storage');
const { todaySql } = require('../utils/dates');
const students = require('./students');

const GRADO_PROMOCIONES = 'Promociones';
const YEARS_TO_KEEP = 5;

/**
 * Localizador de los PDF de boletines de un estudiante. Lo registra el módulo de
 * boletines (Fase 2); mientras no exista, no se copian PDF (la promoción se guarda igual).
 * Debe devolver un objeto { 1: '/ruta/p1.pdf', 2: ... }.
 */
let pdfLocator = async () => ({});
const setPdfLocator = (fn) => { pdfLocator = fn; };

const clean = (t) => {
  const s = String(t || '').normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  return s || 'estudiante';
};

/** Guarda al estudiante en el archivo de promociones (5 años) y copia sus boletines. */
async function archiveStudent(s, academicYear) {
  const hoy = todaySql();
  const expira = new Date(); expira.setFullYear(expira.getFullYear() + YEARS_TO_KEEP);
  const folder = `${academicYear}/${clean(`${s.surname}_${s.name}`)}_${s.id}`;
  try {
    const origins = await pdfLocator(s);
    const entries = Object.entries(origins || {});
    if (entries.length) {
      const dest = ensure(safeJoin(dirs.promociones, folder));
      for (const [per, file] of entries) fs.copyFileSync(file, path.join(dest, `Periodo_${per}.pdf`));
    }
  } catch (_) { /* si falla la copia, igual se registra la promoción */ }

  const r = await exec(
    `INSERT INTO promotions (student_id, name, surname, document_number, grade, class_group, academic_year, promoted_at, expires_at, folder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.id, s.name, s.surname, s.documentNumber, s.grade, s.classGroup, academicYear, hoy, todaySql(expira), folder]
  );
  return r.insertId;
}

const list = () => query('SELECT * FROM promotions ORDER BY academic_year DESC, surname ASC, name ASC');
const find = (id) => one('SELECT * FROM promotions WHERE id = ?', [id]);
const fileOf = (p, periodo) => safeJoin(dirs.promociones, p.folder, `Periodo_${periodo}.pdf`);

function availablePeriods(p) {
  const out = [];
  for (let per = 1; per <= 4; per++) {
    try { if (fs.statSync(fileOf(p, per)).isFile()) out.push(per); } catch (_) { /* no existe */ }
  }
  return out;
}

function deleteFolder(p) {
  try {
    const dir = safeJoin(dirs.promociones, p.folder);
    removeDir(dir);
    const parent = path.dirname(dir);
    if (parent !== dirs.promociones && fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
  } catch (_) { /* ignora */ }
}

async function removeByStudent(studentId) {
  for (const p of await query('SELECT * FROM promotions WHERE student_id = ?', [studentId])) {
    deleteFolder(p);
    await exec('DELETE FROM promotions WHERE id = ?', [p.id]);
  }
}

/** Borra promociones vencidas (y al estudiante graduado si sigue inactivo en "Promociones"). */
async function purgeExpired() {
  const vencidas = await query('SELECT * FROM promotions WHERE expires_at < ?', [todaySql(new Date(Date.now() + 24 * 3600 * 1000))]);
  let n = 0;
  for (const p of vencidas) {
    try {
      deleteFolder(p);
      if (p.studentId) {
        const s = await students.findById(p.studentId);
        if (s && !s.active && s.grade === GRADO_PROMOCIONES) await students.deleteById(s.id);
      }
      await exec('DELETE FROM promotions WHERE id = ?', [p.id]);
      n += 1;
    } catch (_) { /* sigue con las demás */ }
  }
  return n;
}

module.exports = { GRADO_PROMOCIONES, setPdfLocator, archiveStudent, list, find, fileOf, availablePeriods, removeByStudent, purgeExpired };
