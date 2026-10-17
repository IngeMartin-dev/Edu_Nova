'use strict';
const { query, one } = require('../config/db');

/** SELECT base de usuarios con su rol (alias camelCase vía camelize). */
const USER_SELECT = `
  SELECT u.id, u.name, u.surname, u.username, u.mail AS email, u.password, u.role_id,
         r.name AS role_name, u.digital_signature, u.profile_picture, u.fcm_token,
         u.two_factor_enabled, u.enable, u.terms_accepted_at, u.privacy_accepted_at,
         u.additional_admin
    FROM users u LEFT JOIN roles r ON r.id = u.role_id`;

/** Fila de BD -> JSON de usuario para el frontend (nunca incluye contraseña ni secretos 2FA). */
function toUserJson(row) {
  if (!row) return null;
  const name = row.name || '';
  const surname = row.surname || '';
  return {
    id: row.id,
    name: row.name,
    surname: row.surname,
    username: row.username,
    email: row.email,
    role: row.roleId ? { id: row.roleId, name: row.roleName } : null,
    digitalSignature: row.digitalSignature ?? null,
    profilePicture: row.profilePicture ?? null,
    fcmToken: row.fcmToken ?? null,
    twoFactorEnabled: Boolean(row.twoFactorEnabled),
    enable: row.enable === null || row.enable === undefined ? true : Boolean(row.enable),
    termsAcceptedAt: row.termsAcceptedAt ?? null,
    privacyAcceptedAt: row.privacyAcceptedAt ?? null,
    additionalAdmin: Boolean(row.additionalAdmin),
    fullName: `${name} ${surname}`.trim(),
  };
}

const findUserById = (id) => one(`${USER_SELECT} WHERE u.id = ?`, [id]);
const findUserByUsername = (username) => one(`${USER_SELECT} WHERE u.username = ?`, [username]);
const findUserByEmail = (email) => one(`${USER_SELECT} WHERE u.mail = ?`, [email]);
const findAllUsers = () => query(`${USER_SELECT} ORDER BY u.id`);
const findUsersByRole = (roleName) => query(`${USER_SELECT} WHERE r.name = ? ORDER BY u.id`, [roleName]);

module.exports = { USER_SELECT, toUserJson, findUserById, findUserByUsername, findUserByEmail, findAllUsers, findUsersByRole };
