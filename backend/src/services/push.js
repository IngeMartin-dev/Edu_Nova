'use strict';
/**
 * Notificaciones push con Firebase Cloud Messaging (OPCIONAL).
 * Si FIREBASE_ENABLED no es true (o falta el JSON de la cuenta de servicio),
 * todo funciona igual pero sin push: solo quedan las notificaciones dentro de la plataforma.
 */
const fs = require('fs');
const path = require('path');
const { query, one, exec } = require('../config/db');
const env = require('../config/env');
const { nowSql } = require('../utils/dates');

let messaging = null;
let initTried = false;

function getMessaging() {
  if (messaging || initTried) return messaging;
  initTried = true;
  if (!env.firebase.enabled) return null;
  try {
    const file = path.resolve(__dirname, '../../', env.firebase.serviceAccountFile);
    if (!fs.existsSync(file)) {
      console.warn(`[Push] No existe ${env.firebase.serviceAccountFile}; push desactivado.`);
      return null;
    }
    // eslint-disable-next-line global-require, import/no-unresolved
    const admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(file, 'utf8'))) });
    messaging = admin.messaging();
    console.log('[Push] Firebase Cloud Messaging inicializado.');
  } catch (e) {
    console.warn('[Push] No se pudo inicializar Firebase (¿instalaste firebase-admin?):', e.message);
  }
  return messaging;
}

async function saveToken(userId, token, deviceType, deviceName) {
  const user = await one('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) throw new Error(`Usuario no encontrado: ${userId}`);
  const existing = await one('SELECT id FROM fcm_tokens WHERE token = ?', [token]);
  if (existing) {
    await exec(
      'UPDATE fcm_tokens SET last_used = ?, is_active = 1, device_name = COALESCE(?, device_name) WHERE id = ?',
      [nowSql(), deviceName || null, existing.id]
    );
  } else {
    await exec(
      `INSERT INTO fcm_tokens (user_id, token, device_type, device_name, created_at, last_used, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [userId, token, deviceType || null, deviceName || null, nowSql(), nowSql()]
    );
  }
  // Desactiva tokens viejos del mismo tipo de dispositivo para no duplicar avisos
  if (deviceType) {
    await exec(
      'UPDATE fcm_tokens SET is_active = 0 WHERE user_id = ? AND is_active = 1 AND token <> ? AND device_type = ?',
      [userId, token, deviceType]
    );
  }
}

async function sendOne(token, title, body, dataPayload) {
  const m = getMessaging();
  if (!m) return;
  try {
    await m.send({
      token,
      notification: { title, body },
      android: { priority: 'high', notification: { channelId: 'edunova', sound: 'default', icon: '/img/logo-192.png' } },
      webpush: { notification: { title, body, icon: '/img/logo-192.png' } },
      data: dataPayload ? { type: String(dataPayload), timestamp: String(Date.now()) } : undefined,
    });
  } catch (e) {
    const code = e && e.errorInfo && e.errorInfo.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
      await exec('UPDATE fcm_tokens SET is_active = 0 WHERE token = ?', [token]);
    } else {
      console.warn('[Push] Error enviando push:', e.message);
    }
  }
}

async function sendToUser(userId, title, body, dataPayload) {
  if (!getMessaging()) return;
  const tokens = await query('SELECT token FROM fcm_tokens WHERE user_id = ? AND is_active = 1', [userId]);
  await Promise.all(tokens.map((t) => sendOne(t.token, title, body, dataPayload)));
}

async function sendToRole(roleName, title, body, dataPayload) {
  if (!getMessaging()) return;
  const tokens = await query(
    `SELECT f.token FROM fcm_tokens f JOIN users u ON u.id = f.user_id JOIN roles r ON r.id = u.role_id
      WHERE f.is_active = 1 AND r.name = ?`,
    [roleName]
  );
  await Promise.all(tokens.map((t) => sendOne(t.token, title, body, dataPayload)));
}

async function sendToAll(title, body, dataPayload) {
  if (!getMessaging()) return;
  const tokens = await query('SELECT token FROM fcm_tokens WHERE is_active = 1');
  await Promise.all(tokens.map((t) => sendOne(t.token, title, body, dataPayload)));
}

const removeAllUserTokens = (userId) => exec('DELETE FROM fcm_tokens WHERE user_id = ?', [userId]);
const activeTokenCount = async () => (await one('SELECT COUNT(*) AS c FROM fcm_tokens WHERE is_active = 1')).c;

module.exports = { saveToken, sendToUser, sendToRole, sendToAll, removeAllUserTokens, activeTokenCount };
