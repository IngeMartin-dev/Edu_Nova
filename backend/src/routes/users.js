'use strict';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { one, exec, query } = require('../config/db');
const { asyncHandler, HttpError, EMAIL_RE, numericParams } = require('../utils/http');
const password = require('../utils/password');
const { requireAuth, requireRole, requireAdminOrSelf } = require('../middleware/auth');
const { memory, sniffImage } = require('../middleware/upload');
const files = require('../services/files');
const userService = require('../services/userService');
const students = require('../services/students');
const {
  toUserJson, findUserById, findUserByUsername, findUserByEmail, findAllUsers, findUsersByRole,
} = require('../services/userMapper');

const router = express.Router();
numericParams(router);
router.use(requireAuth);

const upload = memory(5);

router.get('/health', (req, res) => res.json({ status: 'UP' }));

// GET /api/users/teachers
router.get('/teachers', asyncHandler(async (req, res) => {
  res.json((await findUsersByRole('TEACHER')).map(toUserJson));
}));

// Rutas de administración de roles (antes de /:id)
router.get('/roles-disponibles', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  res.json((await query('SELECT id, name FROM roles ORDER BY id')).map((r) => ({ id: r.id, name: r.name })));
}));

router.get('/sin-rol', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const rows = (await findAllUsers()).filter((u) => !u.roleId);
  res.json(rows.map((u) => ({ id: u.id, name: u.name, surname: u.surname, username: u.username, email: u.email })));
}));

router.get('/gestion-roles', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const users = (await findAllUsers()).filter((u) => u.roleId);
  const out = [];
  for (const u of users) {
    let hijos = [];
    if (String(u.roleName).toUpperCase() === 'PARENT') {
      hijos = (await students.findByParentId(u.id)).map((h) => ({
        studentId: h.id, name: h.name, surname: h.surname, grade: h.grade, classroom: h.classGroup, active: h.active,
      }));
    }
    out.push({
      id: u.id, name: u.name, surname: u.surname, username: u.username, email: u.email,
      roleId: u.roleId, roleName: u.roleName, additionalAdmin: Boolean(u.additionalAdmin), hijos,
    });
  }
  res.json(out);
}));

// GET /api/users  (ADMIN)
router.get('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  res.json((await findAllUsers()).map(toUserJson));
}));

// POST /api/users  (ADMIN) — crea, o actualiza si ya existe el usuario/correo
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const username = b.username ? String(b.username).trim() : '';
  const email = b.email ? String(b.email).trim() : '';
  const roleId = (b.role && b.role.id) || b.roleId || null;

  let existing = null;
  if (username) existing = await findUserByUsername(username);
  if (!existing && email) existing = await findUserByEmail(email);

  if (existing) {
    const sets = ['name = ?', 'surname = ?', 'username = ?', 'mail = ?', 'enable = ?'];
    const params = [b.name ?? null, b.surname ?? null, username || existing.username, email || existing.email,
      b.enable === undefined || b.enable === null ? (existing.enable ? 1 : 0) : (b.enable ? 1 : 0)];
    if (roleId) { sets.push('role_id = ?'); params.push(roleId); }
    if (b.password && String(b.password).trim()) { sets.push('password = ?'); params.push(await password.hash(String(b.password))); }
    params.push(existing.id);
    await exec(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    return res.status(201).json(toUserJson(await findUserById(existing.id)));
  }

  if (username.length < 3 || username.length > 100) throw new HttpError(400, 'El usuario debe tener entre 3 y 100 caracteres');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Formato de correo inválido');
  if (!b.password || String(b.password).length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');

  const r = await exec(
    `INSERT INTO users (name, surname, username, mail, password, role_id, enable, additional_admin, two_factor_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    [b.name ?? null, b.surname ?? null, username, email, await password.hash(String(b.password)), roleId,
      b.enable === false ? 0 : 1]
  );
  return res.status(201).json(toUserJson(await findUserById(r.insertId)));
}));

// GET /api/users/:id  (ADMIN o el propio usuario)
router.get('/:id', requireAdminOrSelf(), asyncHandler(async (req, res) => {
  const u = await findUserById(req.params.id);
  if (!u) return res.status(404).end();
  return res.json(toUserJson(u));
}));

// PUT /api/users/:id  (actualiza perfil)
router.put('/:id', requireAdminOrSelf(), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const user = await findUserById(id);
  if (!user) return res.status(404).end();

  const name = b.name ? String(b.name).trim() : '';
  const username = b.username ? String(b.username).trim() : '';
  const email = b.email ? String(b.email).trim() : '';
  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  if (name.length > 100 || (b.surname && String(b.surname).length > 100)) throw new HttpError(400, 'Nombre o apellido demasiado largo');
  if (username.length < 3 || username.length > 100) throw new HttpError(400, 'El nombre de usuario es obligatorio (3 a 100 caracteres)');
  if (!email) throw new HttpError(400, 'El correo es obligatorio');
  if (!EMAIL_RE.test(email) || email.length > 200) throw new HttpError(400, 'El correo no tiene un formato válido');

  const byMail = await findUserByEmail(email);
  if (byMail && byMail.id !== id) throw new HttpError(409, 'Ese correo ya está en uso por otra cuenta');
  const byUser = await findUserByUsername(username);
  if (byUser && byUser.id !== id) throw new HttpError(409, 'Ese nombre de usuario ya está en uso por otra cuenta');

  await exec('UPDATE users SET name = ?, surname = ?, username = ?, mail = ? WHERE id = ?',
    [name, b.surname ?? null, username, email, id]);
  return res.status(201).json(toUserJson(await findUserById(id)));
}));

// PUT /api/users/:id/enable  (ADMIN)
router.put('/:id/enable', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { enable } = req.body || {};
  if (typeof enable !== 'boolean') throw new HttpError(400, 'enable es obligatorio (true/false)');
  if (!(await findUserById(id))) return res.status(404).end();
  await exec('UPDATE users SET enable = ? WHERE id = ?', [enable ? 1 : 0, id]);
  return res.json({ id, enable });
}));

// DELETE /api/users/:id  (ADMIN)
router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findUserById(id))) return res.status(404).end();
  if (id === req.user.id) throw new HttpError(400, 'No puedes eliminar tu propia cuenta');
  await userService.deleteUserCascade(id);
  return res.status(200).end();
}));

// POST /api/users/:id/profile-picture
router.post('/:id/profile-picture', requireAdminOrSelf(), upload.single('file'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findUserById(id))) throw new HttpError(404, 'Usuario no encontrado');
  if (!req.file || !req.file.size) throw new HttpError(400, 'No se recibió ningún archivo');
  const ext = sniffImage(req.file.buffer);
  if (!ext) throw new HttpError(400, 'El archivo debe ser una imagen (jpg, png, gif o webp)');

  const fileName = `${id}_${crypto.randomUUID()}.${ext}`;
  await files.put(`profile-pictures/${fileName}`, req.file.buffer, `image/${ext === 'jpg' ? 'jpeg' : ext}`);

  // borra la foto anterior si era un archivo local nuestro
  const prev = await one('SELECT profile_picture FROM users WHERE id = ?', [id]);
  if (prev && prev.profilePicture && prev.profilePicture.startsWith('/uploads/profile-pictures/')) {
    files.remove(`profile-pictures/${path.basename(prev.profilePicture)}`).catch(() => {});
  }
  const url = `/uploads/profile-pictures/${fileName}`;
  await exec('UPDATE users SET profile_picture = ? WHERE id = ?', [url, id]);
  res.json({ message: 'Profile picture uploaded successfully', profilePicture: url });
}));

// PUT /api/users/:id/password
router.put('/:id/password', requireAdminOrSelf(), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { currentPassword, newPassword } = req.body || {};
  if (newPassword === undefined || newPassword === null) throw new HttpError(400, 'newPassword es requerido');
  if (currentPassword) await userService.changePassword(id, currentPassword, newPassword);
  else if (req.user.isAdmin) await userService.resetPassword(id, newPassword);
  else throw new HttpError(400, 'Debes indicar tu contraseña actual (currentPassword)');
  res.json({ message: 'Contraseña actualizada correctamente' });
}));

// POST /api/users/:id/password/reset  (ADMIN)
router.post('/:id/password/reset', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { newPassword } = req.body || {};
  if (newPassword === undefined || newPassword === null) throw new HttpError(400, 'newPassword es requerido');
  await userService.resetPassword(Number(req.params.id), newPassword);
  res.json({ message: 'Contraseña restablecida correctamente' });
}));

// PUT /api/users/:id/role  (ADMIN)
router.put('/:id/role', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findUserById(id))) throw new HttpError(404, 'Usuario no encontrado');
  const roleId = Number((req.body || {}).roleId);
  if (!Number.isInteger(roleId)) throw new HttpError(400, 'roleId inválido');
  const role = await one('SELECT id FROM roles WHERE id = ?', [roleId]);
  if (!role) throw new HttpError(400, 'Rol no encontrado');
  await exec('UPDATE users SET role_id = ? WHERE id = ?', [roleId, id]);
  res.json({ message: 'Rol asignado correctamente' });
}));

// PUT /api/users/:id/admin-extra  (ADMIN)
router.put('/:id/admin-extra', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findUserById(id))) throw new HttpError(404, 'Usuario no encontrado');
  const enable = (req.body || {}).enable === true;
  await exec('UPDATE users SET additional_admin = ? WHERE id = ?', [enable ? 1 : 0, id]);
  res.json({
    message: enable ? 'Rol de administrador sumado correctamente' : 'Rol de administrador extra removido',
    additionalAdmin: enable,
  });
}));

module.exports = router;
