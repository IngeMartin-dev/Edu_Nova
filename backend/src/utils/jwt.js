'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

/** Token de acceso (JWT firmado, subject = id del usuario). */
function generateToken(userId) {
  return jwt.sign({}, env.jwt.secret, {
    subject: String(userId),
    expiresIn: env.jwt.expiresInSeconds,
  });
}

/** Refresh token: JWT con jti único (se guarda en la tabla refresh_tokens). */
function generateRefreshToken(userId) {
  return jwt.sign({}, env.jwt.secret, {
    subject: String(userId),
    jwtid: crypto.randomUUID(),
    expiresIn: `${env.jwt.refreshExpiresDays}d`,
  });
}

/** Valida el token; lanza TokenExpiredError / JsonWebTokenError si no es válido. */
const verifyToken = (token) => jwt.verify(token, env.jwt.secret);

module.exports = { generateToken, generateRefreshToken, verifyToken };
