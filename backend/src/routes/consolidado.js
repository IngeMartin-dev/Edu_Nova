'use strict';
const express = require('express');
const { asyncHandler, HttpError, toInt, numericParams } = require('../utils/http');
const { requireRole } = require('../middleware/auth');
const files = require('../services/files');
const { salonFolder } = require('../utils/format');
const boletin = require('../services/boletin');
const consolidado = require('../services/consolidado');
const notifications = require('../services/notifications');

const router = express.Router();
numericParams(router);
router.use(requireRole('ADMIN', 'DIRECTOR_DE_GRUPO'));

const ci = (a, b) => String(a || '').toLowerCase().localeCompare(String(b || '').toLowerCase());

// GET /api/consolidado/grado-salon?grade=&classroom=&period=
router.get('/grado-salon', asyncHandler(async (req, res) => {
  const { grade, classroom } = req.query;
  const period = toInt(req.query.period);
  if (!grade || !classroom || !period) throw new HttpError(400, 'Faltan parámetros: grade, classroom o period');
  const estudiantes = await boletin.studentsByGradeClassroom(grade, classroom);
  if (!estudiantes.length) throw new HttpError(400, 'No hay estudiantes matriculados en ese grado y salón');
  estudiantes.sort((a, b) => ci(a.surname, b.surname) || ci(a.name, b.name));
  const materias = (await boletin.subjectsForGradeClassroom(grade, classroom)).sort();
  const bytes = await consolidado.generarConsolidadoPdf(grade, classroom, period, estudiantes, materias);
  const fileName = consolidado.nombreArchivo(grade, classroom, period);
  await consolidado.guardarConsolidado(grade, classroom, period, bytes, fileName);
  await notifications.notifyAdmins('Consolidado de calificaciones generado', `Se generó el consolidado de ${grade} ${classroom} del Período ${period}.`, 'REPORT_GENERATED');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.send(bytes);
}));

router.get('/generados/salones', asyncHandler(async (req, res) => {
  const set = new Set();
  for (const p of (await files.list('consolidados')).filter((e) => e.isDir)) {
    for (const s of (await files.list(`consolidados/${p.name}`)).filter((e) => e.isDir)) set.add(s.name);
  }
  res.json([...set].sort());
}));

router.get('/generados', asyncHandler(async (req, res) => {
  const out = [];
  const periodoFiltro = toInt(req.query.period);
  const salonFiltro = req.query.grade && req.query.classroom ? salonFolder(req.query.grade, req.query.classroom).toLowerCase() : null;
  for (const p of (await files.list('consolidados')).filter((e) => e.isDir)) {
    const m = /(\d+)/.exec(p.name);
    const periodo = m ? Number(m[1]) : null;
    if (periodoFiltro && periodo !== periodoFiltro) continue;
    for (const s of (await files.list(`consolidados/${p.name}`)).filter((e) => e.isDir)) {
      if (salonFiltro && s.name.toLowerCase() !== salonFiltro) continue;
      for (const f of await files.list(`consolidados/${p.name}/${s.name}`)) {
        if (f.isDir || !f.name.toLowerCase().endsWith('.pdf')) continue;
        out.push({ fileName: f.name, period: periodo, salonCarpeta: s.name, sizeBytes: f.size, generatedAt: f.updatedAt ? new Date(f.updatedAt).toISOString() : '' });
      }
    }
  }
  out.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  res.json(out);
}));

router.get('/generados/descargar', asyncHandler(async (req, res) => {
  const { salonCarpeta, fileName } = req.query;
  if (!salonCarpeta || !fileName || !toInt(req.query.period)) throw new HttpError(400, 'Faltan parámetros');
  const bad = (v) => /[\\/]|\.\./.test(String(v));
  if (bad(salonCarpeta) || bad(fileName)) return res.status(404).end();
  const bytes = await files.get(`consolidados/Periodo ${toInt(req.query.period)}/${salonCarpeta}/${fileName}`);
  if (!bytes) return res.status(404).end();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${String(fileName).replace(/[^A-Za-z0-9_.-]/g, '_')}"`);
  return res.send(bytes);
}));

module.exports = router;
