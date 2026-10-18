import { api } from '../api/client.js';
import { showPush } from './notifications.js';

/**
 * Notificaciones push reales con Firebase Cloud Messaging (opcional).
 * La configuración pública de Firebase la entrega el backend (GET /notifications/push-config)
 * desde backend/.env; si no está activada, la plataforma sigue con sus notificaciones internas.
 */
let configPromise = null;
let listening = false;
const loadConfig = () => (configPromise ||= api.get('/notifications/push-config').catch(() => ({ enabled: false })));

export const isFirebaseConfigured = async () => !!(await loadConfig()).enabled;

function deviceInfo() {
  const ua = navigator.userAgent || '';
  let deviceType = /mobile/i.test(ua) ? 'mobile' : 'web';
  let deviceName = 'Navegador web';
  if (/iPad|iPhone|iPod/.test(ua)) { deviceType = 'ios'; deviceName = 'iPhone / iPad'; }
  else if (/Android/.test(ua)) { deviceType = 'android'; deviceName = 'Android'; }
  else if (/Windows/.test(ua)) deviceName = 'PC con Windows';
  else if (/Mac/.test(ua)) deviceName = 'Mac';
  else if (/Linux/.test(ua)) deviceName = 'PC con Linux';
  return { deviceType, deviceName };
}

/** Pide permiso, obtiene el token FCM del navegador y lo registra en el backend. */
export async function registerPushToken() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return null;
    const cfg = await loadConfig();
    if (!cfg.enabled) return null;
    if ((await Notification.requestPermission()) !== 'granted') return null;

    const { initializeApp, getApps } = await import('firebase/app');
    const { getMessaging, getToken, onMessage } = await import('firebase/messaging');
    const app = getApps()[0] || initializeApp(cfg.config);
    const messaging = getMessaging(app);

    const params = new URLSearchParams(cfg.config);
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}firebase-messaging-sw.js?${params.toString()}`);
    const token = await getToken(messaging, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: registration });
    if (!token) return null;

    await api.post('/notifications/fcm-token', { token, ...deviceInfo() });
    if (!listening) {
      listening = true;
      // Mensajes con la pestaña abierta: se muestran como aviso del navegador.
      onMessage(messaging, (p) => showPush(p.notification?.title || 'EduNova', p.notification?.body || ''));
    }
    return token;
  } catch (e) {
    console.warn('[Push] No se pudo registrar el push:', e?.message || e);
    return null;
  }
}

/** Envía una notificación de prueba a los dispositivos del usuario actual (Ajustes). */
export const sendTestPush = () => api.post('/notifications/push-test', {});