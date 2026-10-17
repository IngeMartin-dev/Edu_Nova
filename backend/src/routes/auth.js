'use strict';
const express = require('express');
const { one, exec } = require('../config/db');
const { asyncHandler, HttpError, sanitizeForLog, EMAIL_RE, numericParams } = require('../utils/http');
const password = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const bruteForce = require('../utils/bruteForce');
const { requireAuth } = require('../middleware/auth');
const refreshTokens = require('../services/refreshTokens');
const twoFactor = require('../services/twoFactor');
const { nowSql } = require('../utils/dates');
const { findUserByUsername, findUserByEmail, findUserById } = require('../services/userMapper');

const router = express.Router();
numericParams(router);

/** "Chrome en Windows" a partir del User-Agent (para la lista de sesiones activas). */
function describeDevice(req) {
  const ua = req.get('User-Agent');
  if (!ua) return 'Dispositivo desconocido';
  let browser = 'Navegador';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/')) browser = 'Safari';
  let os = 'Desconocido';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  return `${browser} en ${os}`;
}

const clientIp = (req) => req.ip || req.socket.remoteAddress || null;

/** "juan.perez@gmail.com" -> "ju***@gmail.com" */
function maskEmail(email) {
  if (!email || !email.includes('@')) return 'tu correo registrado';
  const [local, domain] = email.split('@');
  return `${local.length <= 2 ? local : local.slice(0, 2)}***@${domain}`;
}

function blockedResponse(res, key) {
  const remaining = bruteForce.remainingLockoutSeconds(key);
  return res.status(423).json({
    error: `Has sido bloqueado por ${Math.floor(remaining / 60)} minutos. Intenta más tarde.`,
    blocked: true,
    remainingSeconds: remaining,
  });
}

async function issueSession(user, req) {
  const rt = await refreshTokens.create(user.id, describeDevice(req), clientIp(req));
  return { token: generateToken(user.id), refreshToken: rt.token, role: user.roleName || 'USER' };
}

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password: pass } = req.body || {};
  if (!username || !String(username).trim() || !pass || !String(pass).trim()) {
    throw new HttpError(400, 'username y password son requeridos');
  }
  const key = String(username);
  if (bruteForce.isBlocked(key)) return blockedResponse(res, key);

  console.log('Intento de login para username:', sanitizeForLog(username));
  const user = (await findUserByUsername(key)) || (await findUserByEmail(key));

  if (!user) {
    await password.burnTime(pass);
    bruteForce.recordFailedAttempt(key);
    if (bruteForce.isBlocked(key)) return blockedResponse(res, key);
    return res.status(401).json({ error: 'Usuario o contraseña incorrecto. Intente de nuevo.' });
  }

  const ok = await password.matches(pass, user.password);
  if (!ok) {
    bruteForce.recordFailedAttempt(key);
    if (bruteForce.isBlocked(key)) return blockedResponse(res, key);
    return res.status(401).json({ error: 'Usuario o contraseña incorrecto. Intente de nuevo.' });
  }
  if (user.enable === false) {
    return res.status(403).json({ error: 'Tu cuenta está deshabilitada. Contacta al administrador.' });
  }

  bruteForce.recordSuccessfulLogin(key);

  // 2FA: no se entregan tokens todavía; se manda un código al correo.
  if (user.twoFactorEnabled) {
    const sent = await twoFactor.generateAndSend(
      user,
      'Código de verificación',
      'Ingresa este código para completar tu inicio de sesión:'
    );
    if (!sent) {
      return res.status(500).json({
        error: twoFactor.getLastError() ||
          'No se pudo enviar el código de verificación a tu correo. Contacta a soporte si el problema persiste.',
      });
    }
    return res.json({ twoFactorRequired: true, userId: user.id, emailHint: maskEmail(user.email) });
  }

  return res.json(await issueSession(user, req));
}));

// POST /api/auth/register  (autoregistro público: SIEMPRE rol PARENT)
router.post('/register', asyncHandler(async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim();
  const email = String(b.email || '').trim();
  const pass = String(b.password || '');
  if (username.length < 3 || username.length > 100) throw new HttpError(400, 'El usuario debe tener entre 3 y 100 caracteres');
  if (!EMAIL_RE.test(email) || email.length > 200) throw new HttpError(400, 'El correo no tiene un formato válido');
  if (pass.length < 6 || pass.length > 255) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
  if ((b.name && String(b.name).length > 100) || (b.surname && String(b.surname).length > 100)) {
    throw new HttpError(400, 'Nombre o apellido demasiado largo');
  }
  if (await findUserByUsername(username)) throw new HttpError(400, 'username already in use');
  if (await findUserByEmail(email)) throw new HttpError(400, 'email already in use');

  const role = await one("SELECT id FROM roles WHERE name = 'PARENT'");
  if (!role) throw new HttpError(500, 'Ocurrió un error interno');

  const r = await exec(
    `INSERT INTO users (name, surname, username, mail, password, role_id, enable, additional_admin, two_factor_enabled)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0)`,
    [b.name || null, b.surname || null, username, email, await password.hash(pass), role.id]
  );
  const rt = await refreshTokens.create(r.insertId, describeDevice(req), clientIp(req));
  res.json({ token: generateToken(r.insertId), refreshToken: rt.token, userId: r.insertId });
}));

// GET /api/auth/me
router.get('/me', (req, res) => {
  const u = req.user;
  if (!u) return res.status(401).json({ error: 'Not authenticated' });
  return res.json({
    id: u.id,
    name: u.name || '',
    surname: u.surname || '',
    email: u.email || '',
    username: u.username || '',
    profilePicture: u.profilePicture || '',
    role: u.role || { name: 'USER' },
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    additionalAdmin: Boolean(u.additionalAdmin),
    termsAcceptedAt: u.termsAcceptedAt || null,
    privacyAcceptedAt: u.privacyAcceptedAt || null,
  });
});

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const str = (req.body || {}).refreshToken;
  if (!str) return res.status(401).json({ error: 'Refresh token is required' });
  const rt = await refreshTokens.findByToken(str);
  if (!rt) return res.status(401).json({ error: 'Invalid refresh token' });
  if (refreshTokens.isExpired(rt)) return res.status(401).json({ error: 'Refresh token expired' });

  const user = await findUserById(rt.userId);
  if (!user) return res.status(401).json({ error: 'Invalid refresh token' });
  const rotated = await refreshTokens.rotate(rt, describeDevice(req), clientIp(req));
  return res.json({ token: generateToken(user.id), refreshToken: rotated.token, role: user.roleName || 'USER' });
}));

// GET /api/auth/sessions
router.get('/sessions', requireAuth, asyncHandler(async (req, res) => {
  const current = req.query.currentRefreshToken;
  const sessions = await refreshTokens.listActiveSessions(req.user.id);
  res.json(sessions.map((s) => ({
    id: s.id,
    device: s.deviceInfo || 'Dispositivo desconocido',
    ipAddress: s.ipAddress,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    current: Boolean(current) && current === s.token,
  })));
}));

// DELETE /api/auth/sessions/:id
router.delete('/sessions/:id', requireAuth, asyncHandler(async (req, res) => {
  const ok = await refreshTokens.revokeSession(Number(req.params.id), req.user.id);
  if (!ok) throw new HttpError(404, 'Sesión no encontrada');
  res.json({ success: true });
}));

// POST /api/auth/accept-legal
router.post('/accept-legal', requireAuth, asyncHandler(async (req, res) => {
  const type = (req.body || {}).type;
  if (type === 'terms') await exec('UPDATE users SET terms_accepted_at = ? WHERE id = ?', [nowSql(), req.user.id]);
  else if (type === 'privacy') await exec('UPDATE users SET privacy_accepted_at = ? WHERE id = ?', [nowSql(), req.user.id]);
  else throw new HttpError(400, "type debe ser 'terms' o 'privacy'");
  const u = await findUserById(req.user.id);
  res.json({ success: true, termsAcceptedAt: u.termsAcceptedAt, privacyAcceptedAt: u.privacyAcceptedAt });
}));

// POST /api/auth/verify-2fa  (segundo paso del login)
router.post('/verify-2fa', asyncHandler(async (req, res) => {
  const { userId, code } = req.body || {};
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'userId inválido');
  if (!code || !String(code).trim()) throw new HttpError(400, 'Ingresa el código de verificación');

  const key = `2fa:${id}`;
  if (bruteForce.isBlocked(key)) return blockedResponse(res, key);

  const user = await findUserById(id);
  if (!user) throw new HttpError(401, 'Sesión de verificación inválida, inicia sesión de nuevo');
  if (!(await twoFactor.verifyCode(id, String(code).trim()))) {
    bruteForce.recordFailedAttempt(key);
    throw new HttpError(401, 'Código incorrecto o vencido');
  }
  bruteForce.recordSuccessfulLogin(key);
  return res.json(await issueSession(user, req));
}));

// POST /api/auth/2fa/enable  (paso 1: enviar código al correo)
router.post('/2fa/enable', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.twoFactorEnabled) throw new HttpError(400, 'Ya tienes la autenticación de dos factores activada');
  const sent = await twoFactor.generateAndSend(
    req.user,
    'Activar autenticación de dos factores',
    'Ingresa este código para ACTIVAR la autenticación de dos factores en tu cuenta:'
  );
  if (!sent) throw new HttpError(500, twoFactor.getLastError() || 'No se pudo enviar el código a tu correo');
  res.json({ success: true, emailHint: maskEmail(req.user.email) });
}));

// POST /api/auth/2fa/enable/confirm  (paso 2: confirmar código)
router.post('/2fa/enable/confirm', requireAuth, asyncHandler(async (req, res) => {
  const code = (req.body || {}).code;
  if (!code || !(await twoFactor.verifyCode(req.user.id, String(code).trim()))) {
    throw new HttpError(401, 'Código incorrecto o vencido');
  }
  await exec('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [req.user.id]);
  res.json({ success: true, twoFactorEnabled: true });
}));

// POST /api/auth/2fa/disable  (pide la contraseña actual)
router.post('/2fa/disable', requireAuth, asyncHandler(async (req, res) => {
  const pass = (req.body || {}).password;
  if (!pass || !(await password.matches(pass, req.user.password))) throw new HttpError(401, 'Contraseña incorrecta');
  await exec('UPDATE users SET two_factor_enabled = 0, temp_2fa_code = NULL, temp_2fa_expiry = NULL WHERE id = ?', [req.user.id]);
  res.json({ success: true, twoFactorEnabled: false });
}));

module.exports = router;
