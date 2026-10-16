// Capa de compatibilidad: expone con la forma esperada los servicios que usa
// la lógica de Calificaciones (HttpClient, AuthService, DialogService, etc.).
import { api, session } from '../../api/client.js';
import { bus } from '../../services/events.js';

const ORIGIN = /^(https?:\/\/[^/]+)?\/api/i;
const toPath = (url) => url.replace(ORIGIN, '');

/** Error con la forma de HttpErrorResponse: { status, error: { error } }. */
function toHttpError(e) {
  return { status: e?.status ?? 0, message: e?.message, error: e?.data && typeof e.data === 'object' ? e.data : { error: e?.message } };
}

/** Observable mínimo: subscribe({ next, error }) → { unsubscribe }. */
export function fromPromise(p) {
  return {
    subscribe(h = {}) {
      if (typeof h === 'function') h = { next: h };
      let closed = false;
      p.then((v) => { if (!closed) { try { h.next?.(v); h.complete?.(); } finally { deps.tick?.(); } } }, (e) => { if (!closed) { try { h.error?.(toHttpError(e)); } finally { deps.tick?.(); } } });
      return { unsubscribe() { closed = true; }, get closed() { return closed; } };
    },
    toPromise: () => p.catch((e) => { throw toHttpError(e); }),
  };
}
export const firstValueFrom = (obs) => obs.toPromise();

export const http = {
  get: (url) => fromPromise(api.get(toPath(url))),
  post: (url, body) => fromPromise(api.post(toPath(url), body)),
};

export const authService = {
  getCurrentUserValue() { try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; } },
  getToken: () => session.token,
  refreshToken() {
    const p = fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refresh }) })
      .then((r) => { if (!r.ok) throw new Error('refresh'); return r.json(); });
    return fromPromise(p);
  },
};

export const realtimeService = {
  periods$: { subscribe(fn) { const off = bus.on('periods:changed', fn); return { unsubscribe: off }; } },
};
export const gradesUpdateService = { notifyGradeUpdate: () => bus.emit('grades:changed') };

export const gradeColumnConfigService = {
  getConfig: (teacherId, subjectName, grade, classroom, period) =>
    fromPromise(api.get('/grade-columns', { teacherId: String(teacherId), subjectName, grade, classroom, period: String(period) })),
  saveConfig: (teacherId, subjectName, grade, classroom, period, columns, quizzesPct, talleresPct, actividadesPct) =>
    fromPromise(api.post('/grade-columns', { teacherId, subjectName, grade, classroom, period, columnsJson: JSON.stringify(columns), quizzesPct, talleresPct, actividadesPct })),
};

// El diálogo (useDialog) lo inyecta el componente React al montarse.
export const deps = { tick: null, dialogService: { alert: async () => {}, confirm: async () => false, input: async () => null } };
export const sanitizer = { bypassSecurityTrustHtml: (h) => h };
