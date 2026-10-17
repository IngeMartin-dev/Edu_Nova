import { api } from '../api/client.js';

/** Servicio de consolidados generados (ConsolidadosGeneradosService del original). */
export const consolidadosGeneradosService = {
  listar(period) {
    const params = {};
    if (period) params.period = String(period);
    return api.get('/consolidado/generados', params);
  },
  descargarPdf(c) {
    return api.open('GET', '/consolidado/generados/descargar', {
      query: { period: String(c.period), salonCarpeta: c.salonCarpeta, fileName: c.fileName },
    });
  },
};
