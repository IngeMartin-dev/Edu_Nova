import { api } from '../api/client.js';
import { bus } from './events.js';
import { createStore, useStore } from './store.js';

/**
 * Servicio global de generación de boletines (GenerationService del original):
 * sondea las generaciones activas/recientes en TODA la app para que la notificación
 * de progreso aparezca en cualquier pantalla y sobreviva a un F5.
 */
const POLL_INTERVAL_MS = 500;
const jobs = createStore([]);
export const useGenerationJobs = () => useStore(jobs);

let handle = null;
let focusJobId = null;
let navigateFn = null;
export const setGenerationNavigate = (fn) => { navigateFn = fn; };

export const generation = {
  get currentJobs() { return jobs.get(); },
  startPolling() {
    if (handle) return;
    this.refresh();
    handle = setInterval(() => this.refresh(), POLL_INTERVAL_MS);
  },
  stopPolling() { clearInterval(handle); handle = null; },
  async refresh() {
    if (!localStorage.getItem('token')) return; // antes del login no se consulta
    try { jobs.set((await api.get('/boletines/generaciones')) || []); } catch (e) {
      if (e?.status === 401 || e?.status === 403) jobs.set([]);
    }
  },
  /** Inserta/actualiza un job de inmediato (optimista). */
  upsertJobLocal(job) { jobs.set((cur) => [job, ...cur.filter((j) => j.jobId !== job.jobId)]); },
  /** Click en una notificación: navega a Boletines y deja marcado qué job enfocar. */
  openJob(job) {
    focusJobId = job.jobId;
    bus.emit('generation:focus', job.jobId);
    navigateFn?.('/boletines');
  },
  consumeFocusJobId() { const id = focusJobId; focusJobId = null; return id; },
};
