'use strict';
const express = require('express');
const { exec, query } = require('../config/db');
const { asyncHandler, HttpError, numericParams } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const { nowSql } = require('../utils/dates');

const router = express.Router();
numericParams(router);
router.use(requireAuth);

router.post('/', asyncHandler(async (req, res) => {
  const message = ((req.body || {}).message || '').toString().trim();
  if (!message) throw new HttpError(400, 'El comentario no puede estar vacío');
  if (message.length > 2000) throw new HttpError(400, 'El comentario no puede superar 2000 caracteres');
  await exec('INSERT INTO feedback (user_id, message, created_at, reviewed) VALUES (?, ?, ?, 0)', [req.user.id, message, nowSql()]);
  res.json({ success: true });
}));

router.get('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT f.id, f.message, f.created_at, f.reviewed, u.name, u.surname, u.mail AS email
       FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.created_at DESC, f.id DESC`
  );
  res.json(rows.map((f) => ({
    id: f.id,
    userName: f.name !== null && f.name !== undefined ? `${f.name} ${f.surname || ''}` : 'Anónimo',
    userEmail: f.email ?? null,
    message: f.message,
    createdAt: f.createdAt,
    reviewed: Boolean(f.reviewed),
  })));
}));

router.put('/:id/reviewed', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const r = await exec('UPDATE feedback SET reviewed = 1 WHERE id = ?', [Number(req.params.id)]);
  if (!r.affectedRows) return res.status(404).json({ error: 'No encontrado' });
  return res.json({ success: true });
}));

module.exports = router;
