'use strict';
const { verifyToken } = require('../utils/jwt');
const { one } = require('../config/db');
const { HttpError } = require('../utils/http');

/**
 * Carga el usuario autenticado en req.user a partir del header
 *   Authorization: Bearer <jwt>
 * - Token vencido  -> 401 { error: "Token expired" } (el frontend usa esto para refrescar).
 * - Token inválido -> se ignora (la ruta decide si exige autenticación).
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();
  try {
    const claims = verifyToken(header.slice(7));
    const row = await one(
      `SELECT u.id, u.name, u.surname, u.username, u.mail AS email, u.password, u.role_id,
              r.name AS role_name, u.digital_signature, u.profile_picture, u.fcm_token,
              u.two_factor_enabled, u.two_factor_secret, u.temp_2fa_code, u.temp_2fa_expiry,
              u.enable, u.terms_accepted_at, u.privacy_accepted_at, u.additional_admin
         FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [claims.sub]
    );
    if (row) req.user = buildUser(row);
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', message: 'Your session has expired. Please log in again.' });
    }
    // firma inválida / token mal formado: se trata como anónimo
  }
  return next();
}

/** Arma el objeto usuario con sus autoridades (rol + ADMIN extra). */
function buildUser(row) {
  const authorities = new Set();
  if (row.roleName) authorities.add(String(row.roleName).toUpperCase());
  if (row.additionalAdmin) authorities.add('ADMIN');
  return {
    ...row,
    role: row.roleId ? { id: row.roleId, name: row.roleName } : null,
    authorities,
    isAdmin: authorities.has('ADMIN'),
  };
}

/** Exige sesión iniciada. */
function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Not authenticated'));
  if (req.user.enable === false) return next(new HttpError(403, 'Cuenta deshabilitada'));
  return next();
}

/** Exige alguno de los roles indicados (ej.: requireRole('ADMIN','TEACHER')). */
function requireRole(...roles) {
  const wanted = roles.map((r) => r.toUpperCase());
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Not authenticated'));
    if (req.user.enable === false) return next(new HttpError(403, 'Cuenta deshabilitada'));
    if (!wanted.some((r) => req.user.authorities.has(r))) return next(new HttpError(403, 'Acceso denegado'));
    return next();
  };
}

/** Permite ADMIN o que el :param de la ruta sea el propio usuario. */
function requireAdminOrSelf(param = 'id') {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Not authenticated'));
    if (req.user.isAdmin || String(req.user.id) === String(req.params[param])) return next();
    return next(new HttpError(403, 'Acceso denegado'));
  };
}

module.exports = { authenticate, requireAuth, requireRole, requireAdminOrSelf, buildUser };
