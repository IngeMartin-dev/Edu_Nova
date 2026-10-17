'use strict';
const express = require('express');
const { asyncHandler, HttpError, toInt } = require('../utils/http');
const { requireRole } = require('../middleware/auth');
const { one } = require('../config/db');
const grades = require('../services/grades');

const router = express.Router();
router.use(requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'));

const toDto = (c) => (c ? {
  exists: true, id: c.id, columnsJson: c.columnsJson, quizzesPct: c.quizzesPct, talleresPct: c.talleresPct, actividadesPct: c.actividadesPct,
} : { exists: false, columnsJson: '[]', quizzesPct: 0, talleresPct: 0, actividadesPct: 0 });

router.get('/', asyncHandler(async (req, res) => {
  const { teacherId, subjectName, grade, classroom } = req.query;
  if (!teacherId || !subjectName || !grade || !classroom) throw new HttpError(400, 'Faltan parámetros');
  const period = toInt(req.query.period) || 1;
  res.json(toDto(await grades.getColumnConfig(Number(teacherId), subjectName, grade, classroom, period)));
}));

router.post('/', asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.teacherId || !b.subjectName || !b.grade || !b.classroom) throw new HttpError(400, 'Faltan campos obligatorios');
  const teacherId = Number(b.teacherId);
  if (!(await one('SELECT id FROM users WHERE id = ?', [teacherId]))) throw new HttpError(400, 'Profesor no encontrado');
  const saved = await grades.saveColumnConfig(
    teacherId, b.subjectName, b.grade, b.classroom, toInt(b.period) || 1,
    typeof b.columnsJson === 'string' ? b.columnsJson : JSON.stringify(b.columnsJson ?? []),
    toInt(b.quizzesPct) || 0, toInt(b.talleresPct) || 0, toInt(b.actividadesPct) || 0
  );
  res.json(toDto(saved));
}));

module.exports = router;
