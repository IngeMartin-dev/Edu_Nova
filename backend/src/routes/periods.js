'use strict';
const express = require('express');
const { query, one, exec } = require('../config/db');
const { asyncHandler, HttpError, numericParams } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const periods = require('../services/periods');

const router = express.Router();
numericParams(router);
router.use(requireAuth);

async function findOrCreate(periodNumber, defaults) {
  const found = await query('SELECT * FROM academic_periods WHERE period_number = ? ORDER BY id', [periodNumber]);
  if (found.length) {
    // limpia duplicados
    for (const dup of found.slice(1)) await exec('DELETE FROM academic_periods WHERE id = ?', [dup.id]);
    return found[0];
  }
  const r = await exec(
    'INSERT INTO academic_periods (period_number, is_unlocked, is_automatic, description) VALUES (?, ?, 0, ?)',
    [periodNumber, defaults.unlocked ? 1 : 0, `Período ${periodNumber} del año académico`]
  );
  return one('SELECT * FROM academic_periods WHERE id = ?', [r.insertId]);
}

// GET /api/periods
router.get('/', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM academic_periods WHERE period_number BETWEEN 1 AND 4 ORDER BY period_number, id');
  const unique = new Map();
  for (const p of rows) if (!unique.has(p.periodNumber)) unique.set(p.periodNumber, p);
  const list = [...unique.values()].sort((a, b) => a.periodNumber - b.periodNumber);
  for (const p of list) if (p.isAutomatic) await periods.checkAndUpdateAutomaticUnlock(p);
  res.json(list.map(periods.toPeriodJson));
}));

// PUT /api/periods/:n/unlock  { unlocked: boolean }
router.put('/:n/unlock', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const n = Number(req.params.n);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new HttpError(400, 'El período debe estar entre 1 y 4');
  const unlocked = (req.body || {}).unlocked === true;
  const p = await findOrCreate(n, { unlocked: false });
  await exec('UPDATE academic_periods SET is_unlocked = ?, is_automatic = 0 WHERE id = ?', [unlocked ? 1 : 0, p.id]);
  res.json({ periodNumber: n, isUnlocked: unlocked });
}));

// PUT /api/periods/:n/schedule  { unlockDate?, lockDate? }
router.put('/:n/schedule', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const n = Number(req.params.n);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new HttpError(400, 'El período debe estar entre 1 y 4');
  const b = req.body || {};
  const p = await findOrCreate(n, { unlocked: false });
  const sets = [];
  const params = [];

  if ('unlockDate' in b && b.unlockDate && String(b.unlockDate).includes('T')) {
    const dt = periods.toSqlDateTime(b.unlockDate);
    if (!p.unlockDate || String(p.unlockDate).replace('T', ' ').slice(0, 19) !== dt) { sets.push('notified_open_7d = 0'); }
    sets.push('unlock_date = ?', 'is_automatic = 1'); params.push(dt);
  }
  if ('lockDate' in b && b.lockDate && String(b.lockDate).includes('T')) {
    const dt = periods.toSqlDateTime(b.lockDate);
    if (!p.lockDate || String(p.lockDate).replace('T', ' ').slice(0, 19) !== dt) { sets.push('notified_close_7d = 0'); }
    sets.push('lock_date = ?', 'is_automatic = 1'); params.push(dt);
  }
  if (sets.length) await exec(`UPDATE academic_periods SET ${sets.join(', ')} WHERE id = ?`, [...params, p.id]);

  const saved = await one('SELECT * FROM academic_periods WHERE id = ?', [p.id]);
  res.json({
    periodNumber: n,
    isUnlocked: Boolean(saved.isUnlocked),
    unlockDate: saved.unlockDate,
    lockDate: saved.lockDate,
    isAutomatic: Boolean(saved.isAutomatic),
  });
}));

// POST /api/periods/initialize  (ADMIN)
router.post('/initialize', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  for (let i = 1; i <= 4; i++) {
    const found = await query('SELECT id FROM academic_periods WHERE period_number = ? ORDER BY id', [i]);
    for (const dup of found.slice(1)) await exec('DELETE FROM academic_periods WHERE id = ?', [dup.id]);
    if (!found.length) {
      await exec('INSERT INTO academic_periods (period_number, is_unlocked, is_automatic, description) VALUES (?, ?, 0, ?)',
        [i, i === 1 ? 1 : 0, `Período ${i} del año académico`]);
    }
  }
  await exec('DELETE FROM academic_periods WHERE period_number IS NULL OR period_number > 4');
  res.json({ message: 'Periodos inicializados correctamente' });
}));

module.exports = router;
