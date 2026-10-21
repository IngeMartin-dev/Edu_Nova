'use strict';
const express = require('express');
const { asyncHandler, HttpError, numericParams } = require('../utils/http');
const { requireRole } = require('../middleware/auth');
const promotions = require('../services/promotions');
const files = require('../services/files');

const router = express.Router();
numericParams(router);
router.use(requireRole('ADMIN'));

router.get('/', asyncHandler(async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = await promotions.list();
  const out = await Promise.all(rows.map(async (p) => ({
    id: p.id, name: p.name, surname: p.surname, documentNumber: p.documentNumber, grade: p.grade, classGroup: p.classGroup,
    academicYear: p.academicYear, promotedAt: p.promotedAt, expiresAt: p.expiresAt,
    daysLeft: p.expiresAt ? Math.max(0, Math.round((new Date(`${p.expiresAt}T00:00:00`) - today) / 86400000)) : null,
    periodos: await promotions.availablePeriods(p),
  })));
  res.json(out);
}));

router.get('/:id/boletines/:periodo', asyncHandler(async (req, res) => {
  const periodo = Number(req.params.periodo);
  if (periodo < 1 || periodo > 4) throw new HttpError(400, 'Período inválido');
  const p = await promotions.find(Number(req.params.id));
  if (!p) return res.status(404).end();
  const bytes = await files.get(promotions.fileOf(p, periodo));
  if (!bytes) return res.status(404).end();
  const nombre = `Boletin_P${periodo}_${p.surname}_${p.name}.pdf`.replace(/[^A-Za-z0-9_.-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.descargar === 'true' ? 'attachment' : 'inline'}; filename="${nombre}"`);
  return res.send(bytes);
}));

module.exports = router;
