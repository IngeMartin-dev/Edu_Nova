'use strict';
const express = require('express');
const { query } = require('../config/db');
const { asyncHandler } = require('../utils/http');
const { requireAuth } = require('../middleware/auth');
const students = require('../services/students');
const grades = require('../services/grades');
const subjects = require('../services/subjects');

const router = express.Router();
router.use(requireAuth);

// GET /api/export/my-data — descarga de los datos personales del usuario (habeas data)
router.get('/my-data', asyncHandler(async (req, res) => {
  const u = req.user;
  const role = u.role ? u.role.name : 'USER';
  const data = {
    exportDate: new Date().toISOString().slice(0, 19),
    profile: {
      id: u.id, name: u.name, surname: u.surname, email: u.email, username: u.username, role,
      termsAcceptedAt: u.termsAcceptedAt ?? null, privacyAcceptedAt: u.privacyAcceptedAt ?? null,
    },
  };
  if (role.toUpperCase() === 'PARENT') {
    const children = [];
    for (const child of await students.findByParentId(u.id)) {
      const periods = [];
      for (let period = 1; period <= 4; period++) {
        const rows = await grades.byStudent(child.id, period);
        if (!rows.length) continue;
        const bySubject = new Map();
        for (const g of rows) { if (!bySubject.has(g.subjectName)) bySubject.set(g.subjectName, []); bySubject.get(g.subjectName).push(g); }
        const subjectsOut = [];
        for (const [subjectName, list] of bySubject) {
          const calc = await grades.calculateFinalGrade(child.id, period, subjectName);
          subjectsOut.push({
            subjectName,
            grades: list.filter((g) => String(g.gradeName || '').toLowerCase() !== 'nfinal')
              .map((g) => ({ gradeName: g.gradeName, gradeValue: g.gradeValue, appreciative: g.appreciative })),
            finalGrade: calc.finalGrade,
          });
        }
        periods.push({ period, subjects: subjectsOut });
      }
      children.push({
        studentId: child.id, name: child.name, surname: child.surname, grade: child.grade, classGroup: child.classGroup,
        documentNumber: child.documentNumber, active: child.active, periods,
      });
    }
    data.children = children;
  } else if (['TEACHER', 'DIRECTOR_DE_GRUPO'].includes(role.toUpperCase())) {
    data.assignedSubjects = (await subjects.findByTeacher(u.id)).map((s) => ({ name: s.name, code: s.code, level: s.level, gradeMin: s.gradeMin, gradeMax: s.gradeMax }));
    const h = (await query('SELECT grade, classroom FROM homeroom_assignments WHERE user_id = ? LIMIT 1', [u.id]))[0];
    if (h) data.homeroomAssignment = { grade: h.grade, classroom: h.classroom };
  }
  res.json(data);
}));

module.exports = router;
