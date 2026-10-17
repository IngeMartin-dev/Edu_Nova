'use strict';
const express = require('express');
const { query, one, exec } = require('../config/db');
const { asyncHandler, HttpError, toInt, numericParams } = require('../utils/http');
const { requireRole } = require('../middleware/auth');
const { nowSql } = require('../utils/dates');

const router = express.Router();
numericParams(router);
router.use(requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'));

/** Un TEACHER siempre usa su propio id; los demás roles pueden indicar teacherId. */
function resolveTeacherId(req, requested) {
  if (req.user.role && String(req.user.role.name).toUpperCase() === 'TEACHER') return req.user.id;
  const n = toInt(requested);
  return n || null;
}

/** Quita ```html … ``` y las etiquetas <html>/<body> que a veces trae el texto generado. */
function sanitizeContent(content) {
  if (content === null || content === undefined) return '';
  let c = String(content).trim();
  if (c.startsWith('```html') && c.endsWith('```')) c = c.slice(7, -3).trim();
  else if (c.startsWith('```') && c.endsWith('```')) c = c.slice(3, -3).trim();
  let m = /^\s*<html[^>]*>([\s\S]*?)<\/html>\s*$/i.exec(c);
  if (m) c = m[1].trim();
  m = /^\s*<body[^>]*>([\s\S]*?)<\/body>\s*$/i.exec(c);
  if (m) c = m[1].trim();
  return c;
}

/** Valor opcional: "" o null => null; si no, el valor. */
const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v === '');

// POST /api/grades/recovery
router.post('/recovery', asyncHandler(async (req, res) => {
  const p = req.body || {};
  try {
    const studentId = toInt(p.studentId);
    const period = toInt(p.period);
    if (!studentId || !p.subjectName || !period) throw new Error('studentId, subjectName y period son obligatorios');
    const subjectName = String(p.subjectName);
    const teacherId = resolveTeacherId(req, p.teacherId);
    const subjectId = !blank(p.subjectId) ? toInt(p.subjectId) : null;

    if (!(await one('SELECT id FROM students WHERE id = ?', [studentId]))) throw new Error('Student not found');
    if (teacherId && !(await one('SELECT id FROM users WHERE id = ?', [teacherId]))) {
      return res.status(400).json({ success: false, message: 'Teacher not found' });
    }

    const existing = subjectId
      ? await one('SELECT * FROM recovery_data WHERE student_id = ? AND subject_name = ? AND subject_id = ? AND period = ? ORDER BY id LIMIT 1', [studentId, subjectName, subjectId, period])
      : await one('SELECT * FROM recovery_data WHERE student_id = ? AND subject_name = ? AND period = ? ORDER BY id LIMIT 1', [studentId, subjectName, period]);

    const num = (key, cur) => {
      if (!(key in p)) return cur ?? null;
      if (blank(p[key])) return null;
      const n = Number(p[key]);
      if (!Number.isFinite(n)) throw new Error(`${key} inválido`);
      return n;
    };
    const txt = (key, cur) => (!(key in p) ? cur ?? null : blank(p[key]) ? null : String(p[key]));

    const row = {
      recoveryWritten: num('recoveryWritten', existing && existing.recoveryWritten),
      recoveryOral: num('recoveryOral', existing && existing.recoveryOral),
      jInteg: txt('jInteg', existing && existing.jInteg),
      compSocial: txt('compSocial', existing && existing.compSocial),
      valoracionAcudiente: txt('valoracionAcudiente', existing && existing.valoracionAcudiente),
    };
    if (existing) {
      await exec(
        `UPDATE recovery_data SET teacher_id = ?, subject_name = ?, subject_id = ?, period = ?, recovery_written = ?, recovery_oral = ?,
                j_integ = ?, comp_social = ?, valoracion_acudiente = ?, updated_at = ? WHERE id = ?`,
        [teacherId || existing.teacherId || null, subjectName, subjectId, period, row.recoveryWritten, row.recoveryOral, row.jInteg, row.compSocial, row.valoracionAcudiente, nowSql(), existing.id]);
    } else {
      await exec(
        `INSERT INTO recovery_data (student_id, teacher_id, subject_name, subject_id, period, recovery_written, recovery_oral, j_integ, comp_social, valoracion_acudiente, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [studentId, teacherId || null, subjectName, subjectId, period, row.recoveryWritten, row.recoveryOral, row.jInteg, row.compSocial, row.valoracionAcudiente, nowSql(), nowSql()]);
    }
    return res.json({ success: true, message: 'Recovery data saved successfully' });
  } catch (e) {
    return res.status(400).json({ success: false, message: `Error saving recovery data: ${e.message}` });
  }
}));

// GET /api/grades/recovery/:studentId
router.get('/recovery/:studentId', asyncHandler(async (req, res) => {
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  const where = ['rd.student_id = ?'];
  const params = [Number(req.params.studentId)];
  if (teacherId) { where.push('rd.teacher_id = ?'); params.push(teacherId); }
  const period = toInt(req.query.period);
  if (period) { where.push('rd.period = ?'); params.push(period); }
  const subjectId = toInt(req.query.subjectId);
  if (subjectId) { where.push('rd.subject_id = ?'); params.push(subjectId); }
  else if (req.query.subjectName && String(req.query.subjectName).trim()) {
    where.push('UPPER(TRIM(rd.subject_name)) = ?'); params.push(String(req.query.subjectName).trim().toUpperCase());
  }
  const rows = await query(
    `SELECT rd.*, s.name AS s_name, s.surname AS s_surname, s.grade AS s_grade, s.class_group AS s_class_group
       FROM recovery_data rd LEFT JOIN students s ON s.id = rd.student_id WHERE ${where.join(' AND ')} ORDER BY rd.id`, params);
  res.json(rows.map((rd) => ({
    id: rd.id, subjectName: rd.subjectName, period: rd.period, teacherId: rd.teacherId ?? null,
    recoveryWritten: rd.recoveryWritten ?? null, recoveryOral: rd.recoveryOral ?? null, jInteg: rd.jInteg ?? null,
    compSocial: rd.compSocial ?? null, valoracionAcudiente: rd.valoracionAcudiente ?? null,
    createdAt: rd.createdAt ?? null, updatedAt: rd.updatedAt ?? null,
    student: rd.studentId ? { id: rd.studentId, name: rd.sName, surname: rd.sSurname, grade: rd.sGrade, classGroup: rd.sClassGroup ?? null } : undefined,
  })));
}));

const planDto = (pl) => ({
  id: pl.id, studentId: pl.studentId ?? null,
  studentName: pl.studentId ? `${pl.sSurname} ${pl.sName}` : '',
  subjectName: pl.subjectName, period: pl.period, teacherId: pl.teacherId ?? null,
  topics: pl.topics, planContent: pl.planContent, createdAt: pl.createdAt,
  grade: pl.sGrade ?? null, classGroup: pl.sClassGroup ?? null,
  durationDays: pl.durationDays ?? 2, day1Content: pl.day1Content ?? '', day2Content: pl.day2Content ?? '',
});
const PLAN_SELECT = `SELECT rp.*, s.name AS s_name, s.surname AS s_surname, s.grade AS s_grade, s.class_group AS s_class_group
                       FROM recovery_plans rp LEFT JOIN students s ON s.id = rp.student_id`;

// POST /api/grades/study-plan
router.post('/study-plan', asyncHandler(async (req, res) => {
  const p = req.body || {};
  try {
    if (blank(p.studentId)) return res.status(400).json({ success: false, message: 'Student ID is required' });
    const studentId = toInt(p.studentId);
    const teacherId = resolveTeacherId(req, p.teacherId);
    const subjectName = !blank(p.subjectName) ? String(p.subjectName) : 'MATEMATICAS';
    const period = !blank(p.period) ? toInt(p.period) : 1;
    const topics = sanitizeContent(p.topics);
    const planContent = sanitizeContent(p.planContent);
    const durationDays = 'durationDays' in p && !blank(p.durationDays) ? toInt(p.durationDays) : 2;
    const day1 = sanitizeContent(p.day1Content);
    const day2 = sanitizeContent(p.day2Content);

    if (!(await one('SELECT id FROM students WHERE id = ?', [studentId]))) {
      return res.status(400).json({ success: false, message: `Student not found with ID: ${studentId}` });
    }
    if (teacherId && !(await one('SELECT id FROM users WHERE id = ?', [teacherId]))) {
      return res.status(400).json({ success: false, message: 'Teacher not found' });
    }
    const existing = teacherId
      ? await one('SELECT id FROM recovery_plans WHERE student_id = ? AND period = ? AND subject_name = ? AND teacher_id = ? LIMIT 1', [studentId, period, subjectName, teacherId])
      : await one('SELECT id FROM recovery_plans WHERE student_id = ? AND period = ? AND subject_name = ? LIMIT 1', [studentId, period, subjectName]);
    let id;
    if (existing) {
      id = existing.id;
      await exec('UPDATE recovery_plans SET topics = ?, plan_content = ?, duration_days = ?, day1_content = ?, day2_content = ? WHERE id = ?',
        [topics, planContent, durationDays, day1, day2, id]);
    } else {
      const r = await exec(
        `INSERT INTO recovery_plans (student_id, teacher_id, subject_name, period, topics, plan_content, duration_days, day1_content, day2_content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [studentId, teacherId || null, subjectName, period, topics, planContent, durationDays, day1, day2, nowSql()]);
      id = r.insertId;
    }
    return res.json({ success: true, message: 'Study plan saved successfully', planId: id });
  } catch (e) {
    return res.status(400).json({ success: false, message: `Error saving study plan: ${e.message}` });
  }
}));

// GET /api/grades/recovery-plans
router.get('/recovery-plans', asyncHandler(async (req, res) => {
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  const rows = teacherId
    ? await query(`${PLAN_SELECT} WHERE rp.teacher_id = ? ORDER BY rp.created_at DESC, rp.id DESC`, [teacherId])
    : await query(`${PLAN_SELECT} ORDER BY rp.created_at DESC, rp.id DESC`);
  res.json(rows.map(planDto));
}));

// GET /api/grades/study-plans/:studentId
router.get('/study-plans/:studentId', asyncHandler(async (req, res) => {
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  const rows = teacherId
    ? await query(`${PLAN_SELECT} WHERE rp.teacher_id = ? AND rp.student_id = ? ORDER BY rp.created_at DESC, rp.id DESC`, [teacherId, Number(req.params.studentId)])
    : await query(`${PLAN_SELECT} WHERE rp.student_id = ? ORDER BY rp.id`, [Number(req.params.studentId)]);
  res.json(rows.map(planDto));
}));

// DELETE /api/grades/study-plan/:id
router.delete('/study-plan/:id', asyncHandler(async (req, res) => {
  const teacherId = resolveTeacherId(req, req.query.teacherId);
  const plan = teacherId
    ? await one('SELECT id FROM recovery_plans WHERE id = ? AND teacher_id = ?', [Number(req.params.id), teacherId])
    : await one('SELECT id FROM recovery_plans WHERE id = ?', [Number(req.params.id)]);
  if (!plan) return res.status(400).json({ success: false, message: 'Study plan not found' });
  await exec('DELETE FROM recovery_plans WHERE id = ?', [plan.id]);
  return res.json({ success: true, message: 'Study plan deleted' });
}));

module.exports = router;
