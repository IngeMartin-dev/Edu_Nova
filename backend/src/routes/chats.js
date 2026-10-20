'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query, one, exec } = require('../config/db');
const { asyncHandler, HttpError, numericParams } = require('../utils/http');
const { requireRole } = require('../middleware/auth');
const { memory, sniffImage } = require('../middleware/upload');
const { dirs, ensure } = require('../config/storage');
const { nowSql } = require('../utils/dates');
const push = require('../services/push');

const router = express.Router();
numericParams(router, ['otherUserId']);
router.use(requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO', 'PARENT'));

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const MAX_FILE = 15 * 1024 * 1024;
const upload = memory(15);
const STAFF = ['ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'];
const isStaff = (r) => STAFF.includes(String(r || '').toUpperCase());
const isParent = (r) => String(r || '').toUpperCase() === 'PARENT';
const roleOf = (u) => (u && u.role ? u.role.name : null);

/** El usuario solo actúa en su nombre; el ADMIN puede actuar por otros. */
const validUser = (req, claimedId) => req.user.isAdmin || req.user.id === Number(claimedId);
const forbidden = (res) => res.status(403).json({ error: 'No autorizado' });

function pairAllowed(senderRole, receiverRole) {
  if (!senderRole || !receiverRole) return false;
  return (isStaff(senderRole) && isStaff(receiverRole)) || (isStaff(senderRole) && isParent(receiverRole)) || (isParent(senderRole) && isStaff(receiverRole));
}

function parseType(raw) {
  const t = String(raw || 'TEXT').toUpperCase();
  return ['TEXT', 'IMAGE', 'FILE', 'GIF', 'STICKER'].includes(t) ? t : 'TEXT';
}

function previewOf(m) {
  switch (m.messageType) {
    case 'IMAGE': return '📷 Foto';
    case 'FILE': return `📎 ${m.fileName || 'Archivo'}`;
    case 'GIF': return 'GIF';
    case 'STICKER': return 'Sticker';
    default: return m.content;
  }
}

const MSG_SELECT = `SELECT m.*, s.name AS s_name, s.surname AS s_surname FROM chat_messages m JOIN users s ON s.id = m.sender_id`;
const toDto = (m) => ({
  id: m.id, senderId: m.senderId, senderName: `${m.sName || ''} ${m.sSurname || ''}`.trim(), receiverId: m.receiverId,
  type: m.messageType, content: m.content, fileUrl: m.fileUrl ?? null, fileName: m.fileName ?? null,
  createdAt: m.createdAt, read: Boolean(m.readAt),
});

const conversation = (a, b, since = null) => query(
  `${MSG_SELECT} WHERE m.deleted_for_all = 0 AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
   ${since ? 'AND m.created_at > ?' : ''} ORDER BY m.created_at ASC, m.id ASC`,
  since ? [a, b, b, a, since] : [a, b, b, a]);

async function contactsForParent(parentId) {
  const map = new Map();
  const base = 'u.id, u.name, u.surname, u.profile_picture, r.name AS role_name';
  for (const u of await query(`SELECT ${base} FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'ADMIN'`)) map.set(u.id, u);
  const children = await query('SELECT s.grade, s.class_group FROM students s JOIN student_parents sp ON sp.student_id = s.id WHERE sp.user_id = ?', [parentId]);
  for (const c of children) {
    const n = parseInt(String(c.grade || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (n > 0) {
      for (const u of await query(
        `SELECT ${base} FROM subjects sb JOIN users u ON u.id = sb.teacher_id LEFT JOIN roles r ON r.id = u.role_id
          WHERE sb.grade_min <= ? AND sb.grade_max >= ?`, [n, n])) map.set(u.id, u);
    }
    if (c.grade && c.classGroup) {
      for (const u of await query(
        `SELECT ${base} FROM homeroom_assignments h JOIN users u ON u.id = h.user_id LEFT JOIN roles r ON r.id = u.role_id
          WHERE h.grade = ? AND h.classroom = ?`, [c.grade, c.classGroup])) map.set(u.id, u);
    }
  }
  return [...map.values()];
}

// GET /api/chats/contacts?currentUserId=
router.get('/contacts', asyncHandler(async (req, res) => {
  const me = Number(req.query.currentUserId);
  if (!Number.isInteger(me) || !validUser(req, me)) return forbidden(res);
  const meRow = await one('SELECT r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [me]);
  let users;
  if (meRow && isParent(meRow.roleName)) users = await contactsForParent(me);
  else {
    const wrote = new Set((await query('SELECT DISTINCT sender_id FROM chat_messages WHERE receiver_id = ?', [me])).map((r) => r.senderId));
    users = (await query(
      `SELECT u.id, u.name, u.surname, u.profile_picture, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id`
    )).filter((u) => isStaff(u.roleName) || (isParent(u.roleName) && wrote.has(u.id)));
  }
  users = users.filter((u) => u.id !== me).sort((a, b) =>
    String(a.surname || '').toLowerCase().localeCompare(String(b.surname || '').toLowerCase()) || String(a.name || '').toLowerCase().localeCompare(String(b.name || '').toLowerCase()));

  const out = [];
  for (const u of users) {
    const conv = await conversation(me, u.id);
    const last = conv[conv.length - 1];
    const unread = (await one('SELECT COUNT(*) AS c FROM chat_messages WHERE receiver_id = ? AND sender_id = ? AND read_at IS NULL AND deleted_for_all = 0', [me, u.id])).c;
    out.push({
      id: u.id, name: u.name, surname: u.surname, profilePicture: u.profilePicture ?? null, role: u.roleName,
      lastMessage: last ? previewOf(last) : null, lastMessageAt: last ? last.createdAt : null, unreadCount: unread,
    });
  }
  out.sort((a, b) => (a.lastMessageAt === null && b.lastMessageAt === null ? 0 : a.lastMessageAt === null ? 1 : b.lastMessageAt === null ? -1 : String(b.lastMessageAt).localeCompare(String(a.lastMessageAt))));
  res.json(out);
}));

router.get('/conversation/:otherUserId', asyncHandler(async (req, res) => {
  const me = Number(req.query.currentUserId);
  if (!Number.isInteger(me) || !validUser(req, me)) return forbidden(res);
  res.json((await conversation(me, Number(req.params.otherUserId))).map(toDto));
}));

router.get('/conversation/:otherUserId/nuevos', asyncHandler(async (req, res) => {
  const me = Number(req.query.currentUserId);
  if (!Number.isInteger(me) || !validUser(req, me)) return forbidden(res);
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(String(req.query.since || ''));
  if (!m) return res.status(400).json({ error: 'Formato de fecha inválido' });
  res.json((await conversation(me, Number(req.params.otherUserId), `${m[1]} ${m[2]}`)).map(toDto));
}));

async function loadPair(senderId, receiverId) {
  const q = 'SELECT u.id, u.name, u.surname, r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?';
  const sender = await one(q, [senderId]);
  const receiver = await one(q, [receiverId]);
  if (!sender) throw new HttpError(400, 'Remitente no encontrado');
  if (!receiver) throw new HttpError(400, 'Destinatario no encontrado');
  return { sender, receiver };
}

async function saveAndNotify(sender, receiver, fields) {
  const r = await exec(
    `INSERT INTO chat_messages (sender_id, receiver_id, message_type, content, file_url, file_name, created_at, deleted_for_all)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [sender.id, receiver.id, fields.type, fields.content, fields.fileUrl || null, fields.fileName || null, nowSql()]);
  const saved = (await query(`${MSG_SELECT} WHERE m.id = ?`, [r.insertId]))[0];
  push.sendToUser(receiver.id, `${sender.name || ''} ${sender.surname || ''}`.trim(), previewOf(saved), 'CHAT_MESSAGE').catch(() => {});
  return toDto(saved);
}

// POST /api/chats/messages
router.post('/messages', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const receiverId = Number(b.receiverId);
  if (!Number.isInteger(receiverId)) throw new HttpError(400, 'receiverId inválido');
  if (typeof b.content !== 'string' || !b.content.trim()) throw new HttpError(400, 'El mensaje no puede estar vacío');
  if (b.content.length > 5000) throw new HttpError(400, 'El mensaje es demasiado largo');
  const { sender, receiver } = await loadPair(req.user.id, receiverId);
  if (!pairAllowed(sender.roleName, receiver.roleName)) return res.status(403).json({ error: 'No se puede enviar mensajes a este usuario' });
  res.json(await saveAndNotify(sender, receiver, { type: parseType(b.type), content: b.content.trim() }));
}));

// POST /api/chats/messages/adjunto  (multipart: senderId, receiverId, type, file)
router.post('/messages/adjunto', upload.single('file'), asyncHandler(async (req, res) => {
  const senderId = Number(req.body.senderId);
  const receiverId = Number(req.body.receiverId);
  if (!Number.isInteger(senderId) || !Number.isInteger(receiverId)) throw new HttpError(400, 'senderId o receiverId inválido');
  if (!validUser(req, senderId)) return forbidden(res);
  const f = req.file;
  if (!f || !f.size) throw new HttpError(400, 'Archivo vacío');
  if (f.size > MAX_FILE) throw new HttpError(400, 'El archivo supera el máximo de 15 MB');

  const original = path.basename(f.originalname || 'archivo');
  const ext = (original.includes('.') ? original.split('.').pop() : '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new HttpError(400, `Tipo de archivo no permitido: ${ext}`);
  if (IMAGE_EXT.has(ext) && !sniffImage(f.buffer)) throw new HttpError(400, 'El archivo no es una imagen válida');
  if (ext === 'pdf' && f.buffer.slice(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, 'El archivo no es un PDF válido');

  const { sender, receiver } = await loadPair(senderId, receiverId);
  if (!pairAllowed(sender.roleName, receiver.roleName)) return res.status(403).json({ error: 'No se puede enviar mensajes a este usuario' });

  ensure(dirs.chat);
  const safeName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dirs.chat, safeName), f.buffer);
  await require('../services/fileVault').persist(path.join(dirs.chat, safeName), f.buffer);
  const type = parseType(req.body.type);
  const content = type === 'IMAGE' ? '📷 Foto' : type === 'GIF' ? 'GIF' : type === 'STICKER' ? 'Sticker' : `📎 ${original}`;
  res.json(await saveAndNotify(sender, receiver, { type, content, fileUrl: `/uploads/chat/${safeName}`, fileName: original }));
}));

router.put('/conversation/:otherUserId/leido', asyncHandler(async (req, res) => {
  const me = Number(req.query.currentUserId);
  if (!Number.isInteger(me) || !validUser(req, me)) return forbidden(res);
  const r = await exec('UPDATE chat_messages SET read_at = ? WHERE receiver_id = ? AND sender_id = ? AND read_at IS NULL AND deleted_for_all = 0', [nowSql(), me, Number(req.params.otherUserId)]);
  res.json({ marcados: r.affectedRows });
}));

router.get('/no-leidos', asyncHandler(async (req, res) => {
  const me = Number(req.query.currentUserId);
  if (!Number.isInteger(me) || !validUser(req, me)) return forbidden(res);
  res.json({ total: (await one('SELECT COUNT(*) AS c FROM chat_messages WHERE receiver_id = ? AND read_at IS NULL AND deleted_for_all = 0', [me])).c });
}));

module.exports = router;
