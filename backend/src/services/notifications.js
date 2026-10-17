'use strict';
const { query, one, exec } = require('../config/db');
const { nowSql } = require('../utils/dates');
const push = require('./push');

/** Crea una notificación en la plataforma (tabla notifications) y, si hay Firebase, un push. */
async function sendNotification(userId, title, message, type) {
  if (!userId) return null;
  const res = await exec(
    'INSERT INTO notifications (user_id, title, message, created_at, is_read, notification_type) VALUES (?, ?, ?, ?, 0, ?)',
    [userId, title, message, nowSql(), type || null]
  );
  push.sendToUser(userId, title, message, `NOTIFICATION_${res.insertId}`).catch(() => {});
  return res.insertId;
}

async function sendNotificationByRole(roleName, title, message, type) {
  const users = await query(
    'SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = ?',
    [roleName]
  );
  for (const u of users) await sendNotification(u.id, title, message, type);
}

const notifyAdmins = (title, message, type) => sendNotificationByRole('ADMIN', title, message, type);

async function notifyParentsOfStudent(studentId, title, message, type) {
  const parents = await query('SELECT user_id FROM student_parents WHERE student_id = ?', [studentId]);
  for (const p of parents) await sendNotification(p.userId, title, message, type);
}

/** A todos los usuarios que tengan un rol asignado. */
async function sendNotificationToAll(title, message, type) {
  const users = await query('SELECT id FROM users WHERE role_id IS NOT NULL');
  for (const u of users) await sendNotification(u.id, title, message, type);
}

async function notifyReportCardSent(parentId, studentName) {
  return sendNotification(
    parentId,
    'Boletín Disponible',
    `El boletín de ${studentName} está disponible para su revisión y firma.`,
    'REPORT_CARD_SENT'
  );
}

async function notifyReportCardSigned(teacherId, parentName, studentName) {
  return sendNotification(
    teacherId,
    'Boletín Firmado',
    `El acudiente ${parentName} ha firmado el boletín de ${studentName}`,
    'REPORT_CARD_SIGNED'
  );
}

/** Notificación -> JSON del frontend (incluye isRead y read por compatibilidad). */
function toNotificationJson(n) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    createdAt: n.createdAt,
    isRead: Boolean(n.isRead),
    read: Boolean(n.isRead),
    notificationType: n.notificationType,
    user: n.userId
      ? { id: n.userId, name: n.userName, surname: n.userSurname, profilePicture: n.userProfilePicture || null }
      : null,
  };
}

async function listForUser(userId) {
  const rows = await query(
    `SELECT n.id, n.user_id, n.title, n.message, n.created_at, n.is_read, n.notification_type,
            u.name AS user_name, u.surname AS user_surname, u.profile_picture AS user_profile_picture
       FROM notifications n LEFT JOIN users u ON u.id = n.user_id
      WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC`,
    [userId]
  );
  return rows.map(toNotificationJson);
}

const findById = (id) => one('SELECT * FROM notifications WHERE id = ?', [id]);

module.exports = {
  sendNotification,
  sendNotificationByRole,
  notifyAdmins,
  notifyParentsOfStudent,
  sendNotificationToAll,
  notifyReportCardSent,
  notifyReportCardSigned,
  listForUser,
  findById,
};
