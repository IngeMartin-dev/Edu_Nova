'use strict';
/** Datos de ejemplo (npm run db:demo): 44 estudiantes (2 por salón A/B en Grado 1º a 11º), sus acudientes y algunas notas. */
const password = require('./password');

const NOMBRES = ['Sofía', 'Mateo', 'Valentina', 'Santiago', 'Isabella', 'Samuel', 'Mariana', 'Emmanuel', 'Camila', 'Juan', 'Daniela'];
const APELLIDOS = ['Gómez', 'Rodríguez', 'Martínez', 'Hernández', 'López', 'García', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Flórez'];

async function run(conn) {
  const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM students');
  if (c > 0) { console.log('Ya hay estudiantes; no se agregaron datos demo.'); return; }
  const [[role]] = await conn.query("SELECT id FROM roles WHERE name = 'PARENT'");
  const hash = await password.hash('Demo2026*');
  let n = 0;
  for (let g = 1; g <= 11; g++) {
    for (const salon of ['A', 'B']) {
      for (let k = 0; k < 2; k++) {
        n += 1;
        const nombre = NOMBRES[(n + k) % NOMBRES.length];
        const apellido = `${APELLIDOS[n % APELLIDOS.length]} ${APELLIDOS[(n * 3 + 1) % APELLIDOS.length]}`;
        const [p] = await conn.query(
          `INSERT INTO users (name, surname, username, mail, password, role_id, enable) VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [`Acudiente`, apellido, `acudiente${n}`, `acudiente${n}@demo.edunova.co`, hash, role.id]);
        const [s] = await conn.query(
          `INSERT INTO students (name, surname, grade, class_group, document_number, active) VALUES (?, ?, ?, ?, ?, 1)`,
          [nombre, apellido, `Grado ${g}\u00ba`, `Salon ${salon}`, String(1000000000 + n)]);
        await conn.query('INSERT INTO student_parents (student_id, user_id) VALUES (?, ?)', [s.insertId, p.insertId]);
        await conn.query('INSERT IGNORE INTO parent_classes (grade, classroom, user_id) VALUES (?, ?, ?)', [`Grado ${g}\u00ba`, `Salon ${salon}`, p.insertId]);
      }
    }
  }
  // Notas de ejemplo en Grado 5º Salon A, período 1, Matemáticas
  const [[teacher]] = await conn.query("SELECT id FROM users WHERE username = 'profesor'");
  const [alumnos] = await conn.query("SELECT id FROM students WHERE grade = 'Grado 5\u00ba' AND class_group = 'Salon A'");
  const valores = [[4.2, 3.8, 4.5], [3.0, 3.4, 2.8]];
  for (let i = 0; i < alumnos.length; i++) {
    const v = valores[i % valores.length];
    for (let j = 0; j < v.length; j++) {
      await conn.query(
        `INSERT INTO subject_grades (student_id, teacher_id, subject_name, subject_id, period, grade_name, grade_value, is_evaluation, created_at, updated_at)
         VALUES (?, ?, 'Matemáticas', 1, 1, ?, ?, 0, NOW(), NOW())`, [alumnos[i].id, teacher.id, `Tarea ${j + 1}`, v[j]]);
    }
    await conn.query(
      `INSERT INTO subject_grades (student_id, teacher_id, subject_name, subject_id, period, grade_name, grade_value, is_evaluation, created_at, updated_at)
       VALUES (?, ?, 'Matemáticas', 1, 1, 'Evaluación', ?, 1, NOW(), NOW())`, [alumnos[i].id, teacher.id, valores[i % 2][0]]);
  }
  console.log(`✔ Datos demo: ${n} estudiantes y ${n} acudientes (usuario acudiente1…acudiente${n} / Demo2026*).`);
}

module.exports = { run };
