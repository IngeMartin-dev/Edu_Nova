import { createStore, useStore } from './store.js';
import { API_ORIGIN } from '../api/client.js';

/**
 * Estado de la conexión con el servidor (ConnectionService del original).
 * Cuando una petición no llega al servidor o el navegador pierde la red,
 * `offline` pasa a true y se cubre TODA la pantalla con "Sin conexión".
 * La ruta no cambia: se sondea /api/health y al responder se quita la pantalla.
 */
const state = createStore({ offline: false, checking: false });
export const useConnection = () => useStore(state);
let timer = null;
let onRestore = () => {};
export const setRestoreHandler = (fn) => { onRestore = fn; };

const set = (p) => state.set((s) => ({ ...s, ...p }));

async function serverReachable() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${API_ORIGIN}/api/health`, { signal: ctrl.signal, cache: 'no-store' });
    return res.status < 500;
  } catch { return false; } finally { clearTimeout(to); }
}

function schedule(ms) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(check, ms);
}

async function check() {
  if (!state.get().offline) return;
  set({ checking: true });
  const up = await serverReachable();
  set({ checking: false });
  if (up) { try { onRestore(); } catch { /* sin recarga suave */ } set({ offline: false }); }
  else schedule(3000);
}

export const connection = {
  markOffline() {
    if (state.get().offline) return;
    set({ offline: true });
    schedule(1500);
  },
  checkNow() {
    const s = state.get();
    if (!s.offline || s.checking) return;
    if (timer) clearTimeout(timer);
    check();
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => connection.markOffline());
  window.addEventListener('online', () => connection.checkNow());
}
