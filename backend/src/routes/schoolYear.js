'use strict';
const express = require('express');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const schoolYear = require('../services/schoolYear');

const router = express.Router();

// Disponible para cualquier usuario con sesión (los profesores la usan para marcar notas perdidas)
router.get('/min-passing-grade', requireAuth, asyncHandler(async (req, res) => {
  res.json({ minPassingGrade: (await schoolYear.getConfig()).minPassingGrade });
}));

router.use(requireRole('ADMIN'));

router.get('/config', asyncHandler(async (req, res) => res.json(schoolYear.toDto(await schoolYear.getConfig()))));
router.get('/fecha-alcanzada', asyncHandler(async (req, res) => res.json({ alcanzada: await schoolYear.reachedYearEnd() })));

router.put('/config', asyncHandler(async (req, res) => {
  const b = req.body || {};
  let yearEnd = null;
  if (b.yearEndDate && String(b.yearEndDate).trim()) {
    yearEnd = String(b.yearEndDate).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(yearEnd) || Number.isNaN(Date.parse(yearEnd))) throw new HttpError(400, 'yearEndDate debe tener formato AAAA-MM-DD');
  }
  let min = null;
  if (b.minPassingGrade !== null && b.minPassingGrade !== undefined && b.minPassingGrade !== '') {
    min = Number(b.minPassingGrade);
    if (!Number.isFinite(min)) throw new HttpError(400, 'minPassingGrade inválido');
  }
  res.json(schoolYear.toDto(await schoolYear.updateConfig(yearEnd, min)));
}));

router.post('/wipe', asyncHandler(async (req, res) => {
  if (!req.body || req.body.confirm !== 'BORRAR') {
    throw new HttpError(400, 'Confirmacion requerida: envia { "confirm": "BORRAR" } para continuar.');
  }
  await schoolYear.wipeYearData();
  res.json({ message: 'Datos del ano escolar borrados. Estudiantes y padres conservados.' });
}));

router.post('/advance', asyncHandler(async (req, res) => res.json(await schoolYear.advanceYear())));
router.get('/advance/pendientes', asyncHandler(async (req, res) => res.json(await schoolYear.getPendientes())));

router.post('/advance/assign-classrooms', asyncHandler(async (req, res) => {
  const a = (req.body || {}).assignments;
  if (!a || typeof a !== 'object') throw new HttpError(400, 'assignments es obligatorio');
  res.json({ asignados: await schoolYear.assignClassrooms(a) });
}));

router.post('/revert', asyncHandler(async (req, res) => res.json({ revertidos: await schoolYear.revertYear() })));

module.exports = router;
