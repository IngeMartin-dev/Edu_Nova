'use strict';
/**
 * Migraciones ligeras e idempotentes que se aplican solas la primera vez que arranca el servidor
 * (en Vercel, en la primera petición de cada instancia). Seguras de repetir.
 *
 *  1) users.mail ya no es UNIQUE: varias cuentas pueden compartir un mismo correo.
 */
const { pool } = require('../config/db');

const DROP_MAIL_UNIQUE = `
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = current_schema() AND t.relname = 'users' AND c.contype = 'u'
       AND array_length(c.conkey, 1) = 1
       AND (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum = c.conkey[1]) = 'mail'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', r.conname);
  END LOOP;
  -- Índices únicos sueltos (no ligados a una restricción) sobre la columna mail
  FOR r IN
    SELECT i.relname AS idx
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = current_schema() AND t.relname = 'users' AND x.indisunique AND NOT x.indisprimary
       AND x.indnatts = 1 AND x.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'mail')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
  LOOP
    EXECUTE format('DROP INDEX %I', r.idx);
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS idx_users_mail ON users (mail);
`;

let running = null;
/** Ejecuta las migraciones una sola vez por proceso. Un fallo se registra y no tumba la API. */
function ensureMigrations() {
  if (!running) {
    running = pool.query(DROP_MAIL_UNIQUE)
      .catch((e) => console.error('[migraciones] no se pudo quitar el UNIQUE de users.mail:', e.message));
  }
  return running;
}

module.exports = { ensureMigrations };
