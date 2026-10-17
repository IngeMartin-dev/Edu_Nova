'use strict';
const express = require('express');
const { asyncHandler, HttpError, toInt, numericParams } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const subjects = require('../services/subjects');
const notifications = require('../services/notifications');
const { findUserById } = require('../services/userMapper');

const router = express.Router();
numericParams(router);
router.use(requireAuth);

function validate(s) {
  if (!s.name || !String(s.name).trim()) throw new HttpError(400, 'El nombre de la materia es obligatorio');
  if (!s.code || !String(s.code).trim()) throw new HttpError(400, 'El código de la materia es obligatorio');
  if (!s.level || !String(s.level).trim()) throw new HttpError(400, 'El nivel de la materia es obligatorio');
}

// GET /api/subjects?level=&gradeMin=&gradeMax=
router.get('/', asyncHandler(async (req, res) => {
  const { level } = req.query;
  const gradeMin = toInt(req.query.gradeMin);
  const gradeMax = toInt(req.query.gradeMax);
  if (level && gradeMin !== null && gradeMax !== null) return res.json(await subjects.findByLevelAndRange(level, gradeMin, gradeMax));
  if (level) return res.json(await subjects.findByLevel(level));
  return res.json(await subjects.findAll());
}));

router.get('/level/:level', asyncHandler(async (req, res) => res.json(await subjects.findByLevel(req.params.level))));
router.get('/teacher/:teacherId', asyncHandler(async (req, res) => res.json(await subjects.findByTeacher(req.params.teacherId))));

// POST /api/subjects  (ADMIN) — crea, o actualiza si ya existe el código
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const s = req.body || {};
  validate(s);
  const existing = await subjects.findByCode(String(s.code).trim());
  if (existing) {
    const updated = await subjects.update(existing.id, { ...s, code: existing.code });
    await notifications.notifyAdmins('Materia actualizada', `Se actualizó la materia ${updated.name}.`, 'SUBJECT_UPDATED');
    return res.json(updated);
  }
  const created = await subjects.insert({ ...s, code: String(s.code).trim() });
  await notifications.notifyAdmins('Nueva materia', `Se registró la materia ${created.name} en el catálogo.`, 'SUBJECT_CREATED');
  return res.json(created);
}));

// PUT /api/subjects/:id  (ADMIN)
router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await subjects.findById(id))) return res.status(404).end();
  validate(req.body || {});
  res.json(await subjects.update(id, req.body));
}));

// DELETE /api/subjects/:id  (ADMIN)
router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await subjects.remove(Number(req.params.id));
  res.status(204).end();
}));

// PUT /api/subjects/:id/teacher/:teacherId  (ADMIN)
router.put('/:id/teacher/:teacherId', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const teacher = await findUserById(req.params.teacherId);
  if (!(await subjects.findById(id)) || !teacher) return res.status(404).end();
  await subjects.setTeacher(id, teacher.id);
  res.json(await subjects.findById(id));
}));

// DELETE /api/subjects/:id/teacher  (ADMIN)
router.delete('/:id/teacher', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await subjects.findById(id))) return res.status(404).end();
  await subjects.setTeacher(id, null);
  res.json(await subjects.findById(id));
}));

module.exports = router;
