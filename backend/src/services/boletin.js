'use strict';
/**
 * Boletines: preparación de datos, llenado de la plantilla y generación del PDF.
 * Port de BoletinService (Java). Las notas de todo el salón se cargan una sola vez
 * en memoria (ver loadContext) en vez de miles de consultas por boletín.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { query, one, exec } = require('../config/db');
const env = require('../config/env');
const { dirs, ensure, safeJoin } = require('../config/storage');
const { norm } = require('../utils/http');
const { nowSql } = require('../utils/dates');
const { fmt, escapeHtml, fileSafe, salonFolder } = require('../utils/format');
const { sniffImage } = require('../middleware/upload');
const pdf = require('./pdf');
const subjectsRepo = require('./subjects');
const schoolYear = require('./schoolYear');
const promotions = require('./promotions');

const VALORACION_ACUDIENTE = 'Valoracion Acudiente';
const COMPORTAMIENTO_SOCIAL = 'Comportamiento Social';
const MAX_MATERIAS_FIJAS = 35;
const MATERIA_FIJA_BASE = 16;
const TEMPLATE = path.resolve(__dirname, '../../templates/BoletinBase.html');

// ---------------------------------------------------------------------------
// Utilidades de escala
// ---------------------------------------------------------------------------
const nvl = (v, d) => (v === null || v === undefined ? d : v);

function valorLabel(g) {
  if (g === null || g === undefined) return 'N.A';
  if (g >= 4.6) return 'SUPERIOR';
  if (g >= 4.0) return 'ALTO';
  if (g >= 3.5) return 'BÁSICO';
  if (g >= 1.0) return 'BAJO';
  return 'N.A';
}
function scaleLetter(g) {
  if (g === null || g === undefined || g <= 0) return '';
  if (g >= 4.6) return 'S';
  if (g >= 4.0) return 'A';
  if (g >= 3.5) return 'B';
  if (g >= 1.0) return 'I';
  return '';
}
function escalaConductualLetra(n) {
  if (n === null || n === undefined || n <= 0) return '';
  if (n >= 4.6) return 'E';
  if (n >= 4.0) return 'S';
  if (n >= 3.5) return 'B';
  if (n >= 3.0) return 'A';
  if (n >= 1.0) return 'I';
  return '';
}
const CONDUCTUAL_LABEL = { E: 'EXCELENTE', S: 'SOBRESALIENTE', B: 'BUENO', A: 'ACEPTABLE', I: 'INSUFICIENTE' };
const escalaConductualLabel = (l) => CONDUCTUAL_LABEL[String(l || '').trim().toUpperCase()] || '';

function parseNumeroConductual(valor) {
  if (valor === null || valor === undefined) return null;
  const v = String(valor).trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  if (v !== '' && Number.isFinite(n)) return n <= 0 ? null : Math.max(0, Math.min(5, n));
  return { E: 4.8, S: 4.25, B: 3.7, A: 3.2, I: 2.0 }[v.toUpperCase()] ?? null;
}
function valoracionAcudienteNotaDeLetra(letra) {
  if (!letra) return null;
  return { E: 5, S: 4, B: 4, A: 3, I: 2 }[String(letra).trim().toUpperCase()] ?? null;
}
const indicadorTexto = (v) => (v !== null && v !== undefined && v > 0 ? fmt(v, 0) : '0');
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const parseGradeNumber = (g) => { const d = String(g || '').replace(/[^0-9]/g, ''); return d ? parseInt(d, 10) : 0; };
const getAcademicLevel = (grade) => (!grade ? 'PRIMARIA' : parseGradeNumber(grade) >= 9 ? 'BACHILLERATO' : 'PRIMARIA');
const isReservedSubjectName = (name) => {
  if (!name) return false;
  const n = norm(name);
  return n === 'comportamiento social' || n === 'valoracion acudiente';
};
function resolveLevelForGrade(n) {
  if (n <= 0) return null;
  if (n <= 5) return 'primaria';
  if (n <= 9) return 'bachillerato';
  if (n <= 11) return 'media';
  return null;
}
const toDouble = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------------------------------------------------------------------------
// Contexto en memoria de un salón
// ---------------------------------------------------------------------------
async function loadContext(grade, classroom) {
  const students = await query(
    'SELECT id, name, surname, grade, class_group FROM students WHERE grade = ? AND class_group = ? ORDER BY id', [grade, classroom]);
  const ids = students.map((s) => s.id);
  const ctx = {
    grade, classroom, students,
    byId: new Map(students.map((s) => [s.id, s])),
    grades: new Map(),       // `${studentId}|${period}|${subjectNorm}` -> filas
    subjectNames: new Map(), // subjectNorm -> nombre original (de todas las notas del salón)
    recovery: new Map(),     // `${studentId}|${subjectNorm}|${period}` -> fila
    valoraciones: new Map(), // `${studentId}|${period}` -> nota
    minPassing: Number((await schoolYear.getConfig()).minPassingGrade ?? 3.5),
  };
  if (!ids.length) return ctx;

  const rows = await query(
    `SELECT id, student_id, period, subject_name, grade_name, grade_value, is_evaluation
       FROM subject_grades WHERE student_id IN (?) ORDER BY id`, [ids]);
  for (const r of rows) {
    const sn = norm(r.subjectName);
    const key = `${r.studentId}|${r.period}|${sn}`;
    if (!ctx.grades.has(key)) ctx.grades.set(key, []);
    ctx.grades.get(key).push(r);
    if (!ctx.subjectNames.has(sn)) ctx.subjectNames.set(sn, r.subjectName);
  }
  for (const r of await query(
    'SELECT id, student_id, subject_name, period, comp_social, valoracion_acudiente FROM recovery_data WHERE student_id IN (?) ORDER BY id', [ids])) {
    const key = `${r.studentId}|${norm(r.subjectName)}|${r.period}`;
    if (!ctx.recovery.has(key)) ctx.recovery.set(key, r);
  }
  for (const r of await query('SELECT student_id, period, nota FROM boletin_valoraciones WHERE student_id IN (?)', [ids])) {
    ctx.valoraciones.set(`${r.studentId}|${r.period}`, r.nota);
  }
  return ctx;
}

const gradesOf = (ctx, studentId, period, subject) => ctx.grades.get(`${studentId}|${period}|${norm(subject)}`) || [];

/** Nota final del período: la guardada como "nFinal" o, si no hay, 80% actividades + 20% evaluación. */
function nFinalFallback(ctx, studentId, period, subject) {
  let sum = 0; let count = 0; let evalVal = null;
  for (const g of gradesOf(ctx, studentId, period, subject)) {
    const name = String(g.gradeName || '').trim().toLowerCase();
    if (g.isEvaluation) evalVal = g.gradeValue;
    else if (name.startsWith('act') && name.length <= 4 && g.gradeValue !== null) { sum += g.gradeValue; count += 1; }
  }
  if (count > 0 && evalVal !== null && evalVal !== undefined) return (sum / count) * 0.8 + evalVal * 0.2;
  return null;
}
function savedNFinal(ctx, studentId, period, subject) {
  const g = gradesOf(ctx, studentId, period, subject).find((x) => String(x.gradeName || '').toLowerCase() === 'nfinal');
  return g && g.gradeValue !== null ? g.gradeValue : null;
}
function nFinalOf(ctx, studentId, period, subject) {
  const saved = savedNFinal(ctx, studentId, period, subject);
  return saved !== null ? saved : nFinalFallback(ctx, studentId, period, subject);
}

/** Materias del boletín según el grado (catálogo por nivel/rango; si no hay, las que tienen notas). */
async function subjectsFor(ctx, grade) {
  const n = parseGradeNumber(grade);
  const level = resolveLevelForGrade(n);
  const all = await subjectsRepo.findAll();
  const inRange = all.filter((s) => s.gradeMin !== null && s.gradeMax !== null && s.gradeMin <= n && s.gradeMax >= n)
    .sort((a, b) => (String(a.level) < String(b.level) ? -1 : String(a.level) > String(b.level) ? 1 : a.name < b.name ? -1 : 1));
  const unique = (list) => {
    const m = new Map();
    for (const s of list) {
      const k = nvl(s.name, '').trim().toUpperCase();
      if (k && !m.has(k)) m.set(k, s);
    }
    return [...m.values()].map((s) => s.name).filter((x) => !isReservedSubjectName(x)).sort();
  };
  if (level && n > 0) {
    const byLevel = inRange.filter((s) => String(s.level).toLowerCase() === level);
    if (byLevel.length) return unique(byLevel);
  }
  if (inRange.length) return unique(inRange);
  return [...ctx.subjectNames.values()].filter((x) => !isReservedSubjectName(x));
}

function promedioConductual(ctx, studentId, period, subjectNames, esAcudiente) {
  if (!studentId || !period || !subjectNames || !subjectNames.length) return null;
  const vals = [];
  for (const s of subjectNames) {
    const rd = ctx.recovery.get(`${studentId}|${norm(s)}|${period}`);
    if (!rd) continue;
    const v = parseNumeroConductual(esAcudiente ? rd.valoracionAcudiente : rd.compSocial);
    if (v !== null) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Promedio del período usado para el puesto (todas las materias con notas del salón). */
function studentAverage(ctx, studentId, period) {
  let sum = 0; let count = 0;
  for (const subject of ctx.subjectNames.values()) {
    if (isReservedSubjectName(subject)) continue;
    const saved = savedNFinal(ctx, studentId, period, subject);
    if (saved !== null) { sum += saved; count += 1; continue; }
    const fb = nFinalFallback(ctx, studentId, period, subject);
    if (fb !== null) { sum += fb; count += 1; continue; }
    const ev = gradesOf(ctx, studentId, period, subject).find((g) => g.isEvaluation && g.gradeValue !== null);
    if (ev) { sum += ev.gradeValue; count += 1; }
  }
  return count > 0 ? sum / count : null;
}

// ---------------------------------------------------------------------------
// Datos del boletín
// ---------------------------------------------------------------------------
async function prepareBoletinData(studentId, grade, classroom, period, ctxIn = null) {
  const student = await one('SELECT id, name, surname, grade, class_group, document_number FROM students WHERE id = ?', [studentId]);
  if (!student) return null;
  const ctx = ctxIn || (await loadContext(grade, classroom));
  if (!ctx.byId.has(studentId)) ctx.byId.set(studentId, student);

  const subjects = await subjectsFor(ctx, grade);
  const subjectData = [];
  let total = 0; let count = 0;
  const lostAreas = [];

  for (const subject of subjects) {
    if (isReservedSubjectName(subject)) continue;
    let ih = null; let fa = null; let faa = null;
    for (let p = 1; p <= 4; p++) {
      for (const g of gradesOf(ctx, studentId, p, subject)) {
        const name = String(g.gradeName || '').trim().toLowerCase();
        if (name === 'ih') ih = g.gradeValue;
        else if (name === 'fa') fa = g.gradeValue;
        else if (name === 'faa') faa = g.gradeValue;
      }
    }
    const nFinal = nFinalOf(ctx, studentId, period, subject);
    const nPeriod = [1, 2, 3, 4].map((p) => nFinalOf(ctx, studentId, p, subject));
    subjectData.push({
      subjectName: subject, ih, fa, faa, nFinal,
      nFinalPeriod1: nPeriod[0], nFinalPeriod2: nPeriod[1], nFinalPeriod3: nPeriod[2], nFinalPeriod4: nPeriod[3],
      objetivoPeriodo: null,
    });
    if (nFinal !== null) {
      total += nFinal; count += 1;
      if (nFinal < ctx.minPassing) lostAreas.push(subject);
    }
  }
  const average = count > 0 ? total / count : null;
  const calcCompSocial = escalaConductualLetra(promedioConductual(ctx, studentId, period, subjects, false));
  const calcValoracion = escalaConductualLetra(promedioConductual(ctx, studentId, period, subjects, true));

  // puesto: promedio de mayor a menor (los sin nota al final; empates por orden de id)
  const ranked = ctx.students
    .map((s) => ({ id: s.id, avg: studentAverage(ctx, s.id, period) }))
    .sort((a, b) => (a.avg === null && b.avg === null ? 0 : a.avg === null ? 1 : b.avg === null ? -1 : b.avg - a.avg));
  let rank = 1;
  for (let i = 0; i < ranked.length; i++) if (ranked[i].id === studentId) { rank = i + 1; break; }

  // número de lista: orden alfabético por apellido
  const lista = [...ctx.students].sort((a, b) => (nvl(a.surname, '') < nvl(b.surname, '') ? -1 : nvl(a.surname, '') > nvl(b.surname, '') ? 1 : 0));
  const idx = lista.findIndex((s) => s.id === studentId);

  return {
    student: { ...student, fullName: `${nvl(student.name, '')} ${nvl(student.surname, '')}`.trim() },
    grade, classroom, period,
    city: 'Cartagena', jornada: 'ÚNICA',
    schoolYear: String(new Date().getFullYear()),
    academicLevel: getAcademicLevel(grade),
    nLista: idx >= 0 ? idx + 1 : null,
    subjects: subjectData,
    average, rank, lostAreas,
    compSocial: calcCompSocial,
    valoracionAcudiente: calcValoracion,
    valoracionAcudienteNota: valoracionAcudienteNotaDeLetra(calcValoracion),
    objetivoPeriodo: null, compSocialObjetivo: null, compSocialIndicadores: null,
    compSocialIh: null, compSocialFa: null, compSocialFaa: null,
    valoracionAcudienteIh: null, valoracionAcudienteFa: null, valoracionAcudienteFaa: null, valoracionAcudienteObjetivo: null,
    rightSignatureUri: '', leftSignatureUri: '', directorName: null,
    _ctx: ctx,
  };
}

/** Aplica los ih/fa/faa/objetivo que el profesor escribió en pantalla. */
function applySubjectIndicators(data, indicators) {
  if (!data || !Array.isArray(indicators)) return;
  const pos = (v) => { const d = toDouble(v); return d !== null && d > 0 ? d : null; };
  for (const ind of indicators) {
    const name = ind && ind.subjectName;
    if (typeof name !== 'string') continue;
    const objetivo = ind.objetivoPeriodo !== null && ind.objetivoPeriodo !== undefined ? String(ind.objetivoPeriodo).trim() : '';
    if (name.toLowerCase() === VALORACION_ACUDIENTE.toLowerCase()) {
      if (pos(ind.ih) !== null) data.valoracionAcudienteIh = pos(ind.ih);
      if (pos(ind.fa) !== null) data.valoracionAcudienteFa = pos(ind.fa);
      if (pos(ind.faa) !== null) data.valoracionAcudienteFaa = pos(ind.faa);
      if (objetivo) data.valoracionAcudienteObjetivo = objetivo;
      continue;
    }
    if (name.toLowerCase() === COMPORTAMIENTO_SOCIAL.toLowerCase()) {
      if (pos(ind.ih) !== null) data.compSocialIh = pos(ind.ih);
      if (pos(ind.fa) !== null) data.compSocialFa = pos(ind.fa);
      if (pos(ind.faa) !== null) data.compSocialFaa = pos(ind.faa);
      if (objetivo) data.compSocialObjetivo = objetivo;
      continue;
    }
    const sd = (data.subjects || []).find((s) => s.subjectName.toLowerCase() === name.toLowerCase());
    if (!sd) continue;
    if (ind.ih !== null && ind.ih !== undefined) sd.ih = toDouble(ind.ih);
    if (ind.fa !== null && ind.fa !== undefined) sd.fa = toDouble(ind.fa);
    if (ind.faa !== null && ind.faa !== undefined) sd.faa = toDouble(ind.faa);
    if (objetivo) sd.objetivoPeriodo = objetivo;
  }
}

// ---------------------------------------------------------------------------
// Llenado de la plantilla
// ---------------------------------------------------------------------------
function calcularAcumulado(sd, periodoActual) {
  if (!sd) return 0;
  const limite = Math.max(1, Math.min(4, periodoActual));
  let acc = 0;
  for (let p = 1; p <= limite; p++) acc = 0.25 * (sd[`nFinalPeriod${p}`] ?? 0) + acc;
  return acc;
}

function fillMateriaSlot(r, n, sd, periodoActual) {
  const nota = sd && periodoActual ? sd[`nFinalPeriod${periodoActual}`] ?? null : null;
  r[`{{MATERIA_${n}}}`] = sd ? escapeHtml(nvl(sd.subjectName, '').toUpperCase()) : '';
  r[`{{OBJETIVO_${n}}}`] = sd ? escapeHtml(nvl(sd.objetivoPeriodo, '')) : '';
  r[`{{IH_${n}}}`] = sd && sd.ih !== null && sd.ih !== undefined ? fmt(sd.ih, 0) : '';
  r[`{{FA_${n}}}`] = sd && sd.fa !== null && sd.fa !== undefined ? fmt(sd.fa, 0) : '';
  r[`{{FAA_${n}}}`] = sd && sd.faa !== null && sd.faa !== undefined ? fmt(sd.faa, 0) : '';
  r[`{{ESCALA_FINAL_${n}}}`] = nota !== null ? valorLabel(nota) : '';
  r[`{{NOTA_${n}}}`] = nota !== null ? fmt(nota) : '';
  r[`{{ACUMULADO_${n}}}`] = sd && periodoActual ? `${fmt(calcularAcumulado(sd, periodoActual))}%` : '';
  for (let p = 1; p <= 4; p++) {
    const nf = sd ? sd[`nFinalPeriod${p}`] ?? null : null;
    const futuro = periodoActual && p > periodoActual;
    let texto; let letra;
    if (!sd) { texto = ''; letra = ''; }
    else if (futuro) { texto = '0'; letra = ''; }
    else if (nf !== null) { texto = fmt(nf); letra = scaleLetter(nf); }
    else { texto = '0'; letra = ''; }
    r[`{{P${p}_${n}}}`] = texto;
    r[`{{ESCALA_P${p}_${n}}}`] = letra;
  }
}

const DEFAULT_VALORACION_OBJETIVO =
  'Asiste a las reuniones de padres de familia, citaciones y escuela para padres programadas por la ' +
  'instituci&oacute;n y establecidas en el manual de convivencia.';

function fillCierreSlots(r, data) {
  const ctx = data._ctx;
  const studentId = data.student ? data.student.id : null;
  const subjectNames = (data.subjects || []).map((s) => s.subjectName).filter(Boolean);
  const periodoActual = data.period;

  // --- Comportamiento social ---
  r['{{IH_COMPORTAMIENTO}}'] = indicadorTexto(data.compSocialIh);
  r['{{FA_COMPORTAMIENTO}}'] = indicadorTexto(data.compSocialFa);
  r['{{FAA_COMPORTAMIENTO}}'] = indicadorTexto(data.compSocialFaa);
  r['{{COMPORTAMIENTO_SOCIAL}}'] = escapeHtml(nvl(data.compSocialObjetivo, ''));
  const manualCS = parseNumeroConductual(data.compSocial);
  let accCS = 0; let notaCS = null; let letraFinalCS = '';
  for (let p = 1; p <= 4; p++) {
    const futuro = periodoActual && p > periodoActual;
    let valor;
    if (futuro) valor = null;
    else if (periodoActual && p === periodoActual && manualCS !== null) valor = manualCS;
    else valor = ctx ? promedioConductual(ctx, studentId, p, subjectNames, false) : null;
    const letra = escalaConductualLetra(valor);
    r[`{{P${p}_COMPORTAMIENTO}}`] = '';
    r[`{{ESCALA_P${p}_COMPORTAMIENTO}}`] = letra;
    if (!futuro && valor !== null) accCS = 0.25 * valor + accCS;
    if (periodoActual && p === periodoActual) { notaCS = valor; letraFinalCS = letra; }
  }
  r['{{ESCALA_FINAL_COMPORTAMIENTO}}'] = escalaConductualLabel(letraFinalCS);
  r['{{NOTA_COMPORTAMIENTO}}'] = notaCS !== null ? fmt(notaCS) : '';
  r['{{ACUMULADO_COMPORTAMIENTO}}'] = periodoActual ? `${fmt(accCS)}%` : '';

  // --- Valoración del acudiente ---
  let manualVA = parseNumeroConductual(data.valoracionAcudiente);
  if (manualVA === null && data.valoracionAcudienteNota && data.valoracionAcudienteNota > 0) manualVA = data.valoracionAcudienteNota;
  let accVA = 0; let notaVA = null; let letraFinalVA = '';
  const periodoParaCalculo = periodoActual || 1;
  for (let p = 1; p <= 4; p++) {
    const futuro = periodoActual && p > periodoActual;
    let valor;
    if (futuro) valor = null;
    else if (periodoActual && p === periodoActual && manualVA !== null) valor = manualVA;
    else {
      valor = ctx && ctx.valoraciones.has(`${studentId}|${p}`) ? ctx.valoraciones.get(`${studentId}|${p}`) : null;
      if (valor === null && ctx) valor = promedioConductual(ctx, studentId, p, subjectNames, true);
    }
    if (!futuro && valor === null && periodoActual && p === periodoActual) valor = 5.0;
    let letra = escalaConductualLetra(valor);
    if (!letra && p === periodoParaCalculo) letra = 'E';
    r[`{{P${p}_ACUDIENTE}}`] = valor !== null ? fmt(valor) : '0';
    r[`{{ESCALA_P${p}_ACUDIENTE}}`] = letra;
    if (!futuro && valor !== null) accVA = 0.25 * valor + accVA;
    if (periodoActual && p === periodoActual) { notaVA = valor !== null ? valor : 5.0; letraFinalVA = letra; }
  }
  if (!letraFinalVA) letraFinalVA = 'E';
  r['{{IH_ACUDIENTE}}'] = indicadorTexto(data.valoracionAcudienteIh);
  r['{{FA_ACUDIENTE}}'] = indicadorTexto(data.valoracionAcudienteFa);
  r['{{FAA_ACUDIENTE}}'] = indicadorTexto(data.valoracionAcudienteFaa);
  r['{{ESCALA_FINAL_ACUDIENTE}}'] = escalaConductualLabel(letraFinalVA);
  r['{{NOTA_ACUDIENTE}}'] = notaVA !== null ? fmt(notaVA) : '0';
  r['{{ACUMULADO_ACUDIENTE}}'] = periodoActual ? `${fmt(accVA)}%` : '';
  r['{{VALORACION_ACUDIENTE}}'] = data.valoracionAcudienteObjetivo && data.valoracionAcudienteObjetivo.trim()
    ? escapeHtml(data.valoracionAcudienteObjetivo) : DEFAULT_VALORACION_OBJETIVO;
}

function collapseCuposVacios(html, total) {
  const paginaALlena = total > MATERIA_FIJA_BASE;
  const paginaBLlena = total > MATERIA_FIJA_BASE + 12;
  for (let n = MATERIA_FIJA_BASE + 1; n <= MAX_MATERIAS_FIJAS; n++) {
    if (n > total) {
      html = html.replace(`<div class="materia-block" data-slot="${n}">`, `<div class="materia-block materia-block--vacio" data-slot="${n}">`);
    }
  }
  if (!paginaALlena) html = html.replace('<div class="materia-ext-page" data-ext-page="A">', '<div class="materia-ext-page materia-ext-page--vacia" data-ext-page="A">');
  if (!paginaBLlena) html = html.replace('<div class="materia-ext-page" data-ext-page="B">', '<div class="materia-ext-page materia-ext-page--vacia" data-ext-page="B">');
  return html;
}

function buildBoletinHtml(data) {
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const subjects = data.subjects || [];
  const areasPerdidas = !data.lostAreas || !data.lostAreas.length ? 'NINGUNA' : data.lostAreas.join(', ').toUpperCase();
  const r = {
    '{{NOMBRE_INSTITUCION}}': escapeHtml(env.institution.name.toUpperCase()),
    '{{CIUDAD}}': escapeHtml(nvl(data.city, 'Cartagena')),
    '{{GRADO}}': escapeHtml(nvl(data.grade, '')),
    '{{GRUPO}}': escapeHtml(nvl(data.classroom, '')),
    '{{JORNADA}}': escapeHtml(nvl(data.jornada, 'ÚNICA')),
    '{{PERIODO}}': escapeHtml(data.period ? String(data.period) : ''),
    '{{AÑO}}': escapeHtml(nvl(data.schoolYear, String(new Date().getFullYear()))),
    '{{NIVEL_ACADEMICO}}': escapeHtml(data.academicLevel ? capitalize(data.academicLevel) : ''),
    '{{NUMERO_LISTA}}': escapeHtml(data.nLista ? String(data.nLista) : ''),
    '{{NOMBRE_ESTUDIANTE}}': escapeHtml(data.student && data.student.fullName ? data.student.fullName.toUpperCase() : ''),
    '{{PUESTO}}': escapeHtml(data.rank ? String(data.rank) : ''),
    '{{PROMEDIO}}': data.average !== null && data.average !== undefined ? fmt(data.average) : fmt(0),
    '{{DESEMPENO_GENERAL}}': escapeHtml(data.average !== null && data.average !== undefined ? valorLabel(data.average) : 'N.A'),
    '{{AREAS_PERDIDAS}}': escapeHtml(areasPerdidas),
    '{{DIRECTOR_NOMBRE}}': escapeHtml(nvl(data.directorName, '')),
    '{{FIRMA_IMAGEN}}': data.rightSignatureUri || '',
  };
  for (let i = 0; i < MAX_MATERIAS_FIJAS; i++) fillMateriaSlot(r, i + 1, subjects[i] || null, data.period);
  fillCierreSlots(r, data);
  let html = template;
  for (const [k, v] of Object.entries(r)) html = html.split(k).join(v);
  return collapseCuposVacios(html, subjects.length);
}

// ---------------------------------------------------------------------------
// Archivos (PDF) y firmas
// ---------------------------------------------------------------------------
function nombreArchivoBoletin(student) {
  const apellido = student && student.surname ? student.surname : '';
  const nombre = student && student.name ? student.name : 'estudiante';
  let base = `BOLETIN_${apellido}_${nombre}`.trim().replace(/\s+/g, '_');
  base = base.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9_]/g, '');
  return `${base || 'BOLETIN_estudiante'}.pdf`;
}

function periodoSalonDir(period, grade, classroom) {
  return ensure(safeJoin(dirs.boletines, `Periodo ${period || 1}`, salonFolder(grade, classroom)));
}

async function saveBoletinPdf(data) {
  const html = buildBoletinHtml(data);
  const bytes = await pdf.htmlToPdf(html);
  if (!bytes || !bytes.length) return null;
  const target = path.join(periodoSalonDir(data.period, data.grade, data.classroom), nombreArchivoBoletin(data.student));
  fs.writeFileSync(target, bytes);
  await require('./fileVault').persist(target, bytes);
  return target;
}

function generatedPath(student, period) {
  if (!student || !student.grade || !student.classGroup) return null;
  return path.join(periodoSalonDir(period, student.grade, student.classGroup), nombreArchivoBoletin(student));
}

function listGeneratedForStudent(student) {
  const out = [];
  for (let p = 1; p <= 4; p++) {
    const f = generatedPath(student, p);
    if (f && fs.existsSync(f)) {
      const st = fs.statSync(f);
      out.push({ period: p, fileName: path.basename(f), sizeBytes: st.size, generatedAt: st.mtime.toISOString() });
    }
  }
  return out;
}

function readGeneratedFile(student, period) {
  const f = generatedPath(student, period);
  return f && fs.existsSync(f) ? fs.readFileSync(f) : null;
}

/** Rutas de los PDF de un estudiante por período (las usa el archivo de promociones). */
async function locateStudentBoletines(student) {
  const out = {};
  const s = { ...student, classGroup: student.classGroup ?? student.class_group };
  const archivo = nombreArchivoBoletin(s);
  const folder = salonFolder(s.grade, s.classGroup);
  for (let p = 1; p <= 4; p++) {
    const f = path.join(dirs.boletines, `Periodo ${p}`, folder, archivo);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) out[p] = f;
  }
  return out;
}
promotions.setPdfLocator(locateStudentBoletines);

/** "/Firmas/xxx.png" -> data URI (solo dentro de la carpeta de firmas) o data URI ya válido. */
function signatureToUri(p) {
  if (!p || typeof p !== 'string') return '';
  if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(p)) return p;
  if (!p.startsWith('/Firmas/')) return '';
  try {
    const file = safeJoin(dirs.firmas, p.slice('/Firmas/'.length));
    const buf = fs.readFileSync(file);
    const ext = sniffImage(buf);
    if (!ext) return '';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${buf.toString('base64')}`;
  } catch (_) { return ''; }
}

function listSignatures() {
  try {
    ensure(dirs.firmas);
    return fs.readdirSync(dirs.firmas, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => `/Firmas/${e.name}`);
  } catch (_) { return []; }
}

function saveSignature(buffer) {
  const ext = sniffImage(buffer);
  if (!ext) throw new Error('Solo se permiten imágenes (jpg, png, gif o webp)');
  ensure(dirs.firmas);
  const filename = `signature_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dirs.firmas, filename), buffer);
  require('./fileVault').persist(path.join(dirs.firmas, filename), buffer);
  return `/Firmas/${filename}`;
}

// ---------------------------------------------------------------------------
// Generación individual / por lotes
// ---------------------------------------------------------------------------
const toIntOrNull = (v) => { if (v === null || v === undefined || v === '') return null; const n = parseInt(String(v), 10); return Number.isNaN(n) ? null : n; };
const posNumber = (v) => { const n = Number(String(v)); return Number.isFinite(n) && n > 0 ? n : null; };
const strOrNull = (v) => (v === null || v === undefined ? null : String(v));

/** Prepara los datos y aplica lo que el usuario modificó en pantalla. */
async function buildFromRequest(req, ctx = null) {
  const studentId = toIntOrNull(req.studentId);
  const grade = strOrNull(req.grade);
  const classroom = strOrNull(req.classroom);
  const period = toIntOrNull(req.period);
  if (!studentId || !grade || !classroom || !period) {
    return { error: 'Faltan parámetros: studentId, grade, classroom o period' };
  }
  const data = await prepareBoletinData(studentId, grade, classroom, period, ctx);
  if (!data) return { error: `Estudiante no encontrado: id=${studentId}`, studentId };

  if (req.nLista !== undefined && req.nLista !== null) data.nLista = toIntOrNull(req.nLista);
  if (req.schoolYear !== undefined && req.schoolYear !== null) data.schoolYear = String(req.schoolYear);
  if (req.objetivoPeriodo !== undefined && req.objetivoPeriodo !== null) data.objetivoPeriodo = String(req.objetivoPeriodo);
  if (req.compSocial !== undefined && req.compSocial !== null) data.compSocial = String(req.compSocial);
  if (req.compSocialObjetivo !== undefined && req.compSocialObjetivo !== null) data.compSocialObjetivo = String(req.compSocialObjetivo);
  if (req.compSocialIndicadores !== undefined && req.compSocialIndicadores !== null) data.compSocialIndicadores = String(req.compSocialIndicadores);
  if (posNumber(req.compSocialIh) !== null) data.compSocialIh = posNumber(req.compSocialIh);
  if (posNumber(req.compSocialFa) !== null) data.compSocialFa = posNumber(req.compSocialFa);
  if (posNumber(req.compSocialFaa) !== null) data.compSocialFaa = posNumber(req.compSocialFaa);

  const valNota = toIntOrNull(req.valoracionAcudienteNota);
  if (valNota && valNota > 0) data.valoracionAcudienteNota = valNota;
  else if (data.valoracionAcudienteNota === null) data.valoracionAcudienteNota = 5;
  const valAcudiente = strOrNull(req.valoracionAcudiente);
  if (valAcudiente && valAcudiente.trim()) data.valoracionAcudiente = valAcudiente;

  let notaGuardar = parseNumeroConductual(valAcudiente);
  if (notaGuardar === null && valNota && valNota > 0) notaGuardar = valNota;
  if (notaGuardar !== null && notaGuardar > 0) {
    await exec(
      `INSERT INTO boletin_valoraciones (student_id, period, nota, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nota = VALUES(nota), updated_at = VALUES(updated_at)`,
      [studentId, period, notaGuardar, nowSql()]);
    data._ctx.valoraciones.set(`${studentId}|${period}`, notaGuardar);
  }

  if (req.directorSignature) data.rightSignatureUri = signatureToUri(String(req.directorSignature));
  if (req.directorName !== undefined && req.directorName !== null) data.directorName = String(req.directorName);
  if (req.leftSignature) data.leftSignatureUri = signatureToUri(String(req.leftSignature));
  if (Array.isArray(req.studentSubjectIndicators)) applySubjectIndicators(data, req.studentSubjectIndicators);
  return { data };
}

/** Genera y guarda un boletín. Devuelve { success, error?, savedPath?, fileName?, studentId, studentName } */
async function generateSingleFromPayload(req, ctx = null) {
  const result = { success: false, studentId: toIntOrNull(req.studentId) };
  try {
    const built = await buildFromRequest(req, ctx);
    if (built.error) { result.error = built.error; return result; }
    const { data } = built;
    result.studentName = `${data.student.surname} ${data.student.name}`;
    let saved;
    try {
      saved = await saveBoletinPdf(data);
    } catch (e) {
      result.error = `Error guardando PDF: ${e.message}`;
      result.trace = e.stack;
      return result;
    }
    if (!saved) { result.error = 'Ruta de PDF vacía'; return result; }
    result.success = true;
    result.savedPath = saved;
    result.fileName = nombreArchivoBoletin(data.student);
    result.data = data;
    return result;
  } catch (e) {
    result.error = `Error general: ${e.name} – ${e.message}`;
    return result;
  }
}

// --- Trabajos en segundo plano (generación masiva) ---
const jobs = new Map();
const MAX_JOBS = 100;

function publicJob(job) {
  return {
    jobId: job.jobId, grade: job.grade, classroom: job.classroom, period: job.period,
    total: job.total, prepared: job.prepared, completed: job.completed, status: job.status, phase: job.phase,
    startedAt: job.startedAt, finishedAt: job.finishedAt, errors: job.errors,
    files: job.files.map((f) => ({ studentId: f.studentId, studentName: f.studentName, fileName: f.fileName })),
  };
}

function startGenerationJob(grade, classroom, period, payloads) {
  const job = {
    jobId: crypto.randomUUID(), grade, classroom, period, total: payloads.length, prepared: 0, completed: 0,
    status: 'RUNNING', phase: 'PREPARING', startedAt: new Date().toISOString().slice(0, 19), finishedAt: null, errors: [], files: [],
  };
  jobs.set(job.jobId, job);
  if (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);
  processJob(job, payloads).catch((e) => { job.errors.push(`Error general del job: ${e.message}`); job.status = 'ERROR'; job.finishedAt = new Date().toISOString().slice(0, 19); });
  return publicJob(job);
}

async function processJob(job, payloads) {
  try {
    const ctx = await loadContext(job.grade, job.classroom); // se comparte entre todos los boletines del lote
    job.prepared = job.total;
    job.phase = 'RENDERING';
    let next = 0;
    const worker = async () => {
      while (next < payloads.length) {
        const payload = payloads[next++];
        try {
          const res = await generateSingleFromPayload({ ...payload, grade: payload.grade || job.grade, classroom: payload.classroom || job.classroom, period: payload.period || job.period }, ctx);
          if (res.success) job.files.push({ studentId: res.studentId, studentName: res.studentName, fileName: res.fileName, filePath: res.savedPath });
          else job.errors.push(`${nvl(res.studentName, 'Estudiante')}: ${res.error}`);
        } catch (e) { job.errors.push(`Error inesperado: ${e.message}`); }
        job.completed += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, env.pdf.concurrency) }, worker));
    job.status = !job.files.length && job.errors.length ? 'ERROR' : 'DONE';
  } catch (e) {
    job.errors.push(`Error general del job: ${e.message}`);
    job.status = 'ERROR';
  } finally {
    job.finishedAt = new Date().toISOString().slice(0, 19);
  }
}

const listJobs = () => [...jobs.values()].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, 30).map(publicJob);
const getJob = (id) => jobs.get(id) || null;

// ---------------------------------------------------------------------------
// Consultas auxiliares para los controladores
// ---------------------------------------------------------------------------
const studentsByGradeClassroom = (grade, classroom) => query(
  'SELECT id, name, surname, grade, class_group, document_number, active FROM students WHERE grade = ? AND class_group = ? ORDER BY id', [grade, classroom]
).then((rows) => rows.map((s) => ({ id: s.id, name: s.name, surname: s.surname, grade: s.grade, classGroup: s.classGroup, documentNumber: s.documentNumber, active: Boolean(s.active), fullName: `${s.name} ${s.surname}`.trim() })));

async function subjectsWithGrades(grade, classroom, period) {
  const rows = await query(
    `SELECT DISTINCT sg.subject_name FROM subject_grades sg JOIN students s ON s.id = sg.student_id
      WHERE s.grade = ? AND s.class_group = ? AND sg.period = ?`, [grade, classroom, period]);
  return rows.map((r) => r.subjectName);
}

async function subjectsForGradeClassroom(grade, classroom) {
  const ctx = await loadContext(grade, classroom);
  return subjectsFor(ctx, grade);
}

async function averagesOfSalon(grade, classroom, period) {
  const ctx = await loadContext(grade, classroom);
  const items = ctx.students.map((s) => ({ studentId: s.id, name: `${s.surname} ${s.name}`, average: studentAverage(ctx, s.id, period) }));
  return items.sort((a, b) => (a.average === null && b.average === null ? 0 : a.average === null ? 1 : b.average === null ? -1 : b.average - a.average));
}

async function lostSubjectsOfSalon(grade, classroom, period) {
  const ctx = await loadContext(grade, classroom);
  const subjects = await subjectsFor(ctx, grade);
  const out = [];
  for (const s of ctx.students) {
    const perdidas = subjects.filter((sub) => { const n = nFinalOf(ctx, s.id, period, sub); return n !== null && n < ctx.minPassing; });
    if (perdidas.length) out.push({ studentId: s.id, name: `${s.surname} ${s.name}`, lostSubjects: perdidas });
  }
  return out;
}

async function saveObjetivos(grade, classroom, period, payload) {
  await exec(
    `INSERT INTO boletin_objetivos (grade, classroom, period, payload, updated_at) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)`,
    [grade, classroom, period, payload, nowSql()]);
  return one('SELECT id FROM boletin_objetivos WHERE grade = ? AND classroom = ? AND period = ?', [grade, classroom, period]);
}
const listObjetivos = (grade, classroom) => query('SELECT period, updated_at FROM boletin_objetivos WHERE grade = ? AND classroom = ? ORDER BY period', [grade, classroom]);
const getObjetivos = (grade, classroom, period) => one('SELECT period, payload FROM boletin_objetivos WHERE grade = ? AND classroom = ? AND period = ?', [grade, classroom, period]);

module.exports = {
  VALORACION_ACUDIENTE, COMPORTAMIENTO_SOCIAL,
  loadContext, prepareBoletinData, buildBoletinHtml, buildFromRequest, generateSingleFromPayload,
  startGenerationJob, listJobs, getJob,
  nombreArchivoBoletin, listGeneratedForStudent, readGeneratedFile, locateStudentBoletines,
  listSignatures, saveSignature, getAcademicLevel,
  studentsByGradeClassroom, subjectsWithGrades, subjectsForGradeClassroom, averagesOfSalon, lostSubjectsOfSalon,
  saveObjetivos, listObjetivos, getObjetivos,
  scaleLetter, valorLabel, escalaConductualLetra,
};
