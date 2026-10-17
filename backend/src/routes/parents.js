'use strict';
const express = require('express');
const { one, exec, query } = require('../config/db');
const { asyncHandler, HttpError, str } = require('../utils/http');
const { requireAuth, requireRole } = require('../middleware/auth');
const password = require('../utils/password');
const students = require('../services/students');
const notifications = require('../services/notifications');
const env = require('../config/env');
const { findUserById, findUserByUsername, findUserByEmail } = require('../services/userMapper');

const router = express.Router();
router.use(requireAuth);

// GET /api/parents/me/children  (PARENT)
router.get('/me/children', requireRole('PARENT'), asyncHandler(async (req, res) => {
  const children = await students.findByParentId(req.user.id);
  res.json({
    children: children.map((s) => ({
      id: s.id, name: s.name, surname: s.surname, documentNumber: s.documentNumber, grade: s.grade, classGroup: s.classGroup,
    })),
  });
}));

// GET /api/parents/by-grade-classroom?grade=&classroom=  (ADMIN, DIRECTOR_DE_GRUPO)
router.get('/by-grade-classroom', requireRole('ADMIN', 'DIRECTOR_DE_GRUPO'), asyncHandler(async (req, res) => {
  const grade = str(req.query.grade);
  const classroom = str(req.query.classroom);
  if (!grade) throw new HttpError(400, 'grade es obligatorio');

  const allStudents = await students.findByGradeAndClassGroup(grade, classroom);

  // padres vinculados a estudiantes de este grado/salón
  const fromStudents = await query(
    `SELECT DISTINCT u.id, u.name, u.surname, u.username, u.mail AS email
       FROM students s JOIN student_parents sp ON sp.student_id = s.id JOIN users u ON u.id = sp.user_id
      WHERE s.grade = ? ${classroom ? 'AND s.class_group = ?' : ''}
      ORDER BY u.surname, u.name`,
    classroom ? [grade, classroom] : [grade]
  );
  // padres "registrados" en el salón aunque aún no tengan hijo vinculado
  const fromClasses = await query(
    `SELECT u.id, u.name, u.surname, u.username, u.mail AS email
       FROM parent_classes pc JOIN users u ON u.id = pc.user_id
      WHERE pc.grade = ? AND pc.classroom = ?`,
    [grade, classroom || '']
  );
  const seen = new Set();
  const merged = [];
  for (const p of [...fromStudents, ...fromClasses]) {
    if (!seen.has(p.id)) { seen.add(p.id); merged.push(p); }
  }

  const studentsOut = allStudents.map((s) => {
    const parent = (s.parents || [])[0] || null;
    return {
      id: s.id, name: s.name, surname: s.surname, documentNumber: s.documentNumber, grade: s.grade, classGroup: s.classGroup,
      hasParent: Boolean(parent),
      parentId: parent ? parent.id : null,
      parentName: parent ? `${parent.surname} ${parent.name}` : null,
    };
  });

  const linked = [];
  const unlinked = [];
  for (const p of merged) {
    const assigned = await students.findByParentId(p.id);
    const inRoom = assigned.filter((s) => s.grade === grade && classroom && s.classGroup === classroom);
    const item = {
      id: p.id, name: p.name, surname: p.surname, username: p.username, email: p.email,
      hasStudent: inRoom.length > 0,
      assignedStudentId: inRoom.length ? inRoom[0].id : null,
      assignedStudentName: inRoom.length === 0 ? null : inRoom.length === 1 ? `${inRoom[0].surname} ${inRoom[0].name}` : 'Varios alumnos',
    };
    (item.hasStudent ? linked : unlinked).push(item);
  }

  res.json({
    grade, classroom,
    students: studentsOut,
    parents: [...unlinked, ...linked],
    totalStudents: allStudents.length,
    totalParents: merged.length,
  });
}));

// POST /api/parents  (ADMIN) — crea un padre de familia
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name);
  const surname = str(b.surname);
  const email = str(b.email);
  const pass = str(b.password);
  if (!name || !surname || !email || !pass) throw new HttpError(400, 'Nombre, apellido, correo y contraseña son obligatorios');
  if (name.length > 100) throw new HttpError(400, 'El nombre no puede superar 100 caracteres');
  if (surname.length > 100) throw new HttpError(400, 'El apellido no puede superar 100 caracteres');
  if (email.length > 200) throw new HttpError(400, 'El correo no puede superar 200 caracteres');
  if (pass.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
  if (await findUserByEmail(email)) throw new HttpError(400, 'El correo ya está registrado');

  let username = email.split('@')[0].slice(0, 100);
  if (await findUserByUsername(username)) {
    const suffix = `_${Date.now()}`;
    username = username.slice(0, Math.max(1, 100 - suffix.length)) + suffix;
  }
  const role = await one("SELECT id FROM roles WHERE name = 'PARENT'");
  if (!role) throw new HttpError(500, 'Rol PARENT no encontrado en la base de datos');

  const r = await exec(
    `INSERT INTO users (name, surname, username, mail, password, role_id, enable, additional_admin, two_factor_enabled)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0)`,
    [name, surname, username, email, await password.hash(pass), role.id]
  );
  if (str(b.grade) && str(b.classroom)) {
    await exec('INSERT INTO parent_classes (grade, classroom, user_id) VALUES (?, ?, ?)', [str(b.grade), str(b.classroom), r.insertId]);
  }
  await notifications.notifyAdmins('Nuevo padre de familia', `Se creó el usuario para ${name} ${surname} (${email}).`, 'PARENT_CREATED');
  await notifications.sendNotification(
    r.insertId,
    `Bienvenido a ${env.institution.name}`,
    'Su cuenta de padre de familia fue creada exitosamente. Ya puede iniciar sesión con su correo y la contraseña registrada.',
    'PARENT_ACCOUNT_CREATED'
  );
  res.status(200).json({
    id: r.insertId, name, surname, username, email, role: 'PARENT', message: 'Padre de familia creado correctamente',
  });
}));

// POST /api/parents/assign  (ADMIN)
router.post('/assign', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { studentId, parentId } = req.body || {};
  if (!studentId || !parentId) throw new HttpError(400, 'studentId y parentId son obligatorios');
  const student = await students.findById(studentId);
  const parent = await findUserById(parentId);
  if (!student) throw new HttpError(400, 'Estudiante no encontrado');
  if (!parent) throw new HttpError(400, 'Padre de familia no encontrado');
  await exec('DELETE FROM student_parents WHERE student_id = ?', [studentId]);
  await exec('INSERT INTO student_parents (student_id, user_id) VALUES (?, ?)', [studentId, parentId]);
  res.json({
    message: 'Padre de familia asignado correctamente',
    studentId, parentId,
    studentName: `${student.name} ${student.surname}`,
    parentName: `${parent.name} ${parent.surname}`,
  });
}));

// DELETE /api/parents/unassign  (ADMIN)
router.delete('/unassign', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { studentId, parentId } = req.body || {};
  if (!studentId || !parentId) throw new HttpError(400, 'studentId y parentId son obligatorios');
  if (!(await students.findById(studentId))) throw new HttpError(400, 'Estudiante no encontrado');
  await students.removeParent(studentId, parentId);
  res.json({ message: 'Asignacion removida correctamente' });
}));

module.exports = router;
