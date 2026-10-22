'use strict';
const schoolYear = require('../services/schoolYear');
const promotions = require('../services/promotions');
const notifications = require('../services/notifications');
const push = require('../services/push');
const { exec } = require('../config/db');

async function reviewYearEnd() {
  const c = await schoolYear.getConfig();
  if (!c.yearEndDate) return;
  if (!c.yearEnd7dNotified && (await schoolYear.sevenDaysToYearEnd())) {
    const msg = `Faltan 7 días para la fecha configurada de fin de año escolar (${c.yearEndDate}).`;
    await notifications.notifyAdmins('📅 Fin de año escolar próximo', msg, 'SCHOOL_YEAR_END_7D');
    await exec('UPDATE school_year_config SET year_end_7d_notified = 1 WHERE id = 1');
  }
  if (!c.yearEndNotified && (await schoolYear.reachedYearEnd())) {
    const msg = 'Se alcanzó la fecha configurada para cerrar el año. Entra a Configuración de Año para revisarlo.';
    await notifications.notifyAdmins('Fin del año escolar', msg, 'SCHOOL_YEAR_END');
    await exec('UPDATE school_year_config SET year_end_notified = 1 WHERE id = 1');
  }
}

/** Servidor normal (no serverless): revisión de fin de año cada 6 h y purga diaria de promociones (3:00 a. m.). */
function register({ safe, timers, cron }) {
  timers.push(setInterval(safe('fin-de-año', reviewYearEnd), 6 * 60 * 60 * 1000));
  timers.push(setTimeout(safe('fin-de-año', reviewYearEnd), 20 * 1000));
  timers.push(setTimeout(safe('purga-promociones', promotions.purgeExpired), 60 * 1000));
  cron.schedule('0 3 * * *', safe('purga-promociones', promotions.purgeExpired));
}

module.exports = { register, reviewYearEnd };
