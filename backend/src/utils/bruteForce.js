'use strict';
/**
 * Protección contra fuerza bruta en el login: 5 intentos fallidos => bloqueo
 * de 15 minutos por usuario (misma política que el sistema original).
 */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const IDLE_EVICTION_MS = 30 * 60 * 1000;

const attempts = new Map(); // key -> { count, lockedUntil, lastActivity }
let calls = 0;

function cleanup() {
  const cutoff = Date.now() - IDLE_EVICTION_MS;
  for (const [k, r] of attempts) {
    const locked = r.lockedUntil && Date.now() < r.lockedUntil;
    if (!locked && r.lastActivity < cutoff) attempts.delete(k);
  }
}

function isBlocked(key) {
  if (!key) return false;
  if (++calls % 200 === 0) cleanup();
  const r = attempts.get(key);
  return Boolean(r && r.lockedUntil && Date.now() < r.lockedUntil);
}

function recordFailedAttempt(key) {
  if (!key) return;
  let r = attempts.get(key);
  if (!r || (r.lockedUntil && Date.now() > r.lockedUntil)) {
    r = { count: 1, lockedUntil: null, lastActivity: Date.now() };
  } else {
    r.count += 1;
    r.lastActivity = Date.now();
  }
  if (r.count >= MAX_ATTEMPTS) r.lockedUntil = Date.now() + LOCKOUT_MS;
  attempts.set(key, r);
}

const recordSuccessfulLogin = (key) => key && attempts.delete(key);

function remainingLockoutSeconds(key) {
  const r = key && attempts.get(key);
  if (!r || !r.lockedUntil) return 0;
  return Math.max(0, Math.ceil((r.lockedUntil - Date.now()) / 1000));
}

module.exports = { isBlocked, recordFailedAttempt, recordSuccessfulLogin, remainingLockoutSeconds };
