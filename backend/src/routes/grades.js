'use strict';
const express = require('express');
const { query, one, exec } = require('../config/db');
const { asyncHandler, HttpError, toInt, numericParams } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowSql } = require('../utils/dates');
const grades = require('../services/grades');
const students = require('../services/students');
const schoolYear = require('../services/schoolYear');

const router = express.Router();
numericParams(router);
router.use(requireAuth);
const STAFF = requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO');

/** Si quien llama es un TEACHER, siempre se usa su propio id (no puede ver/editar notas de otro). */
function resolveTeacherId(req, requested) {
  if (req.user.role && String(req.user.role.name).toUpperCase() === 'TEACHER') return req.user.id;
  const n = toInt(requested);
  return n || null;
}

function required(q, ...names) {
  for (const n of names) {
    if (q[n] === undefined || q[n] === null || String(q[n]).trim() === '') throw new HttpError(400, `Falta el parámetro ${n}`);
  }
}

// POST /api/grades  — guarda (o borra, si no hay valor) una nota
router.post('/', STAFF, asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (b.studentId == null || b.subjectName == null || b.period == null) throw new HttpError(400, 'Missing required fields');

  const studentId = toInt(b.studentId);
  const subjectName = String(b.subjectName);
  const period = toInt(b.period);
  if (!studentId || !period || period < 1 || period > 4) throw new HttpError(400, 'studentId o period inválido');
  const teacherId = resolveTeacherId(req, b.teacherId);
  const gradeName = b.gradeName != null ? String(b.gradeName) : 'Nota';
  const subjectId = b.subjectId != null && String(b.subjectId) !== '' ? toInt(b.subjectId) : null;

  let gradeValue = null;
  if (b.gradeValue !== null && b.gradeValue !== undefined && String(b.gradeValue) !== '') {
    gradeValue = Number(b.gradeValue);
    if (!Number.isFinite(gradeValue)) throw new HttpError(400, 'gradeValue inválido');
    gradeValue = Math.min(5, Math.max(0, gradeValue));
  }
  const isEvaluation = b.isEvaluation === true || String(b.isEvaluation) === 'true';
  const appreciative = b.appreciative ? String(b.appreciative) : null;

  if (!(await one('SELECT id FROM students WHERE id = ?', [studentId]))) throw new HttpError(400, 'Student not found');
  if (teacherId && !(await one('SELECT id FROM users WHERE id = ?', [teacherId]))) throw new HttpError(400, 'Teacher not found');

  // ¿ya existe esa nota?
  const where = ['student_id = ?', 'period = ?', 'subject_name = ?', 'grade_name = ?'];
  const params = [studentId, period, subjectName, gradeName];
  if (subjectId) { where.push('(subject_id = ? OR subject_id IS NULL)'); params.push(subjectId); }
  if (teacherId) { where.push('teacher_id = ?'); params.push(teacherId); }
  const existing = await query(`SELECT id FROM subject_grades WHERE ${where.join(' AND ')} ORDER BY id`, params);

  // sin valor => se elimina (salvo la nota final manual "nFinal")
  if (gradeValue === null && existing.length && gradeName.toLowerCase() !== 'nfinal') {
    await exec('DELETE FROM subject_grades WHERE id = ?', [existing[0].id]);
    return res.json({ deleted: true, message: 'Grade deleted' });
  }

  let id;
  if (existing.length) {
    id = existing[0].id;
    await exec(
      'UPDATE subject_grades SET grade_value = ?, is_evaluation = ?, appreciative = ?, subject_id = ?, updated_at = ? WHERE id = ?',
      [gradeValue, isEvaluation ? 1 : 0, appreciative, subjectId, nowSql(), id]);
  } else {
    const r = await exec(
      `INSERT INTO subject_grades (student_id, teacher_id, subject_name, subject_id, period, grade_name, grade_value, is_evaluation, appreciative, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, teacherId, subjectName, subjectId, period, gradeName, gradeValue, isEvaluation ? 1 : 0, appreciative, nowSql(), nowSql()]);
    id = r.insertId;
  }
  const saved = await query(`${grades.SELECT} WHERE sg.id = ?`, [id]);
  return res.json(grades.toGradeJson(saved[0]));
}));

// DELETE /api/grades/:id
router.delete('/:id', STAFF, asyncHandler(async (req, res) => {
  await exec('DELETE FROM subject_grades WHERE id = ?', [Number(req.params.id)]);
  res.json({ deleted: Number(req.params.id) });
}));

router.get('/student/:studentId', STAFF, asyncHandler(async (req, res) => {
  res.json(await grades.byStudent(Number(req.params.studentId)));
}));

router.get('/student/:studentId/period/:period', STAFF, asyncHandler(async (req, res) => {
  res.json(await grades.byStudent(Number(req.params.studentId), Number(req.params.period)));
}));

// GET /api/grades/classroom?grade=&classroom=&period=[&teacherId&subjectName&subjectId]
router.get('/classroom', STAFF, asyncHandler(async (req, res) => {
  required(req.query, 'grade', 'classroom', 'period');
  const { grade, classroom, subjectName } = req.query;
  const period = toInt(req.query.period);
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  const [gradeRows, studentRows, subjects] = await Promise.all([
    grades.byClassroom({ grade, classroom, period, teacherId, subjectName, subjectId: toInt(req.query.subjectId) }),
    students.findByGradeAndClassGroup(grade, classroom),
    grades.subjectNames(grade, classroom, period, teacherId),
  ]);
  res.json({
    grades: gradeRows,
    students: studentRows.map((s) => ({ id: s.id, name: s.name, surname: s.surname, grade: s.grade, classGroup: s.classGroup })),
    subjects,
  });
}));

router.get('/subjects', STAFF, asyncHandler(async (req, res) => {
  required(req.query, 'grade', 'classroom', 'period');
  res.json(await grades.subjectNames(req.query.grade, req.query.classroom, toInt(req.query.period), resolveTeacherId(req, req.query.teacherId)));
}));

router.get('/grade-names', STAFF, asyncHandler(async (req, res) => {
  required(req.query, 'grade', 'classroom', 'period', 'subjectName');
  res.json(await grades.gradeNames(req.query.grade, req.query.classroom, toInt(req.query.period), req.query.subjectName, resolveTeacherId(req, req.query.teacherId)));
}));

router.get('/calculate', STAFF, asyncHandler(async (req, res) => {
  required(req.query, 'studentId', 'period', 'subjectName');
  res.json(await grades.calculateFinalGrade(toInt(req.query.studentId), toInt(req.query.period), req.query.subjectName, resolveTeacherId(req, req.query.teacherId)));
}));

router.get('/calculate-all', STAFF, asyncHandler(async (req, res) => {
  required(req.query, 'grade', 'classroom', 'period');
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  const period = toInt(req.query.period);
  res.json({
    students: await grades.calculateAllFinalGrades(req.query.grade, req.query.classroom, period, teacherId),
    subjects: await grades.subjectNames(req.query.grade, req.query.classroom, period, teacherId),
  });
}));

router.get('/students', STAFF, asyncHandler(async (req, res) => {
  required(req.query, 'grade', 'classroom');
  res.json(await students.findByGradeAndClassGroup(req.query.grade, req.query.classroom));
}));

router.get('/count', asyncHandler(async (req, res) => {
  res.json({ count: (await one('SELECT COUNT(*) AS c FROM subject_grades')).c });
}));

router.get('/count/teacher', asyncHandler(async (req, res) => {
  const isTeacher = req.user.role && String(req.user.role.name).toUpperCase() === 'TEACHER';
  if (!isTeacher) return res.json({ count: 0 });
  return res.json({ count: (await one('SELECT COUNT(*) AS c FROM subject_grades WHERE teacher_id = ?', [req.user.id])).c });
}));

// GET /api/grades/mis-notas  (PARENT) — notas de sus hijos activos
router.get('/mis-notas', asyncHandler(async (req, res) => {
  if (!req.user.role || req.user.role.name !== 'PARENT') {
    throw new HttpError(403, 'Solo disponible para cuentas de padre de familia');
  }
  const cfg = await schoolYear.getConfig();
  const hijos = (await students.findByParentId(req.user.id)).filter((s) => s.active);
  const out = [];
  for (const h of hijos) {
    const periodos = [];
    for (let period = 1; period <= 4; period++) {
      const rows = await grades.byStudent(h.id, period);
      if (!rows.length) continue;
      const porMateria = new Map();
      for (const g of rows) {
        if (!porMateria.has(g.subjectName)) porMateria.set(g.subjectName, []);
        porMateria.get(g.subjectName).push(g);
      }
      const materias = [];
      for (const [subjectName, list] of porMateria) {
        // por cada nombre de nota se queda la más reciente
        const latest = new Map();
        for (const g of list) {
          const key = g.gradeName || '';
          const cur = latest.get(key);
          const tg = g.updatedAt || g.createdAt || '';
          const tc = cur ? (cur.updatedAt || cur.createdAt || '') : '';
          if (!cur || tg > tc || (tg === tc && g.id > cur.id)) latest.set(key, g);
        }
        const items = [...latest.values()]
          .filter((g) => String(g.gradeName || '').toLowerCase() !== 'nfinal')
          .map((g) => ({ gradeName: g.gradeName, gradeValue: g.gradeValue, appreciative: g.appreciative, isEvaluation: g.isEvaluation }));
        const calc = await grades.calculateFinalGrade(h.id, period, subjectName);
        materias.push({ subjectName, items, finalGrade: calc.finalGrade });
      }
      periodos.push({ period, subjects: materias });
    }
    out.push({
      studentId: h.id, studentName: `${h.name} ${h.surname}`.trim(), grade: h.grade, classroom: h.classGroup,
      minPassingGrade: cfg.minPassingGrade, periods: periodos,
    });
  }
  res.json(out);
}));

module.exports = router;
