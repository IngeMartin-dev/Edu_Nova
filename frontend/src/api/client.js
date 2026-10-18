import { connection } from '../services/connection.js';

// Cliente HTTP mínimo: añade el token, renueva la sesión si expira (401)
// y entrega JSON, texto o archivos (blob) según se pida.
// En GitHub Pages el frontend y la API viven en dominios distintos: VITE_API_URL
// (p. ej. https://edunova-api.koyeb.app, sin "/" final) apunta al backend.
// Vacío = mismo dominio (desarrollo con proxy de Vite o Express sirviendo el build).
export const API_ORIGIN = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const BASE = `${API_ORIGIN}/api`;

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const store = {
  get token() { return localStorage.getItem('token'); },
  get refresh() { return localStorage.getItem('refreshToken'); },
  set(t, r) {
    if (t) localStorage.setItem('token', t);
    if (r) localStorage.setItem('refreshToken', r);
  },
  clear() {
    ['token', 'refreshToken', 'role', 'currentUser'].forEach((k) => localStorage.removeItem(k));
  },
};

let onLogout = () => {};
export const setLogoutHandler = (fn) => { onLogout = fn; };
export const session = store;

let refreshing = null;
async function tryRefresh() {
  if (!store.refresh) return false;
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: store.refresh }),
    })
      .then(async (r) => {
        if (!r.ok) return false;
        const d = await r.json();
        store.set(d.token, d.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function request(method, path, { body, query, raw, auth = true } = {}, retried = false) {
  let url = BASE + path;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.append(k, v); });
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }
  const headers = {};
  if (auth && store.token) headers.Authorization = `Bearer ${store.token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(url, { method, headers, body: payload });
  } catch {
    connection.markOffline();
    throw new ApiError('No hay conexión con el servidor', 0);
  }
  if (res.status === 401 && auth && !retried && path !== '/auth/login' && path !== '/auth/refresh') {
    if (await tryRefresh()) return request(method, path, { body, query, raw, auth }, true);
    store.clear();
    onLogout();
    throw new ApiError('Tu sesión expiró. Inicia sesión de nuevo.', 401);
  }
  if (raw) {
    if (!res.ok) throw new ApiError(await errMsg(res), res.status);
    return res;
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) throw new ApiError((data && data.error) || res.statusText || 'Error', res.status, data);
  return data;
}

async function errMsg(res) {
  try { const d = await res.json(); return d.error || res.statusText; } catch { return res.statusText; }
}

export const api = {
  get: (p, query) => request('GET', p, { query }),
  post: (p, body, query) => request('POST', p, { body, query }),
  put: (p, body, query) => request('PUT', p, { body, query }),
  patch: (p, body, query) => request('PATCH', p, { body, query }),
  del: (p, body) => request('DELETE', p, { body }),
  login: (p, body) => request('POST', p, { body, auth: false }),
  /** Descarga un archivo (PDF, Excel…) y lo guarda con el nombre indicado. */
  async download(method, p, { body, query, filename } = {}) {
    const res = await request(method, p, { body, query, raw: true });
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    const name = filename || (m && decodeURIComponent(m[1])) || 'archivo';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return name;
  },
  /** Devuelve el archivo como Blob (para vistas previas incrustadas). */
  async blob(method, p, { body, query } = {}) {
    const res = await request(method, p, { body, query, raw: true });
    return res.blob();
  },
  /** Abre un archivo en una pestaña nueva (vista previa de PDF). */
  async open(method, p, { body, query } = {}) {
    const res = await request(method, p, { body, query, raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
};

/** URL de un archivo del backend (fotos, adjuntos del chat…): siempre sobre el dominio de la API. */
export function imageUrl(p) {
  if (!p) return '';
  const path = /^https?:/i.test(p) ? p.replace(/^https?:\/\/[^/]+/, '') : (p.startsWith('/') ? p : `/${p}`);
  return API_ORIGIN + path;
}
