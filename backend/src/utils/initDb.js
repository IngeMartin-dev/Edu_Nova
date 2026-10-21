'use strict';
/**
 * Inicializa la base de datos de EduNova (PostgreSQL / Supabase):
 *   node src/utils/initDb.js            -> crea las tablas si no existen y siembra datos base
 *   node src/utils/initDb.js --reset    -> BORRA todas las tablas y las crea desde cero
 *   node src/utils/initDb.js --demo     -> además crea estudiantes y padres de ejemplo
 *
 * Conexión: DATABASE_URL (en Supabase usa el "Session pooler", puerto 5432, que funciona por IPv4)
 * o DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const env = require('../config/env');
const password = require('./password');

const args = new Set(process.argv.slice(2));

async function main() {
  const cfg = env.db.url
    ? { connectionString: env.db.url }
    : { host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, database: env.db.name };
  if (env.db.ssl) cfg.ssl = { rejectUnauthorized: false };
  const conn = new Client(cfg);
  await conn.connect();
  // El cliente de initDb no pasa por db.js: usamos el mismo formato de respuesta de pg directamente.
  const q = (sql, params) => conn.query(sql, params);
  try {
    if (args.has('--reset')) {
      console.log('⚠ Borrando todas las tablas de EduNova…');
      const { rows } = await q("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      for (const r of rows) await q(`DROP TABLE IF EXISTS public."${r.tablename}" CASCADE`);
    }

    const { rows: [{ reg }] } = await q("SELECT to_regclass('public.users') AS reg");
    const already = reg !== null;

    if (!already) {
      console.log('Creando tablas…');
      await q(fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8'));

      console.log('Sembrando roles y usuarios base…');
      await q("INSERT INTO roles (name) VALUES ('ADMIN'), ('TEACHER'), ('PARENT'), ('DIRECTOR_DE_GRUPO')");
      const adminHash = await password.hash(env.seed.adminPassword);
      const teacherHash = await password.hash(env.seed.teacherPassword);
      await q(
        `INSERT INTO users (name, surname, username, mail, password, role_id, enable, additional_admin)
         VALUES ('Administrador', 'EduNova', 'admin', 'admin@edunova.edu.co', $1, (SELECT id FROM roles WHERE name='ADMIN'), 1, 0),
                ('Profesor', 'Demo', 'profesor', 'profesor@edunova.edu.co', $2, (SELECT id FROM roles WHERE name='TEACHER'), 1, 0)`,
        [adminHash, teacherHash]
      );
      const { rows: [teacher] } = await q("SELECT id FROM users WHERE username = 'profesor'");
      const seed = fs.readFileSync(path.join(__dirname, '../../sql/seed.sql'), 'utf8').replace(/@teacher_id/g, String(teacher.id));
      await q(seed);
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
