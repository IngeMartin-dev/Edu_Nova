'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { calcPerColumnWeighted } = require('../src/services/grades');

const g = (gradeName, gradeValue, isEvaluation = false) => ({ gradeName, gradeValue, isEvaluation, appreciative: null });
const cols = (o) => JSON.stringify(o);

test('Quiz 10% + ACT (implícito) 70% + Eval 20%', () => {
  const columnsJson = cols([
    { id: 'act', kind: 'cat', name: 'ACT', pct: null },
    { id: 'eval', name: 'Eval.Period', pct: 20 },
    { id: 'cat_q', kind: 'cat', name: 'Quiz', pct: 10 },
    { id: 'q1', kind: 'col', name: 'Quiz1', cat: 'cat_q' },
  ]);
  const grades = [g('act1', 4), g('act2', 5), g('Quiz1', 3), g('eval', 4, true)];
  // ACT: 4,5 x 0.70 = 3,15 · Quiz: 3 x 0.10 = 0,30 · Eval: 4 x 0.20 = 0,80  => 4,25
  const r = calcPerColumnWeighted(grades, columnsJson);
  assert.strictEqual(r.finalGrade, 4.25);
});

test('porcentajes explícitos 50/30/20', () => {
  const columnsJson = cols([
    { id: 'act', kind: 'cat', name: 'ACT', pct: 50 },
    { id: 'eval', name: 'Eval.Period', pct: 20 },
    { id: 'cat_q', kind: 'cat', name: 'Quiz', pct: 30 },
    { id: 'q1', kind: 'col', name: 'Quiz1', cat: 'cat_q' },
  ]);
  const grades = [g('act1', 5), g('Quiz1', 2), g('eval', 3, true)];
  // 5x0.5 + 2x0.3 + 3x0.2 = 2,5 + 0,6 + 0,6 = 3,7
  assert.strictEqual(calcPerColumnWeighted(grades, columnsJson).finalGrade, 3.7);
});

test('solo cambia Eval.Period: promedio simple x (100 - eval)', () => {
  const columnsJson = cols([{ id: 'act', kind: 'cat', name: 'ACT', pct: null }, { id: 'eval', name: 'Eval.Period', pct: 30 }]);
  const grades = [g('act1', 4), g('act2', 4), g('eval', 5, true)];
  // 4 x 0.70 + 5 x 0.30 = 4,3
  assert.strictEqual(calcPerColumnWeighted(grades, columnsJson).finalGrade, 4.3);
});
