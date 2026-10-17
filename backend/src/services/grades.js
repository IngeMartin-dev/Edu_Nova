'use strict';
const { query, one, exec } = require('../config/db');
const { nowSql } = require('../utils/dates');

const SELECT = `
  SELECT sg.id, sg.student_id, sg.teacher_id, sg.subject_name, sg.subject_id, sg.period, sg.grade_name,
         sg.grade_value, sg.is_evaluation, sg.appreciative, sg.created_at, sg.updated_at,
         s.name AS s_name, s.surname AS s_surname, s.grade AS s_grade, s.class_group AS s_class_group
    FROM subject_grades sg LEFT JOIN students s ON s.id = sg.student_id`;

function toGradeJson(r) {
  return {
    id: r.id,
    studentId: r.studentId,
    teacherId: r.teacherId ?? null,
    subjectName: r.subjectName,
    subjectId: r.subjectId ?? null,
    period: r.period,
    gradeName: r.gradeName,
    gradeValue: r.gradeValue,
    isEvaluation: r.isEvaluation === null || r.isEvaluation === undefined ? null : Boolean(r.isEvaluation),
    appreciative: r.appreciative ?? null,
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
    student: r.studentId
      ? { id: r.studentId, name: r.sName, surname: r.sSurname, grade: r.sGrade, classGroup: r.sClassGroup ?? null }
      : null,
  };
}

const r2 = (x) => Math.round(x * 100) / 100;

/** Notas de un estudiante (todas, o de un período). */
async function byStudent(studentId, period = null) {
  const rows = period === null
    ? await query(`${SELECT} WHERE sg.student_id = ? ORDER BY sg.id`, [studentId])
    : await query(`${SELECT} WHERE sg.student_id = ? AND sg.period = ? ORDER BY sg.id`, [studentId, period]);
  return rows.map(toGradeJson);
}

/** Notas de un salón y período, filtrando opcionalmente por profesor, materia o id de materia. */
async function byClassroom({ grade, classroom, period, teacherId = null, subjectName = null, subjectId = null }) {
  const where = ['s.grade = ?', 's.class_group = ?', 'sg.period = ?'];
  const params = [grade, classroom, period];
  if (teacherId) { where.push('sg.teacher_id = ?'); params.push(teacherId); }
  if (subjectId) {
    where.push('(sg.subject_id = ? OR sg.subject_id IS NULL)'); params.push(subjectId);
  } else if (subjectName && String(subjectName).trim()) {
    where.push('sg.subject_name = ?'); params.push(subjectName);
  }
  const rows = await query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY sg.id`, params);
  return rows.map(toGradeJson);
}

async function subjectNames(grade, classroom, period, teacherId = null) {
  const params = [grade, classroom, period];
  let extra = '';
  if (teacherId) { extra = ' AND sg.teacher_id = ?'; params.push(teacherId); }
  const rows = await query(
    `SELECT DISTINCT sg.subject_name FROM subject_grades sg JOIN students s ON s.id = sg.student_id
      WHERE s.grade = ? AND s.class_group = ? AND sg.period = ?${extra}`, params);
  return rows.map((r) => r.subjectName);
}

async function gradeNames(grade, classroom, period, subjectName, teacherId = null) {
  const params = [grade, classroom, period, subjectName];
  let extra = '';
  if (teacherId) { extra = ' AND sg.teacher_id = ?'; params.push(teacherId); }
  const rows = await query(
    `SELECT DISTINCT sg.grade_name FROM subject_grades sg JOIN students s ON s.id = sg.student_id
      WHERE s.grade = ? AND s.class_group = ? AND sg.period = ? AND sg.subject_name = ?${extra}`, params);
  return rows.map((r) => r.gradeName);
}

// ---------------------------------------------------------------------------
// Cálculo de la nota final
// ---------------------------------------------------------------------------

/** Lee la lista de columnas configuradas (JSON); tolera JSON roto usando objetos planos. */
function parseColumnObjects(columnsJson) {
  if (!columnsJson || !String(columnsJson).trim()) return [];
  try {
    const arr = JSON.parse(columnsJson);
    if (Array.isArray(arr)) return arr.filter((o) => o && typeof o === 'object');
  } catch (_) { /* cae al plan B */ }
  const out = [];
  const re = /\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(columnsJson)) !== null) {
    try { out.push(JSON.parse(m[0])); } catch (_) { /* ignora */ }
  }
  return out;
}
const strField = (o, k) => (typeof o[k] === 'string' ? o[k] : null);
const numField = (o, k) => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? o[k] : null);

/** Ponderación por columna/categoría con % de evaluación de período configurable. */
function calcPerColumnWeighted(grades, columnsJson) {
  const objs = parseColumnObjects(columnsJson);
  if (!objs.length) return null;

  const catPct = new Map();   // idCategoria -> pct
  const colToCat = new Map(); // nombreNota(minúsculas) -> idCategoria
  let evalPct = 20.0;

  for (const o of objs) {
    const id = strField(o, 'id');
    const name = strField(o, 'name');
    const kind = strField(o, 'kind');
    const cat = strField(o, 'cat');
    const pct = numField(o, 'pct');
    if (id === 'eval') {
      if (pct !== null) evalPct = Math.max(0, Math.min(100, pct));
    } else if (kind === 'col') {
      if (name !== null && cat !== null) colToCat.set(name.toLowerCase(), cat);
    } else if (kind === 'cat' || id === 'act') {
      if (id !== null && pct !== null && pct > 0) catPct.set(id, pct);
    } else if (name !== null && pct !== null && pct > 0) {
      const key = id !== null ? id : name;
      catPct.set(key, pct);
      colToCat.set(name.toLowerCase(), key);
    }
  }

  const simple = catPct.size === 0;
  if (simple) {
    if (evalPct === 20.0) return null; // sin configuración útil: se usa la fórmula 80/20 clásica
    catPct.set('__todas__', 1.0);
  }

  const acc = new Map(); // idCategoria -> [suma, cantidad]
  let evaluation = null;
  let appreciative = null;
  for (const g of grades) {
    if (g.appreciative) appreciative = g.appreciative;
    if (g.gradeValue === null || g.gradeValue === undefined) continue;
    if (g.isEvaluation) { evaluation = g.gradeValue; continue; }
    if (!g.gradeName) continue;
    const nombre = g.gradeName.toLowerCase();
    let catId;
    if (simple) catId = '__todas__';
    else if (catPct.has('act') && /^act0?[1-7]$/.test(nombre)) catId = 'act';
    else catId = colToCat.get(nombre);
    if (!catId || !catPct.has(catId)) continue;
    const a = acc.get(catId) || [0, 0];
    a[0] += g.gradeValue; a[1] += 1;
    acc.set(catId, a);
  }

  let suma = 0; let pesos = 0;
  for (const [catId, [s, n]] of acc) {
    const pct = catPct.get(catId);
    suma += (s / n) * pct;
    pesos += pct;
  }
  const promedio = pesos > 0 ? suma / pesos : 0;
  const p80 = promedio * ((100 - evalPct) / 100);
  const p20 = (evaluation !== null ? evaluation : 0) * (evalPct / 100);
  return {
    hasGrades: true, weighted: true,
    average80: r2(p80), evaluation20: r2(p20), finalGrade: r2(p80 + p20),
    appreciative: appreciative || '', regularGradesCount: grades.length, hasEvaluation: evaluation !== null,
  };
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/** Fórmula antigua: % por tipo de columna (Quiz / Taller / Actividad). */
function calcTypeWeighted(grades, config) {
  const tipoPorColumna = new Map();
  for (const o of parseColumnObjects(config.columnsJson)) {
    const name = strField(o, 'name'); const type = strField(o, 'type');
    if (name !== null && type !== null) tipoPorColumna.set(name, type);
  }
  const quizzes = []; const talleres = []; const actividades = [];
  let appreciative = null;
  for (const g of grades) {
    if (g.gradeValue === null || g.gradeValue === undefined || !g.gradeName) continue;
    const t = tipoPorColumna.get(g.gradeName);
    if (t === 'QUIZ') quizzes.push(g.gradeValue);
    else if (t === 'TALLER') talleres.push(g.gradeValue);
    else if (t === 'ACTIVIDAD') actividades.push(g.gradeValue);
    if (g.appreciative) appreciative = g.appreciative;
  }
  const pq = avg(quizzes); const pt = avg(talleres); const pa = avg(actividades);
  const final = pq * ((config.quizzesPct || 0) / 100) + pt * ((config.talleresPct || 0) / 100) + pa * ((config.actividadesPct || 0) / 100);
  return {
    hasGrades: true, weighted: true,
    average80: r2((pq + pt + pa) / 3), evaluation20: 0.0, finalGrade: r2(final),
    promQuiz: r2(pq), promTaller: r2(pt), promActividad: r2(pa),
    appreciative: appreciative || '', regularGradesCount: grades.length, hasEvaluation: false,
  };
}

async function getColumnConfig(teacherId, subjectName, grade, classroom, period) {
  return one(
    `SELECT * FROM grade_column_configs WHERE teacher_id = ? AND subject_name = ? AND grade = ? AND classroom = ? AND period = ?`,
    [teacherId, subjectName, grade, classroom, period]
  );
}

async function saveColumnConfig(teacherId, subjectName, grade, classroom, period, columnsJson, q, t, a) {
  const existing = await getColumnConfig(teacherId, subjectName, grade, classroom, period);
  const cols = columnsJson !== null && columnsJson !== undefined ? columnsJson : '[]';
  if (existing) {
    await exec(
      `UPDATE grade_column_configs SET columns_json = ?, quizzes_pct = ?, talleres_pct = ?, actividades_pct = ?, updated_at = ? WHERE id = ?`,
      [cols, q || 0, t || 0, a || 0, nowSql(), existing.id]
    );
    return getColumnConfig(teacherId, subjectName, grade, classroom, period);
  }
  await exec(
    `INSERT INTO grade_column_configs (teacher_id, subject_name, grade, classroom, period, columns_json, quizzes_pct, talleres_pct, actividades_pct, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [teacherId, subjectName, grade, classroom, period, cols, q || 0, t || 0, a || 0, nowSql(), nowSql()]
  );
  return getColumnConfig(teacherId, subjectName, grade, classroom, period);
}

/** Nota final de un estudiante en una materia y período. */
async function calculateFinalGrade(studentId, period, subjectName, teacherId = null) {
  const rows = teacherId
    ? await query(`${SELECT} WHERE sg.student_id = ? AND sg.period = ? AND sg.subject_name = ? AND sg.teacher_id = ?`, [studentId, period, subjectName, teacherId])
    : await query(`${SELECT} WHERE sg.student_id = ? AND sg.period = ? AND sg.subject_name = ?`, [studentId, period, subjectName]);
  const grades = rows.map(toGradeJson);

  if (!grades.length) {
    return { hasGrades: false, average80: 0.0, evaluation20: 0.0, finalGrade: 0.0, appreciative: '' };
  }
  // Si hay una nota final guardada a mano ("nFinal"), manda sobre el cálculo
  for (const g of grades) {
    if (String(g.gradeName || '').toLowerCase() === 'nfinal' && g.gradeValue !== null) {
      return {
        hasGrades: true, average80: g.gradeValue, evaluation20: 0.0, finalGrade: g.gradeValue,
        appreciative: '', regularGradesCount: grades.length, hasEvaluation: false, savedNFinal: true,
      };
    }
  }
  const st = await one('SELECT grade, class_group FROM students WHERE id = ?', [studentId]);
  if (st && teacherId) {
    const config = await getColumnConfig(teacherId, subjectName, st.grade, st.classGroup, period);
    if (config) {
      const perColumn = calcPerColumnWeighted(grades, config.columnsJson);
      return perColumn || calcTypeWeighted(grades, config);
    }
  }
  // Fórmula clásica: 80% promedio de notas + 20% evaluación de período
  const regular = [];
  let evaluation = null;
  let appreciative = null;
  for (const g of grades) {
    if (g.isEvaluation) evaluation = g.gradeValue; else regular.push(g);
    if (g.appreciative) appreciative = g.appreciative;
  }
  const withValue = regular.filter((g) => g.gradeValue !== null && g.gradeValue !== undefined);
  const average80 = regular.length ? withValue.reduce((s, g) => s + g.gradeValue, 0) / regular.length : 0;
  const eval20 = evaluation !== null && evaluation !== undefined ? evaluation : 0;
  const final = average80 * 0.8 + eval20 * 0.2;
  return {
    hasGrades: true, average80: r2(average80), evaluation20: r2(eval20), finalGrade: r2(final),
    appreciative: appreciative || '', regularGradesCount: regular.length, hasEvaluation: evaluation !== null && evaluation !== undefined,
  };
}

/** Escala cualitativa: S (4.6+), A (4.0+), B (1.0+), N.A */
function scaleLetter(g) {
  if (g === null || g === undefined) return 'N.A';
  if (g >= 4.6) return 'S';
  if (g >= 4.0) return 'A';
  if (g >= 1.0) return 'B';
  return 'N.A';
}

async function calculateAllFinalGrades(grade, classroom, period, teacherId = null) {
  const students = await query(
    'SELECT id, name, surname FROM students WHERE grade = ? AND class_group = ? ORDER BY surname, name', [grade, classroom]);
  const subjects = await subjectNames(grade, classroom, period, teacherId);
  const results = [];
  for (const st of students) {
    const subj = {};
    for (const name of subjects) {
      const info = {};
      for (let p = 1; p <= 4; p++) info[`period${p}`] = (await calculateFinalGrade(st.id, p, name, teacherId)).finalGrade;
      const current = await calculateFinalGrade(st.id, period, name, teacherId);
      info.nFinal = current.finalGrade;
      info.nFinalLetter = scaleLetter(current.finalGrade);
      subj[name] = info;
    }
    results.push({ studentId: st.id, studentName: `${st.surname} ${st.name}`, subjects: subj });
  }
  return results;
}

module.exports = {
  toGradeJson, byStudent, byClassroom, subjectNames, gradeNames,
  calculateFinalGrade, calculateAllFinalGrades, scaleLetter,
  getColumnConfig, saveColumnConfig, SELECT,
};
