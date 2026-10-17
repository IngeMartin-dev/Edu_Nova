'use strict';
const { query, one, exec } = require('../config/db');
const env = require('../config/env');
const { generateRefreshToken } = require('../utils/jwt');
const { nowSql, addDaysSql } = require('../utils/dates');

/** Borra los refresh tokens vencidos. */
const deleteExpired = () => exec('DELETE FROM refresh_tokens WHERE expires_at < ?', [nowSql()]);

async function create(userId, deviceInfo, ipAddress) {
  await deleteExpired();
  const token = generateRefreshToken(userId);
  const res = await exec(
    `INSERT INTO refresh_tokens (token, user_id, expires_at, created_at, device_info, ip_address, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [token, userId, addDaysSql(env.jwt.refreshExpiresDays), nowSql(), deviceInfo || null, ipAddress || null, nowSql()]
  );
  return { id: res.insertId, token };
}

const findByToken = (token) => one('SELECT * FROM refresh_tokens WHERE token = ?', [token]);
const isExpired = (rt) => new Date(String(rt.expiresAt).replace(' ', 'T')) < new Date();

/** Reemplaza SOLO este refresh token (las sesiones de otros dispositivos siguen vivas). */
async function rotate(old, deviceInfo, ipAddress) {
  await exec('DELETE FROM refresh_tokens WHERE id = ?', [old.id]);
  return create(old.userId, deviceInfo || old.deviceInfo, ipAddress || old.ipAddress);
}

const listActiveSessions = (userId) =>
  query('SELECT * FROM refresh_tokens WHERE user_id = ? AND expires_at > ? ORDER BY last_used_at DESC', [userId, nowSql()]);

async function revokeSession(sessionId, userId) {
  const r = await exec('DELETE FROM refresh_tokens WHERE id = ? AND user_id = ?', [sessionId, userId]);
  return r.affectedRows > 0;
}

module.exports = { create, findByToken, isExpired, rotate, listActiveSessions, revokeSession };
