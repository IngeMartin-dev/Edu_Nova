'use strict';
const express = require('express');
const path = require('path');
const { asyncHandler, HttpError, toInt, numericParams } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const { memory, sniffImage } = require('../middleware/upload');
const files = require('../services/files');
const { salonFolder, gradeNumberText } = require('../utils/format');
const boletin = require('../services/boletin');
const students = require('../services/students');

const router = express.Router();
numericParams(router);
router.use(requireAuth);
const STAFF = requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO');
const upload = memory(5);

const need = (q, ...names) => {
  for (const n of names) if (q[n] === undefined || q[n] === null || String(q[n]).trim() === '') throw new HttpError(400, `Falta el parámetro ${n}`);
};
const headerName = (n) => String(n).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/_+/g, '_');
const safeSend = (res, bytes, fileName, inline = true) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${headerName(fileName)}"`);
  res.send(bytes);
};

// GET /api/boletines/estudiantes
router.get('/estudiantes', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade', 'classroom');
  res.json(await students.findByGradeAndClassGroup(req.query.grade, req.query.classroom));
}));

router.get('/materias', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade', 'classroom', 'period');
  try { res.json(await boletin.subjectsWithGrades(req.query.grade, req.query.classroom, toInt(req.query.period))); } catch (e) { res.json([]); }
}));

router.get('/materias-todas', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade', 'classroom');
  try { res.json(await boletin.subjectsForGradeClassroom(req.query.grade, req.query.classroom)); } catch (e) { res.json([]); }
}));

router.get('/nivel-grado', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade');
  const digits = String(req.query.grade).replace(/[^0-9]/g, '');
  const n = digits ? parseInt(digits, 10) : 0;
  const level = n >= 10 && n <= 11 ? 'media' : n >= 6 && n <= 9 ? 'bachillerato' : n >= 1 && n <= 5 ? 'primaria' : 'desconocido';
  res.json({ gradeNum: n, level });
}));

router.get('/escala', STAFF, (req, res) => res.json({
  S: '4.6 – 5.0 (Superior)', A: '4.0 – 4.5 (Alto)', B: '3.5 – 3.9 (Básico)', I: '1.0 – 3.4 (Bajo)',
}));

router.get('/nivel', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade');
  const level = boletin.getAcademicLevel(req.query.grade);
  res.json({ level, description: level === 'PRIMARIA' ? 'Educación Primaria' : 'Educación Bachillerato' });
}));

router.get('/promedios', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade', 'classroom', 'period');
  try { res.json(await boletin.averagesOfSalon(req.query.grade, req.query.classroom, toInt(req.query.period))); } catch (e) { res.json([]); }
}));

router.get('/materias-perdidas', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade', 'classroom', 'period');
  try { res.json(await boletin.lostSubjectsOfSalon(req.query.grade, req.query.classroom, toInt(req.query.period))); } catch (e) { res.json([]); }
}));

// POST /api/boletines/generar — genera un boletín y devuelve el PDF
router.post('/generar', STAFF, asyncHandler(async (req, res) => {
  const r = await boletin.generateSingleFromPayload(req.body || {});
  if (!r.success) return res.status(400).json({ error: r.error, ...(r.trace ? { trace: r.trace } : {}) });
  const bytes = r.bytes;
  const d = r.data;
  const fileName = `Boletin_${d.academicLevel || ''}_G${gradeNumberText(d.grade)}_${d.student.name}_${d.student.surname}.pdf`;
  res.setHeader('X-Boletin-Path', path.basename(r.savedPath));
  return safeSend(res, bytes, fileName);
}));

// --- Generación masiva ---
router.post('/generaciones', STAFF, asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.grade || !b.classroom || !Array.isArray(b.students)) throw new HttpError(400, 'Faltan parámetros: grade, classroom o students');
  if (!b.students.length) throw new HttpError(400, 'La lista de estudiantes está vacía');
  res.json(boletin.startGenerationJob(String(b.grade), String(b.classroom), toInt(b.period), b.students));
}));

router.get('/generaciones', STAFF, (req, res) => res.json(boletin.listJobs()));

router.get('/generaciones/:jobId/archivo/:studentId', STAFF, asyncHandler(async (req, res) => {
  const job = boletin.getJob(req.params.jobId);
  if (!job) return res.status(404).end();
  const f = job.files.find((x) => x.studentId === Number(req.params.studentId));
  if (!f || !f.filePath) return res.status(404).end();
  const bytes = await files.get(f.filePath);
  if (!bytes) return res.status(404).end();
  return safeSend(res, bytes, f.fileName || 'boletin.pdf');
}));

// --- Objetivos predeterminados ---
router.post('/objetivos-predeterminados', STAFF, asyncHandler(async (req, res) => {
  const b = req.body || {};
  const period = toInt(b.period);
  if (!b.grade || !b.classroom || !period) return res.status(400).json({ success: false, message: 'Faltan parámetros: grade, classroom o period' });
  const payload = b.payload !== undefined && b.payload !== null ? (typeof b.payload === 'string' ? b.payload : JSON.stringify(b.payload)) : '{}';
  const saved = await boletin.saveObjetivos(String(b.grade), String(b.classroom), period, payload);
  res.json({ success: true, id: saved.id });
}));

router.get('/objetivos-predeterminados', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade', 'classroom');
  res.json((await boletin.listObjetivos(req.query.grade, req.query.classroom)).map((o) => ({ period: o.period, updatedAt: o.updatedAt })));
}));

router.get('/objetivos-predeterminados/:period', STAFF, asyncHandler(async (req, res) => {
  need(req.query, 'grade', 'classroom');
  const o = await boletin.getObjetivos(req.query.grade, req.query.classroom, Number(req.params.period));
  if (!o) return res.status(404).end();
  return res.json({ period: o.period, payload: o.payload });
}));

// --- Firmas ---
router.get('/firmas', STAFF, asyncHandler(async (req, res) => res.json((await boletin.listSignatures()).map((p) => ({ path: p, name: p.slice(p.lastIndexOf('/') + 1) })))));

router.post('/firmas/upload', STAFF, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file || !req.file.size) throw new HttpError(400, 'Archivo vacío');
  if (!sniffImage(req.file.buffer)) throw new HttpError(400, 'Solo se permiten imágenes');
  const p = await boletin.saveSignature(req.file.buffer);
  res.json({ path: p, name: p.slice(p.lastIndexOf('/') + 1) });
}));

// --- Archivos generados (ADMIN) ---
const ADMIN = requireRole('ADMIN');

router.get('/generados', ADMIN, asyncHandler(async (req, res) => {
  need(req.query, 'grade', 'classroom');
  const { grade, classroom } = req.query;
  const folder = salonFolder(grade, classroom);
  const periodos = req.query.period ? [toInt(req.query.period)] : [1, 2, 3, 4];
  const out = [];
  for (const p of periodos) {
    for (const e of await files.list(`boletines/Periodo ${p}/${folder}`)) {
      if (e.isDir || !e.name.toLowerCase().endsWith('.pdf')) continue;
      out.push({ fileName: e.name, period: p, grade, classroom, sizeBytes: e.size, generatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : '' });
    }
  }
  out.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  res.json(out);
}));

router.get('/generados/descargar', ADMIN, asyncHandler(async (req, res) => {
  need(req.query, 'period', 'grade', 'classroom', 'fileName');
  const fileName = String(req.query.fileName);
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return res.status(404).end();
  const bytes = await files.get(`boletines/Periodo ${toInt(req.query.period)}/${salonFolder(req.query.grade, req.query.classroom)}/${fileName}`);
  if (!bytes) return res.status(404).end();
  return safeSend(res, bytes, fileName);
}));

router.get('/generados/salones', ADMIN, asyncHandler(async (req, res) => {
  const set = new Set();
  for (const p of (await files.list('boletines')).filter((e) => e.isDir)) {
    for (const s of (await files.list(`boletines/${p.name}`)).filter((e) => e.isDir)) set.add(s.name);
  }
  res.json([...set].sort());
}));

// --- Padres: mis boletines ---
async function activeChildren(req) {
  if (!req.user.role || req.user.role.name !== 'PARENT') throw new HttpError(403, 'Solo disponible para cuentas de padre de familia');
  return (await students.findByParentId(req.user.id)).filter((s) => s.active);
}

router.get('/mis-boletines', asyncHandler(async (req, res) => {
  const out = [];
  for (const h of await activeChildren(req)) {
    for (const item of await boletin.listGeneratedForStudent(h)) {
      out.push({ ...item, studentId: h.id, studentName: `${h.name} ${h.surname}`.trim(), grade: h.grade, classroom: h.classGroup });
    }
  }
  out.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
  res.json(out);
}));

router.get('/mis-boletines/:studentId/descargar', asyncHandler(async (req, res) => {
  const hijo = (await activeChildren(req)).find((s) => s.id === Number(req.params.studentId));
  if (!hijo) return res.status(403).json({ error: 'No tienes acceso a este boletín' });
  const period = toInt(req.query.period);
  if (!period || period < 1 || period > 4) throw new HttpError(400, 'period inválido');
  const bytes = await boletin.readGeneratedFile(hijo, period);
  if (!bytes) return res.status(404).end();
  return safeSend(res, bytes, `boletin_${hijo.name}_${hijo.surname}_P${period}.pdf`);
}));

module.exports = router;
