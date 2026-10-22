'use strict';
/**
 * Tareas periódicas SIN node-cron, para poder correr en serverless (Vercel):
 *  - runDaily(): lo llama el Cron de Vercel una vez al día (/api/cron/daily).
 *  - tick(): se invoca de forma oportunista en cada petición (limitado en el tiempo) para abrir/cerrar
 *    períodos automáticos y revisar avisos, porque Vercel Hobby solo permite cron diario.
 */
const periods = require('../services/periods');
const promotions = require('../services/promotions');
const yearJobs = require('./yearJobs');

const safe = async (name, fn) => { try { await fn(); return { name, ok: true }; } catch (e) { console.error(`[Tarea:${name}]`, e.message); return { name, ok: false, error: e.message }; } };

async function runDaily() {
  return [
    await safe('periodos', periods.checkAllAutomatic),
    await safe('avisos-7d', periods.checkUpcoming7DayWarnings),
    await safe('fin-de-año', yearJobs.reviewYearEnd),
    await safe('purga-promociones', promotions.purgeExpired),
  ];
}

const last = { periods: 0, hourly: 0 };
let busy = false;
/** Ejecuta a lo sumo cada 30 s la revisión de períodos y cada hora los avisos; nunca bloquea la petición. */
function tick() {
  const now = Date.now();
  if (busy) return Promise.resolve();
  const jobs = [];
  if (now - last.periods > 30 * 1000) { last.periods = now; jobs.push(safe('periodos', periods.checkAllAutomatic)); }
  if (now - last.hourly > 60 * 60 * 1000) {
    last.hourly = now;
    jobs.push(safe('avisos-7d', periods.checkUpcoming7DayWarnings), safe('fin-de-año', yearJobs.reviewYearEnd));
  }
  if (!jobs.length) return Promise.resolve();
  busy = true;
  return Promise.all(jobs).finally(() => { busy = false; });
}

module.exports = { runDaily, tick };
