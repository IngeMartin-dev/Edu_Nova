'use strict';
const express = require('express');
const { exec, query } = require('../config/db');
const { asyncHandler, HttpError, numericParams } = require('../utils/http');
const { requireAuth, requireRole, requireAdminOrSelf } = require('../middleware/auth');
const notifications = require('../services/notifications');
const push = require('../services/push');
const env = require('../config/env');

const router = express.Router();
numericParams(router);
router.use(requireAuth);

// GET /api/notifications/user/:userId
router.get('/user/:userId', requireAdminOrSelf('userId'), asyncHandler(async (req, res) => {
  res.json(await notifications.listForUser(Number(req.params.userId)));
}));

// POST /api/notifications/:id/read
router.post('/:id/read', asyncHandler(async (req, res) => {
  const n = await notifications.findById(Number(req.params.id));
  if (!n) return res.status(404).end();
  if (!req.user.isAdmin && n.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'No puedes modificar esta notificación' });
  }
  await exec('UPDATE notifications SET is_read = 1 WHERE id = ?', [n.id]);
  return res.json({ success: true, message: 'Notification marked as read' });
}));

// DELETE /api/notifications/user/:userId
router.delete('/user/:userId', requireAdminOrSelf('userId'), asyncHandler(async (req, res) => {
  await exec('DELETE FROM notifications WHERE user_id = ?', [Number(req.params.userId)]);
  res.json({ success: true, message: 'All notifications deleted' });
}));

// POST /api/notifications/send  (ADMIN)
router.post('/send', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { title, message, type } = req.body || {};
  if (!title || !message) return res.status(400).json({ success: false, message: 'title y message son obligatorios' });
  const recipientType = (req.body || {}).recipientType || 'ALL';
  const t = type || 'GENERAL';
  switch (recipientType) {
    case 'PARENTS': await notifications.sendNotificationByRole('PARENT', title, message, t); break;
    case 'TEACHERS': await notifications.sendNotificationByRole('TEACHER', title, message, t); break;
    case 'ADMINISTRATORS': await notifications.sendNotificationByRole('ADMIN', title, message, t); break;
    default: await notifications.sendNotificationToAll(title, message, t);
  }
  res.json({ success: true, message: 'Notificación enviada exitosamente' });
}));

// POST /api/notifications/reply
router.post('/reply', asyncHandler(async (req, res) => {
  const { originalNotificationId, replyMessage } = req.body || {};
  if (!originalNotificationId || !replyMessage) {
    return res.status(400).json({ success: false, message: 'Faltan campos requeridos: originalNotificationId, replyMessage' });
  }
  const orig = await notifications.findById(Number(originalNotificationId));
  if (!orig) return res.status(400).json({ success: false, message: 'Notificación original no encontrada' });
  if (!req.user.isAdmin && orig.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'No puedes responder a esta notificación' });
  }
  await notifications.sendNotification(
    orig.userId,
    `Respuesta a: ${orig.title}`,
    `Mensaje original:\n${orig.message}\n\nRespuesta:\n${replyMessage}`,
    'NOTIFICATION_REPLY'
  );
  return res.json({ success: true, message: 'Respuesta enviada exitosamente' });
}));

// GET /api/notifications/push-config  (configuración pública para registrar el push en el navegador)
router.get('/push-config', (req, res) => {
  if (!env.firebase.webReady) return res.json({ enabled: false });
  return res.json({ enabled: true, config: env.firebase.web, vapidKey: env.firebase.vapidKey });
});

// POST /api/notifications/push-test  (envía una notificación de prueba a los dispositivos del usuario)
router.post('/push-test', asyncHandler(async (req, res) => {
  if (!env.firebase.enabled) throw new HttpError(503, 'El push no está activado (FIREBASE_ENABLED=true en backend/.env)');
  const rows = await query('SELECT id FROM fcm_tokens WHERE user_id = ? AND is_active = 1', [req.user.id]);
  if (!rows.length) throw new HttpError(409, 'Este usuario no tiene dispositivos registrados. Acepta el permiso de notificaciones y vuelve a entrar.');
  await push.sendToUser(req.user.id, 'EduNova', 'Notificación de prueba: el push funciona ✔', 'TEST');
  return res.json({ success: true, devices: rows.length });
}));

// POST /api/notifications/fcm-token
router.post('/fcm-token', asyncHandler(async (req, res) => {
  const { token, deviceType, deviceName } = req.body || {};
  if (!token) return res.status(400).json({ success: false, message: 'Token FCM es requerido' });
  await push.saveToken(req.user.id, token, deviceType, deviceName);
  return res.json({ success: true, message: 'Token FCM guardado exitosamente' });
}));

// DELETE /api/notifications/fcm-token/user/:userId
router.delete('/fcm-token/user/:userId', requireAdminOrSelf('userId'), asyncHandler(async (req, res) => {
  await push.removeAllUserTokens(Number(req.params.userId));
  res.json({ success: true, message: 'Tokens FCM eliminados exitosamente' });
}));

// GET /api/notifications/fcm-token/count  (ADMIN)
router.get('/fcm-token/count', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  res.json({ success: true, count: await push.activeTokenCount() });
}));

module.exports = router;