'use strict';
const { query, one, exec, tx } = require('../config/db');
const { toUserJson, USER_SELECT } = require('./userMapper');

const STUDENT_COLS = `s.id, s.name, s.surname, s.grade, s.class_group, s.previous_grade,
                      s.previous_class_group, s.document_number, s.active`;

/** Trae los padres de varios estudiantes en UNA consulta y los agrupa por estudiante. */
async function parentsByStudent(studentIds) {
  const map = new Map();
  if (!studentIds.length) return map;
  const rows = await query(
    `SELECT sp.student_id, u.id, u.name, u.surname, u.username, u.mail AS email, u.role_id,
            r.name AS role_name, u.profile_picture, u.enable, u.additional_admin, u.two_factor_enabled
       FROM student_parents sp
       JOIN users u ON u.id = sp.user_id
       LEFT JOIN roles r ON r.id = u.role_id
      WHERE sp.student_id IN (?)`,
    [studentIds]
  );
  for (const r of rows) {
    if (!map.has(r.studentId)) map.set(r.studentId, []);
    map.get(r.studentId).push(toUserJson(r));
  }
  return map;
}

function toStudentJson(row, parents = []) {
  const name = row.name || '';
  const surname = row.surname || '';
  return {
    id: row.id,
    name: row.name,
    surname: row.surname,
    grade: row.grade,
    classGroup: row.classGroup ?? null,
    previousGrade: row.previousGrade ?? null,
    previousClassGroup: row.previousClassGroup ?? null,
    documentNumber: row.documentNumber ?? null,
    active: Boolean(row.active),
    parents,
    fullName: `${name} ${surname}`.trim(),
  };
}

async function hydrate(rows) {
  const map = await parentsByStudent(rows.map((r) => r.id));
  return rows.map((r) => toStudentJson(r, map.get(r.id) || []));
}

async function findAll() {
  return hydrate(await query(`SELECT ${STUDENT_COLS} FROM students s ORDER BY s.id`));
}

async function findById(id) {
  const row = await one(`SELECT ${STUDENT_COLS} FROM students s WHERE s.id = ?`, [id]);
  if (!row) return null;
  return (await hydrate([row]))[0];
}

async function findByDocumentNumber(doc) {
  const row = await one(`SELECT ${STUDENT_COLS} FROM students s WHERE s.document_number = ? LIMIT 1`, [doc]);
  return row ? (await hydrate([row]))[0] : null;
}

/** Con classGroup vacío devuelve todos los estudiantes del grado. */
async function findByGradeAndClassGroup(grade, classGroup) {
  const rows = classGroup
    ? await query(`SELECT ${STUDENT_COLS} FROM students s WHERE s.grade = ? AND s.class_group = ? ORDER BY s.surname, s.name`, [grade, classGroup])
    : await query(`SELECT ${STUDENT_COLS} FROM students s WHERE s.grade = ? ORDER BY s.surname, s.name`, [grade]);
  return hydrate(rows);
}

async function findByParentId(parentId) {
  return hydrate(
    await query(
      `SELECT ${STUDENT_COLS} FROM students s JOIN student_parents sp ON sp.student_id = s.id
        WHERE sp.user_id = ? ORDER BY s.surname, s.name`,
      [parentId]
    )
  );
}

async function insert(s) {
  const r = await exec(
    `INSERT INTO students (name, surname, grade, class_group, document_number, active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [s.name, s.surname, s.grade, s.classGroup || null, s.documentNumber || null, s.active === false ? 0 : 1]
  );
  return findById(r.insertId);
}

async function update(id, s) {
  await exec(
    `UPDATE students SET name = ?, surname = ?, grade = ?, class_group = ?, document_number = ?, active = ? WHERE id = ?`,
    [s.name, s.surname, s.grade, s.classGroup || null, s.documentNumber || null, s.active ? 1 : 0, id]
  );
  return findById(id);
}

async function removeParent(studentId, parentId) {
  await exec('DELETE FROM student_parents WHERE student_id = ? AND user_id = ?', [studentId, parentId]);
}

/** Borra un estudiante y todo lo que depende de él. */
async function deleteById(id) {
  await tx(async (c) => {
    for (const t of ['digital_signatures', 'recovery_data', 'recovery_plans', 'report_cards', 'subject_grades', 'student_parents', 'boletin_valoraciones']) {
      await exec(`DELETE FROM ${t} WHERE student_id = ?`, [id], c);
    }
    await exec('DELETE FROM students WHERE id = ?', [id], c);
  });
}

module.exports = {
  findAll, findById, findByDocumentNumber, findByGradeAndClassGroup, findByParentId,
  insert, update, removeParent, deleteById, parentsByStudent, toStudentJson,
};
