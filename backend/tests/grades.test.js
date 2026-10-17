'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const { scaleLetter } = require('../src/services/grades');
const password = require('../src/utils/password');
const bruteForce = require('../src/utils/bruteForce');
const { normalizeClassroom, norm } = require('../src/utils/http');
const { toSqlDateTime } = require('../src/utils/dates');

test('escala cualitativa', () => {
  assert.strictEqual(scaleLetter(4.6), 'S');
  assert.strictEqual(scaleLetter(4.0), 'A');
  assert.strictEqual(scaleLetter(1.0), 'B');
  assert.strictEqual(scaleLetter(0.5), 'N.A');
  assert.strictEqual(scaleLetter(null), 'N.A');
});

test('normaliza salón y nombres', () => {
  assert.strictEqual(normalizeClassroom('a'), 'Salon A');
  assert.strictEqual(normalizeClassroom('Salon B'), 'Salon B');
  assert.strictEqual(normalizeClassroom('  '), null);
  assert.strictEqual(norm('  María  PÉREZ '), 'maria perez');
});

test('contraseñas con bcrypt', async () => {
  const h = await password.hash('secreto123');
  assert.ok(await password.matches('secreto123', h));
  assert.ok(!(await password.matches('otra', h)));
  assert.ok(!(await password.matches('', h)));
});

test('bloqueo tras 5 intentos fallidos', () => {
  const k = `t-${Date.now()}`;
  for (let i = 0; i < 4; i++) bruteForce.recordFailedAttempt(k);
  assert.ok(!bruteForce.isBlocked(k));
  bruteForce.recordFailedAttempt(k);
  assert.ok(bruteForce.isBlocked(k));
  bruteForce.recordSuccessfulLogin(k);
  assert.ok(!bruteForce.isBlocked(k));
});

test('fechas a formato MySQL', () => {
  assert.strictEqual(toSqlDateTime('2026-12-01T08:00:00'), '2026-12-01 08:00:00');
  assert.strictEqual(toSqlDateTime('2026-12-01'), '2026-12-01 00:00:00');
  assert.strictEqual(toSqlDateTime(''), null);
});
