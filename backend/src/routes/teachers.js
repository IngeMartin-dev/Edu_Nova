'use strict';
const express = require('express');
const { one, exec, query, tx } = require('../config/db');
const { asyncHandler, HttpError, numericParams } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const password = require('../utils/password');
const userService = require('../services/userService');
const subjects = require('../services/subjects');
const { toUserJson, findUsersByRole, findUserById, findUserByUsername, findUserByEmail } = require('../services/userMapper');

const router = express.Router();
numericParams(router);
router.use(requireAuth);

router.get('/', requireRole('ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'), asyncHandler(async (req, res) => {
  res.json((await findUsersByRole('TEACHER')).map(toUserJson));
}));

router.get('/subjects', asyncHandler(async (req, res) => res.json(await subjects.findAll())));

// POST /api/teachers  (ADMIN)
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const { name, surname, email } = b;
  const rawPassword = b.password;
  if (!name || !surname || !email || !rawPassword) throw new HttpError(400, 'name, surname, email and password are required');
  if (String(rawPassword).length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');

  let username = b.username && String(b.username).trim() ? String(b.username).trim() : String(email).split('@')[0];
  if (await findUserByUsername(username)) throw new HttpError(400, 'username already in use');
  if (await findUserByEmail(String(email).trim())) throw new HttpError(400, 'email already in use');

  const role = await one("SELECT id FROM roles WHERE name = 'TEACHER'");
  if (!role) throw new HttpError(400, 'TEACHER role not found in database');

  const ids = Array.isArray(b.subjectCodes)
    ? b.subjectCodes.map((x) => Number(x)).filter((n) => Number.isInteger(n))
    : [];
  const toAssign = [];
  for (const sid of ids) {
    const s = await subjects.findById(sid);
    if (!s) continue;
    if (s.teacher) {
      throw new HttpError(400, `La materia '${s.name}' ya está asignada al profesor ${s.teacher.name} ${s.teacher.surname}`);
    }
    toAssign.push(s.id);
  }

  const hashed = await password.hash(String(rawPassword));
  const newId = await tx(async (c) => {
    const r = await exec(
      `INSERT INTO users (name, surname, username, mail, password, role_id, enable, additional_admin, two_factor_enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0)`,
      [String(name).trim(), String(surname).trim(), username.trim(), String(email).trim(), hashed, role.id], c
    );
    for (const sid of toAssign) await exec('UPDATE subjects SET teacher_id = ? WHERE id = ?', [r.insertId, sid], c);
    return r.insertId;
  });

  const saved = await findUserById(newId);
  res.json({
    id: saved.id, name: saved.name, surname: saved.surname, username: saved.username, email: saved.email,
    role: saved.roleName, message: 'Profesor creado correctamente',
  });
}));

// DELETE /api/teachers/:id  (ADMIN)
router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findUserById(id))) return res.status(404).end();
  await userService.deleteUserCascade(id);
  res.json({ message: 'Profesor eliminado correctamente' });
}));

module.exports = router;
