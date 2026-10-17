'use strict';
process.env.JWT_SECRET = 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const { formatoNota, abreviarMateria, calcularPuestos } = require('../src/services/consolidado');
const { fmt, roundHalfUp, escapeHtml, fileSafe, gradeNumberText, classroomLetter, salonFolder } = require('../src/utils/format');
const boletin = require('../src/services/boletin');

test('formato de notas del consolidado', () => {
  assert.strictEqual(formatoNota(4.5), '4,5');
  assert.strictEqual(formatoNota(4), '4');
  assert.strictEqual(formatoNota(3.8), '3,8');
  assert.strictEqual(formatoNota(3.456), '3,46');
});

test('abreviaturas de materias', () => {
  assert.strictEqual(abreviarMateria('Matemáticas'), 'MATEM');
  assert.strictEqual(abreviarMateria('Lengua Castellana'), 'LEN.CAS');
  assert.strictEqual(abreviarMateria(''), '');
});

test('puestos con empates', () => {
  assert.deepStrictEqual(calcularPuestos([4.5, 4.5, 3.0, null, 4.8]), [2, 2, 4, null, 1]);
});

test('redondeo mitad hacia arriba y coma decimal', () => {
  assert.strictEqual(roundHalfUp(1.005, 2), 1.01);
  assert.strictEqual(fmt(4.125), '4,13');
  assert.strictEqual(fmt(4, 0), '4');
  assert.strictEqual(fmt(3.8, 2, '.'), '3.80');
});

test('helpers de archivos y salones', () => {
  assert.strictEqual(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.strictEqual(fileSafe('Gómez Pérez'), 'Gomez_Perez');
  assert.strictEqual(gradeNumberText('Grado 11º'), '11');
  assert.strictEqual(classroomLetter('Salon b'), 'B');
  assert.strictEqual(salonFolder('Grado 5º', 'Salon A'), '5A');
});

test('escalas del boletín', () => {
  assert.strictEqual(boletin.scaleLetter(4.6), 'S');
  assert.strictEqual(boletin.scaleLetter(3.4), 'I');
  assert.strictEqual(boletin.valorLabel(3.5), 'BÁSICO');
  assert.strictEqual(boletin.escalaConductualLetra(3.2), 'A');
  assert.strictEqual(boletin.nombreArchivoBoletin({ name: 'Ana María', surname: 'Pérez' }), 'BOLETIN_Perez_AnaMara.pdf'.replace('AnaMara', 'Ana_Maria'));
});
