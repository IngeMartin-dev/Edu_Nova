'use strict';
const { one, exec, tx } = require('../config/db');
const password = require('../utils/password');
const { HttpError } = require('../utils/http');

function validateNewPassword(p) {
  if (!p || String(p).trim().length < 6) {
    throw new HttpError(400, 'La nueva contraseña debe tener al menos 6 caracteres');
  }
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await one('SELECT id, password FROM users WHERE id = ?', [userId]);
  if (!user) throw new HttpError(400, 'Usuario no encontrado');
  if (!currentPassword) throw new HttpError(400, 'La contraseña actual es obligatoria');
  if (!(await password.matches(currentPassword, user.password))) {
    throw new HttpError(400, 'La contraseña actual es incorrecta');
  }
  validateNewPassword(newPassword);
  await exec('UPDATE users SET password = ? WHERE id = ?', [await password.hash(newPassword), userId]);
}

async function resetPassword(userId, newPassword) {
  const user = await one('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) throw new HttpError(400, 'Usuario no encontrado');
  validateNewPassword(newPassword);
  await exec('UPDATE users SET password = ? WHERE id = ?', [await password.hash(newPassword), userId]);
}

/**
 * Elimina un usuario limpiando antes todo lo que lo referencia
 * (mismo orden y criterio que el backend original).
 */
async function deleteUserCascade(userId) {
  await tx(async (c) => {
    const run = (sql) => exec(sql, [userId], c);
    await run('DELETE FROM student_parents WHERE user_id = ?');
    await run('DELETE FROM fcm_tokens WHERE user_id = ?');
    await run('DELETE FROM refresh_tokens WHERE user_id = ?');
    await run('DELETE FROM notifications WHERE user_id = ?');
    await run('DELETE FROM parent_classes WHERE user_id = ?');
    await run('UPDATE homeroom_assignments SET user_id = NULL WHERE user_id = ?');
    await run('DELETE FROM report_card_history WHERE user_id = ?');
    await run('DELETE FROM digital_signatures WHERE user_id = ?');
    await run('UPDATE report_cards SET teacher_id = NULL WHERE teacher_id = ?');
    await run('UPDATE report_cards SET created_by = NULL WHERE created_by = ?');
    await run('UPDATE subjects SET teacher_id = NULL WHERE teacher_id = ?');
    await run('UPDATE recovery_plans SET teacher_id = NULL WHERE teacher_id = ?');
    await run('UPDATE recovery_data SET teacher_id = NULL WHERE teacher_id = ?');
    await run('UPDATE subject_grades SET teacher_id = NULL WHERE teacher_id = ?');
    await run('DELETE FROM grade_column_configs WHERE teacher_id = ?');
    await exec('DELETE FROM chat_messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId], c);
    await run('UPDATE feedback SET user_id = NULL WHERE user_id = ?');
    await run('DELETE FROM users WHERE id = ?');
  });
}

module.exports = { changePassword, resetPassword, deleteUserCascade };
