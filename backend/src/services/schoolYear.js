'use strict';
const { query, one, exec, tx } = require('../config/db');
const { dirs, removeDir } = require('../config/storage');
const { nowSql, todaySql } = require('../utils/dates');
const { normalizeClassroom } = require('../utils/http');
const promotions = require('./promotions');

const GRADO_MAXIMO = 11;

async function getConfig() {
  let c = await one('SELECT * FROM school_year_config WHERE id = 1');
  if (!c) {
    await exec('INSERT INTO school_year_config (id, current_academic_year, min_passing_grade) VALUES (1, ?, 3.5)', [new Date().getFullYear()]);
    c = await one('SELECT * FROM school_year_config WHERE id = 1');
  }
  return c;
}

const toDto = (c) => ({
  yearEndDate: c.yearEndDate || null,
  minPassingGrade: c.minPassingGrade,
  currentAcademicYear: c.currentAcademicYear,
  lastWipedAt: c.lastWipedAt || null,
  lastAdvancedAt: c.lastAdvancedAt || null,
  advancePendingClassroomOrg: Boolean(c.advancePendingClassroomOrg),
  yearEndNotified: Boolean(c.yearEndNotified),
});

async function updateConfig(yearEndDate, minPassingGrade) {
  const c = await getConfig();
  const sets = []; const params = [];
  if (yearEndDate) { sets.push('year_end_date = ?', 'year_end_notified = 0', 'year_end_7d_notified = 0'); params.push(yearEndDate); }
  if (minPassingGrade !== null && minPassingGrade !== undefined) {
    sets.push('min_passing_grade = ?'); params.push(Math.max(0, Math.min(5, minPassingGrade)));
  }
  if (sets.length) await exec(`UPDATE school_year_config SET ${sets.join(', ')} WHERE id = 1`, params);
  return getConfig();
}

/** Borra notas, boletines, recuperaciones y PDF generados (conserva estudiantes y padres). */
async function clearGradesAndDocuments(c) {
  await exec('DELETE FROM digital_signatures WHERE report_card_id IS NOT NULL', [], c);
  for (const t of ['subject_grades', 'recovery_data', 'recovery_plans', 'report_card_history', 'report_cards', 'boletin_objetivos', 'boletin_valoraciones']) {
    await exec(`DELETE FROM ${t}`, [], c);
  }
  removeDir(dirs.boletines);
  removeDir(dirs.consolidados);
}

async function wipeYearData() {
  await tx(async (c) => {
    await clearGradesAndDocuments(c);
    for (const t of ['chat_messages', 'grade_column_configs', 'notifications', 'academic_periods', 'homeroom_assignments']) {
      await exec(`DELETE FROM ${t}`, [], c);
    }
    const cfg = await one('SELECT current_academic_year FROM school_year_config WHERE id = 1', [], c);
    const year = (cfg && cfg.currentAcademicYear ? cfg.currentAcademicYear : new Date().getFullYear()) + 1;
    await exec('UPDATE school_year_config SET last_wiped_at = ?, current_academic_year = ?, year_end_notified = 0 WHERE id = 1', [nowSql(), year], c);
    // deja los 4 períodos listos para el nuevo año (el 1 abierto)
    for (let i = 1; i <= 4; i++) {
      await exec('INSERT INTO academic_periods (period_number, is_unlocked, is_automatic, description) VALUES (?, ?, 0, ?)',
        [i, i === 1 ? 1 : 0, `Período ${i} del año académico`], c);
    }
  });
}

const gradeNumber = (g) => { const m = /(\d+)/.exec(g || ''); return m ? Number(m[1]) : null; };
const gradeLabel = (n) => `Grado ${n}\u00ba`;

/** Sube a todos los estudiantes activos un grado; los de 11º se archivan como graduados. */
async function advanceYear() {
  const cfg = await getConfig();
  const year = cfg.currentAcademicYear || new Date().getFullYear();
  const active = await query('SELECT * FROM students WHERE active = 1 ORDER BY id');
  const result = { estudiantesPromovidos: 0, estudiantesGraduados: 0, pendientesDeOrganizar: [] };

  for (const s of active) {
    const n = gradeNumber(s.grade);
    if (n === null) continue;
    if (n >= GRADO_MAXIMO) await promotions.archiveStudent(s, year);
    if (n >= GRADO_MAXIMO) {
      await exec('UPDATE students SET previous_grade = ?, previous_class_group = ?, grade = ?, class_group = NULL, active = 0 WHERE id = ?',
        [s.grade, s.classGroup, promotions.GRADO_PROMOCIONES, s.id]);
      result.estudiantesGraduados += 1;
    } else {
      const newGrade = gradeLabel(n + 1);
      await exec('UPDATE students SET previous_grade = ?, previous_class_group = ?, grade = ?, class_group = NULL WHERE id = ?',
        [s.grade, s.classGroup, newGrade, s.id]);
      result.estudiantesPromovidos += 1;
      result.pendientesDeOrganizar.push({ studentId: s.id, name: s.name, surname: s.surname, grade: newGrade, newGrade });
    }
  }
  await tx(async (c) => {
    await exec('DELETE FROM grade_column_configs', [], c);
    await clearGradesAndDocuments(c);
    await exec('UPDATE school_year_config SET last_advanced_at = ?, advance_pending_classroom_org = ? WHERE id = 1',
      [nowSql(), result.pendientesDeOrganizar.length ? 1 : 0], c);
  });
  result.pendientesDeOrganizar.sort((a, b) => String(a.surname).localeCompare(String(b.surname)));
  return result;
}

async function getPendientes() {
  return query(
    `SELECT id AS student_id, name, surname, grade FROM students
      WHERE active = 1 AND class_group IS NULL AND previous_grade IS NOT NULL ORDER BY grade, surname`
  );
}

async function assignClassrooms(assignments) {
  let aplicados = 0;
  for (const [id, salon] of Object.entries(assignments || {})) {
    const r = await exec('UPDATE students SET class_group = ? WHERE id = ?', [normalizeClassroom(salon), Number(id)]);
    if (r.affectedRows) aplicados += 1;
  }
  const quedan = (await getPendientes()).length > 0;
  await exec('UPDATE school_year_config SET advance_pending_classroom_org = ? WHERE id = 1', [quedan ? 1 : 0]);
  return aplicados;
}

/** Deshace UN nivel: devuelve a cada estudiante a su grado y salón anteriores. */
async function revertYear() {
  const todos = await query('SELECT * FROM students WHERE previous_grade IS NOT NULL');
  let revertidos = 0;
  for (const s of todos) {
    if (s.grade === promotions.GRADO_PROMOCIONES) await promotions.removeByStudent(s.id);
    await exec('UPDATE students SET grade = ?, class_group = ?, previous_grade = NULL, previous_class_group = NULL, active = 1 WHERE id = ?',
      [s.previousGrade, s.previousClassGroup, s.id]);
    revertidos += 1;
  }
  await exec('UPDATE school_year_config SET advance_pending_classroom_org = 0 WHERE id = 1');
  return revertidos;
}

async function reachedYearEnd() {
  const c = await getConfig();
  return Boolean(c.yearEndDate) && todaySql() >= c.yearEndDate;
}

async function sevenDaysToYearEnd() {
  const c = await getConfig();
  if (!c.yearEndDate) return false;
  const end = new Date(`${c.yearEndDate}T00:00:00`);
  const limit = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
  const hoy = new Date(`${todaySql()}T00:00:00`);
  return hoy < end && hoy >= limit;
}

module.exports = {
  getConfig, toDto, updateConfig, wipeYearData, advanceYear, getPendientes, assignClassrooms, revertYear,
  reachedYearEnd, sevenDaysToYearEnd,
};