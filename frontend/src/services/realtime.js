import { api } from '../api/client.js';
import { bus } from './events.js';

/**
 * Avisos de períodos (GlobalRealtimeService): cada 10 s consulta los períodos,
 * emite 'periods:changed' si cambiaron y lanza notificaciones nativas
 * (faltan 7 días / 5 minutos / abierto / cerrado).
 */
let timer = null;
let last = '';
const notified = new Set();

function push(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const icon = '/logo-symbol.svg';
  const n = new Notification(title, { body, icon, badge: icon, tag: 'period-notification', requireInteraction: false, silent: false });
  n.onclick = () => { window.focus(); n.close(); };
  setTimeout(() => n.close(), 10000);
}

function checkPeriodDates(periods) {
  const now = new Date();
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  for (const p of periods) {
    if (p.isAutomatic && p.unlockDate) {
      const diffMs = new Date(p.unlockDate) - now;
      const diffMins = diffMs / 60000;
      const diffDays = diffMs / 86400000;
      const key = `unlock-${p.periodNumber}`;
      const k7 = `unlock-${p.periodNumber}-${p.unlockDate}-7d`;
      if (diffDays > 0 && diffDays <= 7 && !notified.has(k7)) {
        notified.add(k7);
        push('📅 Período por abrir', `Faltan ${plural(Math.ceil(diffDays), 'día')} para que el Período ${p.periodNumber} se abra`);
      }
      if (diffMins > 0 && diffMins <= 5 && !notified.has(`${key}-warning`)) {
        notified.add(`${key}-warning`);
        push('🔔 Período por comenzar', `El Período ${p.periodNumber} se desbloqueará en ${plural(Math.ceil(diffMins), 'minuto')}`);
      }
      if (p.isUnlocked && !notified.has(`${key}-started`)) {
        notified.add(`${key}-started`);
        push('✅ Período iniciado', `El Período ${p.periodNumber} ha sido desbloqueado`);
      }
    }
    if (p.isAutomatic && p.lockDate && p.unlockDate) {
      const lockMs = new Date(p.lockDate).getTime();
      const diffToLock = lockMs - now.getTime();
      const diffMins = diffToLock / 60000;
      const diffDays = diffToLock / 86400000;
      const key = `lock-${p.periodNumber}`;
      const k7 = `lock-${p.periodNumber}-${p.lockDate}-7d`;
      if (diffDays > 0 && diffDays <= 7 && !notified.has(k7)) {
        notified.add(k7);
        push('⏳ Período por cerrar', `Faltan ${plural(Math.ceil(diffDays), 'día')} para que el Período ${p.periodNumber} se cierre`);
      }
      if (diffMins > 0 && diffMins <= 5 && !notified.has(`${key}-warning`)) {
        notified.add(`${key}-warning`);
        push('⚠️ Período por finalizar', `El Período ${p.periodNumber} se bloqueará en ${plural(Math.ceil(diffMins), 'minuto')}`);
      }
      if ((now.getTime() >= lockMs || (diffMins <= 0 && !p.isUnlocked)) && !notified.has(`${key}-ended`)) {
        notified.add(`${key}-ended`);
        push('🔒 Período finalizado', `El Período ${p.periodNumber} ha sido bloqueado`);
      }
    }
  }
}

export function startRealtime() {
  if (timer) return;
  timer = setInterval(async () => {
    if (!localStorage.getItem('token')) return; // antes del login no se consulta
    try {
      const periods = await api.get('/periods');
      const cur = JSON.stringify(periods.map((p) => ({ n: p.periodNumber, u: p.isUnlocked })));
      if (cur !== last) { last = cur; bus.emit('periods:changed', periods); }
      checkPeriodDates(periods);
    } catch { /* se reintenta */ }
  }, 10000);
}
export function stopRealtime() { clearInterval(timer); timer = null; }
export async function notifyPeriodsChanged() {
  last = '';
  try { bus.emit('periods:changed', await api.get('/periods')); } catch { /* sin datos */ }
}
export function showTestNotification() {
  if ('Notification' in window && Notification.permission === 'granted') new Notification('🔔 Notificaciones activas', { body: 'Las notificaciones push funcionan correctamente', icon: '/logo-symbol.svg' });
}
