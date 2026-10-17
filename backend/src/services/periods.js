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

/** Abre/cierra el período automáticamente según sus fechas programadas. */
async function checkAndUpdateAutomaticUnlock(period) {
  const now = new Date();
  let changed = false;
  let unlocked = Boolean(period.isUnlocked);

  if (period.unlockDate && now > parseLocal(period.unlockDate) && !unlocked) {
    unlocked = true;
    changed = true;
    push.sendToAll('📖 Período abierto', `El Período ${period.periodNumber} ya está disponible para calificar.`, 'PERIOD_OPENED').catch(() => {});
  }
  if (period.lockDate && now > parseLocal(period.lockDate) && unlocked) {
    unlocked = false;
    changed = true;
    push.sendToAll('🔒 Período cerrado', `El Período ${period.periodNumber} se cerró. Ya no se pueden editar notas.`, 'PERIOD_CLOSED').catch(() => {});
  }
  if (changed) {
    await exec('UPDATE academic_periods SET is_unlocked = ? WHERE id = ?', [unlocked ? 1 : 0, period.id]);
    period.isUnlocked = unlocked;
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

module.exports = { toPeriodJson, checkAndUpdateAutomaticUnlock, checkUpcoming7DayWarnings, checkAllAutomatic, isUnlocked, toSqlDateTime };
