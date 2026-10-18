'use strict';
/**
 * Inicializa la base de datos de EduNova:
 *   node src/utils/initDb.js            -> crea la BD y las tablas si no existen, siembra datos base
 *   node src/utils/initDb.js --reset    -> BORRA la BD y la crea desde cero
 *   node src/utils/initDb.js --demo     -> además crea estudiantes y padres de ejemplo
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');
const password = require('./password');

const args = new Set(process.argv.slice(2));

async function main() {
  const conn = await mysql.createConnection({
    host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password,
    multipleStatements: true, charset: 'utf8mb4',
    ssl: env.db.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
  });
  const db = env.db.name;
  try {
    if (args.has('--reset')) {
      console.log(`⚠ Borrando la base de datos "${db}"…`);
      await conn.query(`DROP DATABASE IF EXISTS \`${db}\``);
    }
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${db}\``);

    const [tables] = await conn.query("SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = ? AND table_name = 'users'", [db]);
    const already = tables[0].c > 0;

    if (!already) {
      console.log('Creando tablas…');
      await conn.query(fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8'));

      console.log('Sembrando roles y usuarios base…');
      await conn.query("INSERT INTO roles (name) VALUES ('ADMIN'), ('TEACHER'), ('PARENT'), ('DIRECTOR_DE_GRUPO')");
      const adminHash = await password.hash(env.seed.adminPassword);
      const teacherHash = await password.hash(env.seed.teacherPassword);
      await conn.query(
        `INSERT INTO users (name, surname, username, mail, password, role_id, enable, additional_admin)
         VALUES ('Administrador', 'EduNova', 'admin', 'admin@edunova.edu.co', ?, (SELECT id FROM roles WHERE name='ADMIN'), 1, 0),
                ('Profesor', 'Demo', 'profesor', 'profesor@edunova.edu.co', ?, (SELECT id FROM roles WHERE name='TEACHER'), 1, 0)`,
        [adminHash, teacherHash]
      );
      await conn.query("SET @teacher_id = (SELECT id FROM users WHERE username = 'profesor')");
      await conn.query(fs.readFileSync(path.join(__dirname, '../../sql/seed.sql'), 'utf8'));
      console.log('✔ Base de datos lista.');
      console.log('  Admin:    admin     /', env.seed.adminPassword);
      console.log('  Profesor: profesor  /', env.seed.teacherPassword);
    } else {
      console.log('La base de datos ya tiene tablas; no se modificó (usa --reset para recrearla).');
    }

    if (args.has('--demo')) {
      const demo = require('./demoData');
      await demo.run(conn);
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('✖ Error inicializando la base de datos:', e.message);
  process.exit(1);
});
