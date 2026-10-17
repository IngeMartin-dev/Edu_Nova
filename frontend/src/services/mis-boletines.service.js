import { api } from '../api/client.js';

/** Servicio de la vista "Mis Boletines" del padre de familia (MisBoletinesService del original). */
export const misBoletinesService = {
  listar() { return api.get('/boletines/mis-boletines'); },
  descargarPdf(b) {
    return api.open('GET', `/boletines/mis-boletines/${b.studentId}/descargar`, { query: { period: String(b.period) } });
  },
};
