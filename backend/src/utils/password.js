'use strict';
const bcrypt = require('bcryptjs');

const ROUNDS = 12;
// Hash de relleno: se usa cuando el usuario no existe para que el login tarde
// lo mismo que con un usuario real y no se pueda enumerar cuentas por tiempo.
const DUMMY_HASH = bcrypt.hashSync('no-corresponde-a-ninguna-cuenta-real', ROUNDS);

const hash = (raw) => bcrypt.hash(raw, ROUNDS);

async function matches(raw, stored) {
  if (!raw || !stored) return false;
  try {
    return await bcrypt.compare(raw, stored);
  } catch (_) {
    return false;
  }
}

/** Compara contra el hash de relleno (resultado siempre falso, solo consume tiempo). */
const burnTime = (raw) => bcrypt.compare(String(raw || ''), DUMMY_HASH);

module.exports = { hash, matches, burnTime };
