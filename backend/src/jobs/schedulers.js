'use strict';
const periods = require('../services/periods');
const yearJobs = require('./yearJobs');

/** Ejecuta fn sin dejar que un error tumbe el proceso. */
const safe = (name, fn) => async () => {
  try { await fn(); } catch (e) { console.error(`[Scheduler:${name}]`, e.message); }
};

const registerExtra = [yearJobs.register];
const timers = [];

function start() {
  // Abre/cierra períodos automáticos cada 30 s
  timers.push(setInterval(safe('periodos', periods.checkAllAutomatic), 30 * 1000));
  // Avisos "faltan 7 días" cada hora
  timers.push(setInterval(safe('avisos-7d', periods.checkUpcoming7DayWarnings), 60 * 60 * 1000));
  timers.push(setTimeout(safe('avisos-7d', periods.checkUpcoming7DayWarnings), 10 * 1000));

  // Los demás programadores (fin de año, purga de promociones) se registran en
  // sus propios módulos cuando existen (ver registerExtra).
  const cron = require('node-cron'); // solo en servidor normal; en Vercel se usa /api/cron/daily
  for (const extra of registerExtra) extra({ safe, timers, cron });
  console.log('[Scheduler] Tareas programadas activas.');
}

const stop = () => timers.forEach((t) => { clearInterval(t); clearTimeout(t); });

module.exports = { start, stop, registerExtra };
