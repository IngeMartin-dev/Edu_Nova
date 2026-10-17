'use strict';
const express = require('express');
const { one, exec, query } = require('../config/db');
const { asyncHandler, HttpError, numericParams } = require('../utils/http');
const { requireAuth, requireRole, requireAdminOrSelf } = require('../middleware/auth');

const router = express.Router();
numericParams(router);
router.use(requireAuth);

const SELECT = `SELECT h.id, h.grade, h.classroom, h.user_id, u.name AS u_name, u.surname AS u_surname
                  FROM homeroom_assignments h LEFT JOIN users u ON u.id = h.user_id`;

const toJson = (a) => ({
  id: a.id,
  grade: a.grade,
  classroom: a.classroom,
  userId: a.userId ?? null,
  userName: a.userId ? `${a.uName} ${a.uSurname}` : null,
});

router.get('/', requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'), asyncHandler(async (req, res) => {
  res.json((await query(`${SELECT} ORDER BY h.id`)).map(toJson));
}));

router.get('/by-user/:userId', requireAdminOrSelf('userId'), asyncHandler(async (req, res) => {
  const a = await one(`${SELECT} WHERE h.user_id = ?`, [req.params.userId]);
  if (!a) return res.status(404).end();
  return res.json(toJson(a));
}));

router.get('/by-grade/:grade/classroom/:classroom', requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'), asyncHandler(async (req, res) => {
  const a = await one(`${SELECT} WHERE h.grade = ? AND h.classroom = ?`, [req.params.grade, req.params.classroom]);
  if (!a) return res.status(404).end();
  return res.json(toJson(a));
}));

// POST /api/homeroom-assignments/assign  (ADMIN)
router.post('/assign', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { userId, grade, classroom } = req.body || {};
  if (!userId || !grade || !classroom || !String(grade).trim() || !String(classroom).trim()) {
    throw new HttpError(400, 'Faltan datos requeridos');
  }
  const user = await one('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).end();
  // un director solo puede tener un salón, y un salón solo un director
  await exec('DELETE FROM homeroom_assignments WHERE user_id = ? OR (grade = ? AND classroom = ?)', [userId, grade, classroom]);
  const r = await exec('INSERT INTO homeroom_assignments (grade, classroom, user_id) VALUES (?, ?, ?)', [grade, classroom, userId]);
  const a = await one(`${SELECT} WHERE h.id = ?`, [r.insertId]);
  res.json(toJson(a));
}));

// DELETE /api/homeroom-assignments/remove  (ADMIN)
router.delete('/remove', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { grade, classroom } = req.body || {};
  if (!grade || !classroom) throw new HttpError(400, 'Faltan datos requeridos');
  const a = await one('SELECT id, user_id FROM homeroom_assignments WHERE grade = ? AND classroom = ?', [grade, classroom]);
  if (a) {
    await exec('DELETE FROM homeroom_assignments WHERE id = ?', [a.id]);
    if (a.userId) {
      const still = await one('SELECT id FROM homeroom_assignments WHERE user_id = ?', [a.userId]);
      const u = await one('SELECT r.name AS role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [a.userId]);
      if (!still && u && u.roleName === 'DIRECTOR_DE_GRUPO') await exec('UPDATE users SET role_id = NULL WHERE id = ?', [a.userId]);
    }
  }
  res.json({ message: 'Asignación eliminada' });
}));

module.exports = router;
