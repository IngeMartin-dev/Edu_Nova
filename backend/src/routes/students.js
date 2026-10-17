'use strict';
const express = require('express');
const { asyncHandler, HttpError, norm, numericParams } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const students = require('../services/students');
const notifications = require('../services/notifications');

const router = express.Router();
numericParams(router);
router.use(requireAuth);
const STAFF = ['ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'];

/** Avisa a los padres cuando un estudiante pasa a activo/inactivo. */
async function notifyActiveChange(student, wasActive) {
  if (Boolean(student.active) === Boolean(wasActive)) return;
  const nombre = `${student.name} ${student.surname}`.trim();
  const parents = await students.parentsByStudent([student.id]);
  for (const p of parents.get(student.id) || []) {
    if (student.active) {
      await notifications.sendNotification(p.id, '✅ Estudiante activado',
        `El estudiante ${nombre} fue reactivado. Ya puedes ver sus boletines nuevamente.`, 'STUDENT_ACTIVATED');
    } else {
      await notifications.sendNotification(p.id, '⚠️ Estudiante inactivo',
        `El estudiante ${nombre} fue marcado como inactivo. No recibirás sus boletines hasta que sea reactivado.`, 'STUDENT_DEACTIVATED');
    }
  }
}

function validate(s) {
  if (!s.name || !String(s.name).trim()) throw new HttpError(400, 'El nombre del estudiante es obligatorio');
  if (String(s.name).length > 100) throw new HttpError(400, 'El nombre no puede superar 100 caracteres');
  if (!s.surname || !String(s.surname).trim()) throw new HttpError(400, 'El apellido del estudiante es obligatorio');
  if (String(s.surname).length > 100) throw new HttpError(400, 'El apellido no puede superar 100 caracteres');
  if (!s.grade || !String(s.grade).trim()) throw new HttpError(400, 'El grado es obligatorio');
  if (s.documentNumber && String(s.documentNumber).length > 20) throw new HttpError(400, 'El documento no puede superar 20 caracteres');
}

// GET /api/students
router.get('/', requireRole(...STAFF), asyncHandler(async (req, res) => res.json(await students.findAll())));

// GET /api/students/grade/:grade/class/:classGroup  (antes de /:id)
router.get('/grade/:grade/class/:classGroup', requireRole(...STAFF), asyncHandler(async (req, res) => {
  res.json(await students.findByGradeAndClassGroup(req.params.grade, req.params.classGroup));
}));

router.get('/:id', requireRole(...STAFF), asyncHandler(async (req, res) => {
  const s = await students.findById(req.params.id);
  if (!s) return res.status(404).end();
  return res.json(s);
}));

// POST /api/students  (ADMIN)
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const s = req.body || {};
  validate(s);
  const doc = s.documentNumber ? String(s.documentNumber).trim() : '';

  if (doc) {
    const existing = await students.findByDocumentNumber(doc);
    if (existing) {
      const updated = await students.update(existing.id, {
        ...existing, name: s.name, surname: s.surname, grade: s.grade, classGroup: s.classGroup,
        documentNumber: doc, active: s.active !== false,
      });
      await notifyActiveChange(updated, existing.active);
      return res.json(updated);
    }
  } else {
    const n = norm(s.name);
    const a = norm(s.surname);
    for (const otro of await students.findAll()) {
      if (norm(otro.name) === n && norm(otro.surname) === a) {
        throw new HttpError(409,
          `Ya existe un estudiante llamado ${otro.surname} ${otro.name} (${otro.grade}${otro.classGroup ? `, ${otro.classGroup}` : ', sin salón'}). Edítalo en lugar de crear otro.`);
      }
    }
  }
  return res.json(await students.insert({ ...s, documentNumber: doc || null }));
}));

// PUT /api/students/:id  (ADMIN)
router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await students.findById(id);
  if (!existing) return res.status(404).end();
  const s = req.body || {};
  validate({ ...s, grade: s.grade || existing.grade });

  const next = { ...existing, name: s.name, surname: s.surname };
  if (s.documentNumber && String(s.documentNumber).trim()) {
    const doc = String(s.documentNumber).trim();
    const owner = await students.findByDocumentNumber(doc);
    if (owner && owner.id !== id) {
      throw new HttpError(409, `Ese documento ya pertenece a otro estudiante: ${owner.surname} ${owner.name}.`);
    }
    next.documentNumber = doc;
  }
  if (s.grade && String(s.grade).trim()) next.grade = String(s.grade).trim();
  if (s.classGroup && String(s.classGroup).trim()) {
    const cg = String(s.classGroup).trim();
    next.classGroup = cg.length === 1 ? `Salon ${cg.toUpperCase()}` : cg;
  }
  next.active = s.active === true;

  const saved = await students.update(id, next);
  await notifyActiveChange(saved, existing.active);
  return res.json(saved);
}));

// DELETE /api/students/:id  (ADMIN)
router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await students.deleteById(Number(req.params.id));
  res.status(200).end();
}));

module.exports = router;
