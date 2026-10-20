'use strict';
const env = require('./config/env');
env.validate();
const { pool, one } = require('./config/db');
const { createApp } = require('./app');
const schedulers = require('./jobs/schedulers');

async function main() {
  try {
    await one('SELECT 1 AS ok');
  } catch (e) {
    console.error(`\n✖ No se pudo conectar a MySQL (${env.db.host}:${env.db.port}, base "${env.db.name}"): ${e.message}`);
    console.error('  1) Verifica que MySQL esté encendido  2) Revisa backend/.env  3) Ejecuta:  npm run db:init\n');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`\n✔ ${env.institution.name} API escuchando en http://localhost:${env.port}`);
    console.log(`  Base de datos: ${env.db.name} @ ${env.db.host}:${env.db.port}`);
    console.log(`  Correo: ${env.mail.enabled ? 'SMTP activo' : 'sin SMTP (los códigos 2FA se imprimen en consola)'} · Push: ${env.firebase.enabled ? 'Firebase' : 'desactivado'} · IA: ${env.ai.enabled ? 'activa' : 'desactivada'}\n`);
    schedulers.start();
    // Restaura en segundo plano los archivos (boletines, firmas, chat…) respaldados en la base
    require('./services/fileVault').restoreAll()
      .then((r) => { if (r.total) console.log(`  Archivos respaldados: ${r.total} (restaurados a disco: ${r.restored})`); })
      .catch((e) => console.warn('[fileVault] no se pudo restaurar:', e.message));
    const pdfState = require('./services/pdf').status();
    if (!pdfState.python || !pdfState.dependencias) {
      console.warn('⚠ PDF: falta Python o sus dependencias (boletines/consolidados no se podrán generar).');
      console.warn('  Ejecuta:  pip install -r backend/python/requirements.txt  &&  playwright install chromium\n');
    }
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} recibido, cerrando…`);
    schedulers.stop();
    server.close(async () => { await pool.end().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
main();
