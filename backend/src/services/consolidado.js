'use strict';
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { dirs, ensure, safeJoin } = require('../config/storage');
const { query, one } = require('../config/db');
const { escapeHtml, fileSafe, salonFolder } = require('../utils/format');
const grades = require('./grades');
const pdf = require('./pdf');

const ESTUDIANTES_POR_PAGINA = 32;
const MAX_MATERIAS_FIJAS = 22;
const TEMPLATE = path.resolve(__dirname, '../../templates/ConsolidadoBase.html');
const LOGO = path.resolve(__dirname, '../../assets/img/logo-192.png');

const nvl = (s) => (s === null || s === undefined ? '' : s);

/** 4.5 -> "4,5"; 4 -> "4"; 3.80 -> "3,8" (igual que el consolidado original). */
function formatoNota(n) {
  let s = (Math.round(Number((n * 100).toPrecision(15))) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  if (!s) s = '0';
  return s.replace('.', ',');
}

function abreviarMateria(nombre) {
  if (!nombre || !nombre.trim()) return '';
  const palabras = nombre.trim().split(/\s+/);
  if (palabras.length === 1) return palabras[0].slice(0, 5).toUpperCase();
  const partes = palabras.filter((p) => p.length > 2).map((p) => p.slice(0, 3).toUpperCase());
  return partes.length ? partes.join('.') : nombre.slice(0, 5).toUpperCase();
}

function leyendaMaterias(materias) {
  return materias.filter((n) => n && n.trim())
    .map((n) => `<b>${escapeHtml(abreviarMateria(n))}</b> = ${escapeHtml(n)}`).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
}

/** Puesto con empates: mismo promedio = mismo puesto. */
function calcularPuestos(promedios) {
  const puestos = new Array(promedios.length).fill(null);
  const idx = promedios.map((p, i) => [p, i]).filter(([p]) => p !== null).sort((a, b) => b[0] - a[0]);
  let actual = 0; let anterior = NaN;
  idx.forEach(([prom, i], rank) => {
    if (rank === 0 || prom !== anterior) actual = rank + 1;
    puestos[i] = actual;
    anterior = prom;
  });
  return puestos;
}

async function directorDeGrupo(grade, classroom) {
  const r = await one(
    `SELECT u.name, u.surname FROM homeroom_assignments h JOIN users u ON u.id = h.user_id WHERE h.grade = ? AND h.classroom = ?`, [grade, classroom]);
  const nombre = r ? `${nvl(r.name)} ${nvl(r.surname)}`.trim() : '';
  return nombre || 'Por asignar';
}

function logoDataUri() {
  try { return `data:image/png;base64,${fs.readFileSync(LOGO).toString('base64')}`; } catch (_) { return ''; }
}

async function construirHtml(grade, classroom, period, estudiantes, materias) {
  if (materias.length > MAX_MATERIAS_FIJAS) {
    throw new Error(`El salón ${grade} ${classroom} tiene ${materias.length} materias, más de los ${MAX_MATERIAS_FIJAS} cupos de columna de la plantilla.`);
  }
  const plantilla = fs.readFileSync(TEMPLATE, 'utf8');

  const notasPorEstudiante = [];
  const promedios = [];
  for (const est of estudiantes) {
    const notas = new Map();
    let suma = 0; let conNota = 0;
    for (const materia of materias) {
      const calc = await grades.calculateFinalGrade(est.id, period, materia, null);
      const nFinal = calc.hasGrades && typeof calc.finalGrade === 'number' ? calc.finalGrade : null;
      notas.set(materia, nFinal);
      if (nFinal !== null) { suma += nFinal; conNota += 1; }
    }
    notasPorEstudiante.push(notas);
    promedios.push(conNota > 0 ? suma / conNota : null);
  }
  const puestos = calcularPuestos(promedios);
  const logo = logoDataUri();
  const fecha = new Date().toISOString().slice(0, 10);
  const director = await directorDeGrupo(grade, classroom);
  const anio = String(new Date().getFullYear());
  const leyenda = leyendaMaterias(materias);
  const total = estudiantes.length;
  const totalPaginas = Math.max(1, Math.ceil(total / ESTUDIANTES_POR_PAGINA));

  let cabeza = null; let cola = null;
  const cuerpoTotal = [];
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    const desde = (pagina - 1) * ESTUDIANTES_POR_PAGINA;
    const hasta = Math.min(desde + ESTUDIANTES_POR_PAGINA, total);
    const reemplazos = {
      '{{PAGINA_ACTUAL}}': String(pagina), '{{PAGINA_TOTAL}}': String(totalPaginas), '{{LOGO_PATH}}': logo,
      '{{NOMBRE_INSTITUCION}}': escapeHtml(env.institution.name.toUpperCase()), '{{AÑO}}': anio,
      '{{GRADO}}': escapeHtml(grade), '{{SALON}}': escapeHtml(classroom), '{{PERIODO}}': String(period),
      '{{DIRECTOR_GRUPO}}': escapeHtml(director), '{{CIUDAD}}': 'CARTAGENA', '{{FECHA_GENERACION}}': fecha,
      '{{LEYENDA_MATERIAS}}': leyenda,
      '{{CLASE_ENCABEZADO_OCULTO}}': pagina === 1 ? '' : ' encabezado--oculto',
      '{{CLASE_CONTINUACION_OCULTO}}': pagina === 1 ? ' continuacion--oculto' : '',
    };
    for (let c = 1; c <= MAX_MATERIAS_FIJAS; c++) {
      const usa = c <= materias.length;
      reemplazos[`{{COL_${c}_LABEL}}`] = escapeHtml(usa ? abreviarMateria(materias[c - 1]) : '');
      reemplazos[`{{COL_${c}_CLASE_VACIA}}`] = usa ? '' : ' col--vacia';
    }
    for (let slot = 1; slot <= ESTUDIANTES_POR_PAGINA; slot++) {
      const i = desde + slot - 1;
      const usado = i < hasta;
      reemplazos[`{{FILA_${slot}_NUM}}`] = String(i + 1);
      reemplazos[`{{FILA_${slot}_CLASE_VACIA}}`] = usado ? '' : ' fila--vacia';
      if (usado) {
        const est = estudiantes[i];
        reemplazos[`{{FILA_${slot}_NOMBRE}}`] = escapeHtml(`${nvl(est.surname)} ${nvl(est.name)}`);
        reemplazos[`{{FILA_${slot}_PROM}}`] = promedios[i] !== null ? formatoNota(promedios[i]) : '-';
        reemplazos[`{{FILA_${slot}_PUESTO}}`] = puestos[i] !== null ? String(puestos[i]) : '-';
        for (let c = 1; c <= MAX_MATERIAS_FIJAS; c++) {
          let valor = '';
          if (c <= materias.length) {
            const n = notasPorEstudiante[i].get(materias[c - 1]);
            valor = n !== null && n !== undefined ? formatoNota(n) : '-';
          }
          reemplazos[`{{FILA_${slot}_COL_${c}}}`] = valor;
        }
      } else {
        reemplazos[`{{FILA_${slot}_NOMBRE}}`] = ''; reemplazos[`{{FILA_${slot}_PROM}}`] = ''; reemplazos[`{{FILA_${slot}_PUESTO}}`] = '';
        for (let c = 1; c <= MAX_MATERIAS_FIJAS; c++) reemplazos[`{{FILA_${slot}_COL_${c}}}`] = '';
      }
    }
    let html = plantilla;
    for (const [k, v] of Object.entries(reemplazos)) html = html.split(k).join(v);

    const aperturaBody = html.indexOf('<body');
    const inicioBody = html.indexOf('>', aperturaBody) + 1;
    const finBody = html.lastIndexOf('</body>');
    cuerpoTotal.push(html.slice(inicioBody, finBody).trim());
    if (pagina === 1) { cabeza = html.slice(0, inicioBody); cola = html.slice(finBody); }
  }
  return `${cabeza}${cuerpoTotal.join('\n')}\n${cola}`;
}

async function generarConsolidadoPdf(grade, classroom, period, estudiantes, materias) {
  return pdf.htmlToPdf(await construirHtml(grade, classroom, period, estudiantes, materias));
}

function guardarConsolidado(grade, classroom, period, bytes, fileName) {
  const dir = ensure(safeJoin(dirs.consolidados, `Periodo ${period || 1}`, salonFolder(grade, classroom)));
  const destino = path.join(dir, fileName);
  fs.writeFileSync(destino, bytes);
  require('./fileVault').persist(destino, bytes);
  return destino;
}

const nombreArchivo = (grade, classroom, period) => `Consolidado_${fileSafe(`${grade}_${classroom}`) || 'consolidado'}_Periodo${period}.pdf`;

module.exports = { construirHtml, generarConsolidadoPdf, guardarConsolidado, nombreArchivo, formatoNota, abreviarMateria, calcularPuestos };
