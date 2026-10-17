'use strict';
const { query, one, exec } = require('../config/db');

const SELECT = `
  SELECT s.id, s.name, s.code, s.level, s.grade_min, s.grade_max, s.hours_per_week, s.credits,
         s.type, s.description, s.teacher_id,
         t.name AS t_name, t.surname AS t_surname, t.username AS t_username, t.mail AS t_email,
         t.profile_picture AS t_profile_picture, tr.id AS t_role_id, tr.name AS t_role_name
    FROM subjects s
    LEFT JOIN users t ON t.id = s.teacher_id
    LEFT JOIN roles tr ON tr.id = t.role_id`;

function toSubjectJson(r) {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    level: r.level,
    gradeMin: r.gradeMin,
    gradeMax: r.gradeMax,
    hoursPerWeek: r.hoursPerWeek,
    credits: r.credits,
    type: r.type,
    description: r.description,
    teacher: r.teacherId
      ? {
          id: r.teacherId,
          name: r.tName,
          surname: r.tSurname,
          username: r.tUsername,
          email: r.tEmail,
          profilePicture: r.tProfilePicture || null,
          role: r.tRoleId ? { id: r.tRoleId, name: r.tRoleName } : null,
          fullName: `${r.tName || ''} ${r.tSurname || ''}`.trim(),
        }
      : null,
  };
}

const list = async (where = '', params = []) =>
  (await query(`${SELECT} ${where} ORDER BY s.id`, params)).map(toSubjectJson);

const findAll = () => list();
const findByLevel = (level) => list('WHERE s.level = ?', [level]);
const findByLevelAndRange = (level, min, max) =>
  list('WHERE s.level = ? AND s.grade_min >= ? AND s.grade_max <= ?', [level, min, max]);
const findByTeacher = (teacherId) => list('WHERE s.teacher_id = ?', [teacherId]);
const findById = async (id) => {
  const r = await one(`${SELECT} WHERE s.id = ?`, [id]);
  return r ? toSubjectJson(r) : null;
};
const findByCode = async (code) => {
  const r = await one(`${SELECT} WHERE s.code = ?`, [code]);
  return r ? toSubjectJson(r) : null;
};

const teacherIdOf = (s) => (s.teacher && s.teacher.id) || s.teacherId || null;

async function insert(s) {
  const r = await exec(
    `INSERT INTO subjects (name, code, level, grade_min, grade_max, hours_per_week, credits, type, description, teacher_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.name, s.code, s.level, s.gradeMin ?? null, s.gradeMax ?? null, s.hoursPerWeek ?? null, s.credits ?? null,
      s.type || null, s.description || null, teacherIdOf(s)]
  );
  return findById(r.insertId);
}

async function update(id, s) {
  await exec(
    `UPDATE subjects SET name = ?, code = ?, level = ?, grade_min = ?, grade_max = ?, hours_per_week = ?,
            credits = ?, type = ?, description = ?, teacher_id = ? WHERE id = ?`,
    [s.name, s.code, s.level, s.gradeMin ?? null, s.gradeMax ?? null, s.hoursPerWeek ?? null, s.credits ?? null,
      s.type || null, s.description || null, teacherIdOf(s), id]
  );
  return findById(id);
}

const setTeacher = (id, teacherId) => exec('UPDATE subjects SET teacher_id = ? WHERE id = ?', [teacherId, id]);
const remove = (id) => exec('DELETE FROM subjects WHERE id = ?', [id]);

module.exports = {
  findAll, findByLevel, findByLevelAndRange, findByTeacher, findById, findByCode,
  insert, update, setTeacher, remove,
};
