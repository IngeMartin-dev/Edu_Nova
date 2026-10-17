import { api } from '../api/client.js';

/** Servicio de boletines generados (BoletinesGeneradosService del original). */
export const boletinesGeneradosService = {
  listar(grade, classroom, period) {
    const params = { grade, classroom };
    if (period) params.period = String(period);
    return api.get('/boletines/generados', params);
  },
  /** Abre el PDF (con token) en una pestaña nueva. */
  descargarPdf(b) {
    return api.open('GET', '/boletines/generados/descargar', {
      query: { period: String(b.period), grade: b.grade, classroom: b.classroom, fileName: b.fileName },
    });
  },
};
