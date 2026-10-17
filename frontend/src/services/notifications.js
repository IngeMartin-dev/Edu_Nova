import { api } from '../api/client.js';
import { createStore, useStore } from './store.js';

/**
 * Notificaciones y respuestas (NotificationService + MessageService del original).
 * Se sondean cada 3 s / 5 s; el estado "leído" se recuerda también en localStorage
 * y se muestra una notificación nativa del navegador por cada aviso nuevo.
 */
const KEYS = { seen: 'seen_notifications', read: 'read_notifications', pushed: 'pushed_notifications', msgRead: 'read_messages', deleted: 'deleted_notifications_messages' };

const loadSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch { return new Set(); } };
const saveSet = (k, s) => { try { localStorage.setItem(k, JSON.stringify([...s])); } catch { /* sin almacenamiento */ } };

let seen = loadSet(KEYS.seen);
let readIds = loadSet(KEYS.read);
let msgReadIds = loadSet(KEYS.msgRead);
let previous = [];

const notifStore = createStore([]);
const msgStore = createStore([]);
export const useNotifications = () => useStore(notifStore);
export const useMessages = () => useStore(msgStore);
export const unreadOf = (list) => list.filter((x) => !x.isRead).length;

const currentUserId = () => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}').id; } catch { return undefined; } };

/** Notificación nativa con el logo de la app. */
export function showPush(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const icon = '/logo-symbol.svg';
  const n = new Notification(title, { body, icon, badge: icon, tag: 'edunova', requireInteraction: false, silent: false });
  n.onclick = () => { window.focus(); n.close(); };
  setTimeout(() => n.close(), 5000);
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') return (await Notification.requestPermission()) === 'granted';
  return false;
}

function checkForNew(list) {
  const pushed = loadSet(KEYS.pushed);
  list.filter((n) => !previous.some((p) => p.id === n.id) && !pushed.has(n.id)).forEach((n) => {
    showPush(n.title, n.message);
    pushed.add(n.id);
  });
  saveSet(KEYS.pushed, pushed);
  previous = [...list];
}

const keepRead = (list) => list.map((n) => (readIds.has(n.id) ? { ...n, isRead: true } : n));
const keepMsgRead = (list) => list.map((m) => (msgReadIds.has(m.id) ? { ...m, isRead: true } : m));

export async function loadNotifications(userId = currentUserId()) {
  if (!userId) return;
  const list = await api.get(`/notifications/user/${userId}`);
  checkForNew(list);
  seen = loadSet(KEYS.seen);
  notifStore.set(keepRead(list));
}
export async function loadMessages(userId = currentUserId()) {
  if (!userId) return;
  msgStore.set(keepMsgRead(await api.get(`/messages/user/${userId}`)));
}
export const refreshAll = () => Promise.all([loadNotifications().catch(() => {}), loadMessages().catch(() => {})]);

export async function markNotificationRead(id) {
  readIds.add(id); saveSet(KEYS.read, readIds);
  notifStore.set((l) => l.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  await api.post(`/notifications/${id}/read`, {}).catch(() => {});
}
export async function markMessageRead(id) {
  msgReadIds.add(id); saveSet(KEYS.msgRead, msgReadIds);
  msgStore.set((l) => l.map((m) => (m.id === id ? { ...m, isRead: true } : m)));
  await api.post(`/messages/${id}/read`, {}).catch(() => {});
}
export async function deleteAllNotifications() {
  const id = currentUserId();
  await api.del(`/notifications/user/${id}`);
  notifStore.set([]);
  readIds.clear(); seen.clear(); saveSet(KEYS.read, readIds); saveSet(KEYS.seen, seen);
}
export function isNewlyArrived(n) {
  return !n.isRead && !readIds.has(n.id) && !seen.has(n.id);
}
export const loadDeleted = () => loadSet(KEYS.deleted);
export const saveDeleted = (s) => saveSet(KEYS.deleted, s);

export function formatTimeAgo(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const mins = Math.floor((now - created) / 60000);
  if (mins < 1) return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `Hace ${d} d`;
  return created.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: created.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

let timers = [];
export function startNotificationPolling() {
  if (timers.length) return;
  requestNotificationPermission();
  timers = [
    setInterval(() => { if (localStorage.getItem('token')) loadNotifications().catch(() => {}); }, 3000),
    setInterval(() => { if (localStorage.getItem('token')) loadMessages().catch(() => {}); }, 5000),
  ];
}
export function stopNotificationPolling() { timers.forEach(clearInterval); timers = []; }
export function resetNotifications() { notifStore.set([]); msgStore.set([]); previous = []; }
