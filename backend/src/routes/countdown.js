'use strict';
const express = require('express');
const { query, one, exec } = require('../config/db');
const { asyncHandler, HttpError } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * Cronómetro compartido: lo configura el administrador y lo ven TODAS las cuentas
 * (el Panel lo consulta cada pocos segundos). Una sola fila (id = 1).
 */
const router = express.Router();
router.use(requireAuth);

let ready = null;
const ensureTable = () => {
  if (!ready) {
    ready = exec(`CREATE TABLE IF NOT EXISTS countdown_config (
      id          BIGINT PRIMARY KEY,
      name        VARCHAR(200),
      target_date VARCHAR(40),
      updated_at  TIMESTAMP
    )`).catch((e) => { ready = null; throw e; });
  }
  return ready;
};

const toDto = (c) => {
  const active = !!(c && c.name && String(c.name).trim() && c.targetDate && String(c.targetDate).trim());
  return { active, name: active ? c.name : null, targetDate: active ? c.targetDate : null, updatedAt: c?.updatedAt || null };
};

router.get('/', asyncHandler(async (req, res) => {
  await ensureTable();
  res.json(toDto(await one('SELECT * FROM countdown_config WHERE id = 1')));
}));

router.put('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const name = String((req.body || {}).name || '').trim();
  const target = String((req.body || {}).targetDate || '').trim();
  if (!name || !target) throw new HttpError(400, 'El título y la fecha son obligatorios');
  if (name.length > 200) throw new HttpError(400, 'El título no puede superar 200 caracteres');
  if (Number.isNaN(Date.parse(target))) throw new HttpError(400, 'Fecha inválida');
  await ensureTable();
  await exec('DELETE FROM countdown_config WHERE id = 1');
  await exec('INSERT INTO countdown_config (id, name, target_date, updated_at) VALUES (1, ?, ?, NOW())', [name, target]);
  res.json(toDto(await one('SELECT * FROM countdown_config WHERE id = 1')));
}));

router.delete('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await ensureTable();
  await exec('DELETE FROM countdown_config WHERE id = 1');
  res.json(toDto(null));
}));

module.exports = router;
