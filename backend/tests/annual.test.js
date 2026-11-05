'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const { annualGradesBySubject, annualSummary, MAX_AREAS_PERDIDAS_PROMOVIDO } = require('../src/services/boletin');
const { norm } = require('../src/utils/http');

/** Salón sintético: notas[estudiante][materia] = [N.FINAL P1..P4] (null = sin nota). */
function makeCtx(notas, minPassing = 3.5) {
  const ctx = { students: [], grades: new Map(), minPassing };
  for (const [id, mats] of Object.entries(notas)) {
    ctx.students.push({ id: Number(id) });
    for (const [materia, periodos] of Object.entries(mats)) {
      periodos.forEach((v, i) => {
        if (v === null) return;
        ctx.grades.set(`${id}|${i + 1}|${norm(materia)}`, [{ gradeName: 'nFinal', gradeValue: v, isEvaluation: false }]);
      });
    }
  }
  return ctx;
}
const MATERIAS = ['Matematicas', 'Ingles'];

test('nota anual = promedio de las N.FINAL de los períodos con nota', () => {
  const ctx = makeCtx({ 1: { Matematicas: [4, 5, 3, 4], Ingles: [3, 3, null, 3] } });
  const m = annualGradesBySubject(ctx, 1, MATERIAS, 4);
  assert.strictEqual(m.get('Matematicas'), 4);          // (4+5+3+4)/4
  assert.strictEqual(m.get('Ingles'), 3);               // (3+3+3)/3: el período sin nota no cuenta
});

test('promedio anual, áreas perdidas del año y puesto', () => {
  const ctx = makeCtx({
    1: { Matematicas: [5, 5, 5, 5], Ingles: [4, 4, 4, 4] },   // anual 5.0 y 4.0 -> 4.5
    2: { Matematicas: [3, 3, 3, 3], Ingles: [4, 4, 4, 4] },   // 3.0 y 4.0 -> 3.5, pierde Matematicas (3.0 < 3.5)
    3: { Matematicas: [3, 4, 3, 4], Ingles: [4, 3, 4, 3] },   // 3.5 y 3.5 -> 3.5 (empata con el 2)
  });
  const a1 = annualSummary(ctx, 1, MATERIAS, 4);
  const a2 = annualSummary(ctx, 2, MATERIAS, 4);
  const a3 = annualSummary(ctx, 3, MATERIAS, 4);
  assert.strictEqual(a1.annualAverage, 4.5);
  assert.deepStrictEqual(a1.annualLostAreas, []);
  assert.strictEqual(a1.annualRank, 1);
  assert.strictEqual(a2.annualAverage, 3.5);
  assert.deepStrictEqual(a2.annualLostAreas, ['Matematicas']);
  assert.strictEqual(a2.annualRank, 2);
  assert.strictEqual(a3.annualRank, 2);                  // empate a 2 decimales: comparten puesto
});

test('estudiante sin ninguna nota: sin promedio ni puesto', () => {
  const ctx = makeCtx({ 1: { Matematicas: [4, 4, 4, 4], Ingles: [4, 4, 4, 4] }, 2: { Matematicas: [null, null, null, null], Ingles: [null, null, null, null] } });
  const a = annualSummary(ctx, 2, MATERIAS, 4);
  assert.strictEqual(a.annualAverage, null);
  assert.strictEqual(a.annualRank, null);
  assert.strictEqual(annualSummary(ctx, 1, MATERIAS, 4).annualRank, 1);
});

test('el umbral de áreas perdidas para no promover es 3', () => {
  assert.strictEqual(MAX_AREAS_PERDIDAS_PROMOVIDO, 3);
});
