'use strict';
const express = require('express');
const { exec, query } = require('../config/db');
const { asyncHandler, numericParams } = require('../utils/http');
const { requireAuth, requireAdminOrSelf } = require('../middleware/auth');
const notifications = require('../services/notifications');

const router = express.Router();
numericParams(router);
router.use(requireAuth);

// GET /api/messages/user/:userId  — respuestas a notificaciones
router.get('/user/:userId', requireAdminOrSelf('userId'), asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT n.id, n.user_id, n.title, n.message, n.created_at, n.is_read, u.name, u.surname
       FROM notifications n LEFT JOIN users u ON u.id = n.user_id
      WHERE n.user_id = ? AND n.notification_type = 'NOTIFICATION_REPLY' ORDER BY n.created_at DESC`,
    [Number(req.params.userId)]
  );
  res.json(rows.map((n) => ({
    id: n.id,
    senderId: n.userId || 0,
    senderName: n.name || '',
    senderSurname: n.surname || '',
    recipientId: 0,
    recipientName: '',
    recipientSurname: '',
    originalNotificationId: 0,
    originalNotificationTitle: n.title,
    replyMessage: n.message,
    createdAt: n.createdAt || '',
    isRead: Boolean(n.isRead),
  })));
}));

// POST /api/messages/:messageId/read
router.post('/:messageId/read', asyncHandler(async (req, res) => {
  const n = await notifications.findById(Number(req.params.messageId));
  if (!n) return res.status(404).end();
  if (!req.user.isAdmin && n.userId !== req.user.id) return res.status(403).json({ error: 'No puedes modificar este mensaje' });
  await exec('UPDATE notifications SET is_read = 1 WHERE id = ?', [n.id]);
  return res.json({ success: true });
}));

module.exports = router;
