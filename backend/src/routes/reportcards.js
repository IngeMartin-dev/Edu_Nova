'use strict';
/** Boletines "heredados" (tabla report_cards) y firmas digitales de acudientes. */
const express = require('express');
const { query, one, exec } = require('../config/db');
const { asyncHandler, HttpError, toInt, numericParams } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowSql } = require('../utils/dates');
const notifications = require('../services/notifications');
const { sendMail } = require('../services/mailer');
const boletin = require('../services/boletin');
const students = require('../services/students');
const env = require('../config/env');

const reportCards = express.Router();
const signatures = express.Router();
numericParams(reportCards);
numericParams(signatures, ['reportCardId']);
reportCards.use(requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'));
signatures.use(requireAuth);

const SELECT = `
  SELECT rc.*, s.name AS s_name, s.surname AS s_surname, s.grade AS s_grade, s.class_group AS s_class_group,
         t.name AS t_name, t.surname AS t_surname, c.name AS c_name, c.surname AS c_surname
    FROM report_cards rc
    LEFT JOIN students s ON s.id = rc.student_id
    LEFT JOIN users t ON t.id = rc.teacher_id
    LEFT JOIN users c ON c.id = rc.created_by`;

const toJson = (r, sigs = []) => ({
  id: r.id,
  student: r.studentId ? { id: r.studentId, name: r.sName, surname: r.sSurname, grade: r.sGrade, classGroup: r.sClassGroup ?? null } : null,
  academicPeriod: r.academicPeriod, grades: r.grades, comments: r.comments, difficulties: r.difficulties, lostAreas: r.lostAreas,
  pdfUrl: r.pdfUrl, createdAt: r.createdAt, sentAt: r.sentAt ?? null,
  teacher: r.teacherId ? { id: r.teacherId, name: r.tName, surname: r.tSurname } : null,
  homeroomTeacher: r.homeroomTeacher,
  createdBy: r.createdBy ? { id: r.createdBy, name: r.cName, surname: r.cSurname } : null,
  signed: Boolean(r.isSigned), isSigned: Boolean(r.isSigned), signatureDate: r.signatureDate ?? null,
  principalSignature: r.principalSignature ?? null, digitalSignatures: sigs,
});

async function sigsOf(id) {
  return (await query('SELECT id, user_id, student_id, signed_at, ip_address FROM digital_signatures WHERE report_card_id = ?', [id]))
    .map((s) => ({ id: s.id, userId: s.userId, studentId: s.studentId, signedAt: s.signedAt, ipAddress: s.ipAddress }));
}
async function find(id) {
  const r = await one(`${SELECT} WHERE rc.id = ?`, [id]);
  return r ? toJson(r, await sigsOf(id)) : null;
}
async function logHistory(reportCardId, type, description, userId = null) {
  await exec('INSERT INTO report_card_history (report_card_id, event_type, event_description, event_date, user_id) VALUES (?, ?, ?, ?, ?)',
    [reportCardId, type, description, nowSql(), userId]);
}
const idOf = (obj, flat) => toInt((obj && obj.id) ?? flat);
const text = (v) => (v === undefined || v === null ? null : typeof v === 'string' ? v : JSON.stringify(v));

async function save(b, id = null) {
  const studentId = idOf(b.student, b.studentId);
  if (!studentId || !(await one('SELECT id FROM students WHERE id = ?', [studentId]))) throw new HttpError(400, 'Estudiante no encontrado');
  const vals = [studentId, b.academicPeriod ?? null, text(b.grades), text(b.comments), text(b.difficulties), text(b.lostAreas), b.pdfUrl ?? null,
    idOf(b.teacher, b.teacherId), b.homeroomTeacher ?? null, idOf(b.createdBy, b.createdById), b.principalSignature ?? null];
  if (id) {
    await exec(`UPDATE report_cards SET student_id = ?, academic_period = ?, grades = ?, comments = ?, difficulties = ?, lost_areas = ?, pdf_url = ?,
                teacher_id = ?, homeroom_teacher = ?, created_by = ?, principal_signature = ? WHERE id = ?`, [...vals, id]);
    return id;
  }
  const r = await exec(`INSERT INTO report_cards (student_id, academic_period, grades, comments, difficulties, lost_areas, pdf_url, teacher_id, homeroom_teacher,
                        created_by, principal_signature, created_at, is_signed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`, [...vals, nowSql()]);
  await logHistory(r.insertId, 'CREATED', 'Boletín creado');
  return r.insertId;
}

reportCards.get('/', asyncHandler(async (req, res) => res.json(await Promise.all((await query(`${SELECT} ORDER BY rc.id`)).map(async (r) => toJson(r, await sigsOf(r.id)))))));
reportCards.get('/:id', asyncHandler(async (req, res) => { const rc = await find(req.params.id); return rc ? res.json(rc) : res.status(404).end(); }));
reportCards.post('/', asyncHandler(async (req, res) => res.json(await find(await save(req.body || {})))));
reportCards.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await find(id))) return res.status(404).end();
  return res.json(await find(await save(req.body || {}, id)));
}));
reportCards.delete('/:id', asyncHandler(async (req, res) => { await exec('DELETE FROM report_cards WHERE id = ?', [Number(req.params.id)]); res.json({ deleted: Number(req.params.id) }); }));

/** PDF del boletín del período (el generado con /api/boletines), si existe. */
async function pdfOf(rc) {
  const student = rc.student && (await students.findById(rc.student.id));
  const period = toInt(String(rc.academicPeriod || '').replace(/[^0-9]/g, ''));
  return student && period ? await boletin.readGeneratedFile(student, period) : null;
}

reportCards.post('/:id/send', asyncHandler(async (req, res) => {
  const rc = await find(Number(req.params.id));
  if (!rc) return res.status(404).end();
  const pdf = await pdfOf(rc);
  const parents = (await students.parentsByStudent([rc.student.id])).get(rc.student.id) || [];
  for (const p of parents) {
    await sendMail({
      to: p.email, subject: `Boletín de Calificaciones - ${rc.student.name}`,
      text: `Estimado/a ${p.name},\n\n${pdf ? 'Adjunto encontrará' : 'Ya está disponible'} el boletín de calificaciones de su hijo/a.\n\n${env.institution.name}`,
      attachments: pdf ? [{ filename: 'boletin.pdf', content: pdf }] : [],
    });
    await notifications.notifyReportCardSent(p.id, rc.student.name);
  }
  await exec('UPDATE report_cards SET sent_at = ? WHERE id = ?', [nowSql(), rc.id]);
  await logHistory(rc.id, 'SENT', 'Boletín enviado por email a los padres', req.user.id);
  res.json({ sent: true });
}));

async function signCard(rc, user, signatureData, ip) {
  const parents = (await students.parentsByStudent([rc.student.id])).get(rc.student.id) || [];
  if (!parents.some((p) => p.id === user.id)) throw new HttpError(400, 'No tiene permiso para firmar este boletín');
  if (typeof signatureData !== 'string' || !signatureData.length || signatureData.length > 2_000_000) throw new HttpError(400, 'Firma inválida');
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(signatureData) && !/^[A-Za-z0-9+/=]+$/.test(signatureData)) throw new HttpError(400, 'Formato de firma inválido');
  const existing = await one('SELECT id FROM digital_signatures WHERE report_card_id = ? AND user_id = ?', [rc.id, user.id]);
  if (existing) await exec('UPDATE digital_signatures SET signature_data = ?, signed_at = ?, ip_address = ? WHERE id = ?', [signatureData, nowSql(), ip, existing.id]);
  else await exec('INSERT INTO digital_signatures (report_card_id, user_id, student_id, signature_data, signed_at, ip_address) VALUES (?, ?, ?, ?, ?, ?)', [rc.id, user.id, rc.student.id, signatureData, nowSql(), ip]);
  await exec('UPDATE report_cards SET is_signed = 1, signature_date = ? WHERE id = ?', [nowSql(), rc.id]);
  const fullName = `${user.name || ''} ${user.surname || ''}`.trim();
  await logHistory(rc.id, 'SIGNED', `Boletín firmado por ${fullName}`, user.id);
  const notify = (rc.createdBy && rc.createdBy.id) || (rc.teacher && rc.teacher.id);
  if (notify) await notifications.notifyReportCardSigned(notify, fullName, rc.student.name);
}

// POST /api/reportcards/:id/sign  { signature }
reportCards.post('/:id/sign', asyncHandler(async (req, res) => {
  const rc = await find(Number(req.params.id));
  if (!rc) return res.status(404).end();
  if (!(req.body || {}).signature) return res.status(400).json({ error: 'signature required' });
  await signCard(rc, req.user, req.body.signature, req.ip);
  res.json({ signed: true });
}));

reportCards.get('/:id/history', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT h.*, u.name AS u_name, u.surname AS u_surname FROM report_card_history h LEFT JOIN users u ON u.id = h.user_id
      WHERE h.report_card_id = ? ORDER BY h.event_date DESC, h.id DESC`, [Number(req.params.id)]);
  res.json(rows.map((h) => ({
    id: h.id, eventType: h.eventType, eventDescription: h.eventDescription, eventDate: h.eventDate,
    user: h.userId ? { id: h.userId, name: h.uName, surname: h.uSurname } : null,
  })));
}));

reportCards.get('/:id/status', asyncHandler(async (req, res) => {
  const rc = await find(Number(req.params.id));
  if (!rc) return res.status(404).end();
  res.json({ delivered: rc.sentAt !== null, signed: rc.signed, deliveryDate: rc.sentAt, signatureDate: rc.signatureDate });
}));

const sendPdf = asyncHandler(async (req, res) => {
  const rc = await find(Number(req.params.id));
  if (!rc) return res.status(404).end();
  const pdf = await pdfOf(rc);
  if (!pdf) return res.status(404).json({ error: 'Aún no se ha generado el PDF de este boletín (usa Boletines > Generar).' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="boletin.pdf"');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.send(pdf);
});
reportCards.get('/:id/pdf', sendPdf);
reportCards.get('/:id/print', sendPdf);

// --- /api/signatures ---
// POST /api/signatures/sign/:reportCardId   (signatureData por query o body)
signatures.post('/sign/:reportCardId', asyncHandler(async (req, res) => {
  const rc = await find(Number(req.params.reportCardId));
  if (!rc) return res.status(400).json('Boletín no encontrado');
  const data = req.query.signatureData || (req.body || {}).signatureData;
  try {
    await signCard(rc, req.user, data, req.ip);
  } catch (e) {
    if (e instanceof HttpError) return res.status(400).json(e.message);
    throw e;
  }
  const sig = await one('SELECT * FROM digital_signatures WHERE report_card_id = ? AND user_id = ?', [rc.id, req.user.id]);
  return res.json({ id: sig.id, reportCardId: rc.id, userId: req.user.id, signedAt: sig.signedAt, ipAddress: sig.ipAddress });
}));

signatures.get('/report-card/:reportCardId/status', asyncHandler(async (req, res) => {
  const rc = await find(Number(req.params.reportCardId));
  if (!rc) return res.status(400).json('Boletín no encontrado');
  const parents = (await students.parentsByStudent([rc.student.id])).get(rc.student.id) || [];
  const signed = Boolean(await one('SELECT id FROM digital_signatures WHERE report_card_id = ? AND user_id = ?', [rc.id, req.user.id]));
  const count = (await one('SELECT COUNT(*) AS c FROM digital_signatures WHERE report_card_id = ?', [rc.id])).c;
  res.json({ signed, signatureCount: count, canSign: parents.some((p) => p.id === req.user.id) });
}));

module.exports = { reportCards, signatures };
