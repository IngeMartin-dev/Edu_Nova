'use strict';
const { query, one, exec } = require('../config/db');
const { toSqlDateTime } = require('../utils/dates');
const notifications = require('./notifications');
const push = require('./push');

function toPeriodJson(p) {
  return {
    id: p.id,
    periodNumber: p.periodNumber,
    isUnlocked: Boolean(p.isUnlocked),
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    unlockDate: p.unlockDate ?? null,
    lockDate: p.lockDate ?? null,
    description: p.description ?? null,
    isAutomatic: Boolean(p.isAutomatic),
    notifiedOpen7d: Boolean(p.notifiedOpen7d),
    notifiedClose7d: Boolean(p.notifiedClose7d),
  };
}

const parseLocal = (s) => new Date(String(s).replace(' ', 'T'));

/** Hora actual de Colombia como "YYYY-MM-DD HH:mm:ss" (no depende de la zona horaria del servidor, p. ej. Vercel en UTC). */
function nowBogotaSql() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date());
  const g = (t) => parts.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
}
/** Fechas guardadas ("YYYY-MM-DDTHH:mm:ss" o con espacio) a "YYYY-MM-DD HH:mm:ss" para comparar texto con texto. */
const wall = (v) => String(v).replace('T', ' ').slice(0, 19);

/**
 * Abre/cierra el período automáticamente según sus fechas programadas (hora de Colombia):
 *  - antes de la fecha de desbloqueo: cerrado · entre desbloqueo y bloqueo: abierto · después del bloqueo: cerrado.
 *  - solo con fecha de bloqueo: se cierra al llegar; solo con fecha de desbloqueo: se abre al llegar.
 * Solo avisa (notificación push) cuando el estado realmente cambia.
 */
async function checkAndUpdateAutomaticUnlock(period) {
  const now = nowBogotaSql();
  const unlockAt = period.unlockDate ? wall(period.unlockDate) : null;
  const lockAt = period.lockDate ? wall(period.lockDate) : null;
  const current = Boolean(period.isUnlocked);

  let desired = current;
  if (lockAt && now >= lockAt) desired = false;
  else if (unlockAt) desired = now >= unlockAt;

  if (desired !== current) {
    await exec('UPDATE academic_periods SET is_unlocked = ? WHERE id = ?', [desired ? 1 : 0, period.id]);
    period.isUnlocked = desired;
    if (desired) push.sendToAll('📖 Período abierto', `El Período ${period.periodNumber} ya está disponible para calificar.`, 'PERIOD_OPENED').catch(() => {});
    else if (lockAt && now >= lockAt) push.sendToAll('🔒 Período cerrado', `El Período ${period.periodNumber} se cerró. Ya no se pueden editar notas.`, 'PERIOD_CLOSED').catch(() => {});
  }
  return period;
}

/** Avisos a todos cuando faltan 7 días para abrir / cerrar un período. */
async function checkUpcoming7DayWarnings() {
  const periods = await query('SELECT * FROM academic_periods');
  const now = new Date();
  const DAY = 24 * 3600 * 1000;
  for (const p of periods) {
    if (!p.isAutomatic) continue;
    if (p.unlockDate && !p.notifiedOpen7d && !p.isUnlocked) {
      const t = parseLocal(p.unlockDate);
      if (now < t && now >= new Date(t.getTime() - 7 * DAY)) {
        await exec('UPDATE academic_periods SET notified_open_7d = 1 WHERE id = ?', [p.id]);
        await notifications.sendNotificationToAll('📅 Período por abrir',
          `Faltan 7 días para que el Período ${p.periodNumber} se abra (${String(p.unlockDate).slice(0, 10)}).`, 'PERIOD_OPEN_7D');
      }
    }
    if (p.lockDate && !p.notifiedClose7d) {
      const t = parseLocal(p.lockDate);
      if (now < t && now >= new Date(t.getTime() - 7 * DAY)) {
        await exec('UPDATE academic_periods SET notified_close_7d = 1 WHERE id = ?', [p.id]);
        await notifications.sendNotificationToAll('⏳ Período por cerrar',
          `Faltan 7 días para que el Período ${p.periodNumber} se cierre (${String(p.lockDate).slice(0, 10)}).`, 'PERIOD_CLOSE_7D');
      }
    }
  }
}

async function checkAllAutomatic() {
  const periods = await query('SELECT * FROM academic_periods WHERE is_automatic = 1');
  for (const p of periods) await checkAndUpdateAutomaticUnlock(p);
}

/** ¿Está desbloqueado este período para calificar? */
async function isUnlocked(periodNumber) {
  const p = await one('SELECT is_unlocked FROM academic_periods WHERE period_number = ?', [periodNumber]);
  return Boolean(p && p.isUnlocked);
}

module.exports = { nowBogotaSql, toPeriodJson, checkAndUpdateAutomaticUnlock, checkUpcoming7DayWarnings, checkAllAutomatic, isUnlocked, toSqlDateTime };
