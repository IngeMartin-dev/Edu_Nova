import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useDialog } from '../context/UiContext.jsx';
import '../styles/pages/consolidados-generados.css';

const PERIODOS = [1, 2, 3, 4];

// "Consolidado_Grado_5º_Salon_A_Periodo1.pdf" → "Grado 5º Salon A · Periodo1"
const formatearNombre = (fileName) => fileName.replace(/\.pdf$/i, '').replace(/^Consolidado_/i, '').replace(/_/g, ' ');
// "7A" → "Grado 7º"
const gradoDeCarpeta = (salonCarpeta) => { const m = salonCarpeta.match(/\d+/); return m ? `Grado ${m[0]}º` : salonCarpeta; };
// "7A" → "Salón A"
const salonDeCarpeta = (salonCarpeta) => {
  const letra = salonCarpeta.replace(/\d+/g, '').trim();
  return letra ? `Salón ${letra}` : '';
};
const formatearFecha = (iso) => {
  try {
    return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};
const formatearTamano = (bytes) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export default function ConsolidadosGenerados() {
  const dialogService = useDialog();
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [consolidados, setConsolidados] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [descargando, setDescargando] = useState({});

  const cargar = (period) => {
    setIsLoading(true);
    setErrorMessage('');
    const query = {};
    if (period) query.period = String(period);
    api.get('/consolidado/generados', query).then((data) => {
      setConsolidados((data || []).map((c) => ({
        ...c,
        displayName: formatearNombre(c.fileName),
        gradoLabel: gradoDeCarpeta(c.salonCarpeta),
        salonLabel: salonDeCarpeta(c.salonCarpeta),
      })));
      setIsLoading(false);
    }).catch((err) => {
      setIsLoading(false);
      setErrorMessage(err?.status === 403
        ? 'No tienes permisos para ver los consolidados generados (solo Administrador o Director de Grupo).'
        : 'No se pudieron cargar los consolidados generados.');
    });
  };

  useEffect(() => { cargar(null); }, []);

  const volver = () => navigate('/reports');

  const onPeriodFilterChange = (value) => {
    const p = value === '' ? null : Number(value);
    setSelectedPeriod(p);
    cargar(p);
  };

  const gruposPorSalon = useMemo(() => {
    const grupos = new Map();
    for (const c of consolidados) {
      if (!grupos.has(c.salonCarpeta)) grupos.set(c.salonCarpeta, []);
      grupos.get(c.salonCarpeta).push(c);
    }
    return Array.from(grupos.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([salonCarpeta, items]) => ({
        salonCarpeta,
        gradoLabel: gradoDeCarpeta(salonCarpeta),
        salonLabel: salonDeCarpeta(salonCarpeta),
        items,
      }));
  }, [consolidados]);

  const descargar = (c) => {
    const key = c.fileName + c.period;
    setDescargando((d) => ({ ...d, [key]: true }));
    api.open('GET', '/consolidado/generados/descargar', {
      query: { period: String(c.period), salonCarpeta: c.salonCarpeta, fileName: c.fileName },
    }).then(() => {
      setDescargando((d) => ({ ...d, [key]: false }));
    }).catch(() => {
      setDescargando((d) => ({ ...d, [key]: false }));
      dialogService.alert('No se pudo descargar el consolidado. Verifica que tu sesión siga activa.', 'Error al descargar');
    });
  };

  return (
    <div className="pg-consolidados-generados">
      <div className="cg-container">
        <div className="page-header">
          <button className="back-btn" onClick={volver}>
            <span className="material-icons">arrow_back</span> Volver a Consolidado
          </button>
          <h2><span className="material-icons">folder_special</span> Consolidados Generados</h2>
          <p className="page-subtitle">Consulta y descarga los consolidados de grado/salón ya generados, organizados por período y salón.</p>
        </div>

        <div className="cg-content">
          <div className="content-header">
            <div className="period-filter">
              <label>Período:</label>
              <select value={selectedPeriod === null ? '' : selectedPeriod} onChange={(e) => onPeriodFilterChange(e.target.value)}>
                <option value="">Todos</option>
                {PERIODOS.map((p) => <option key={p} value={p}>Período {p}</option>)}
              </select>
            </div>
          </div>

          {isLoading && (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Cargando consolidados...</p>
            </div>
          )}

          {!isLoading && errorMessage && (
            <div className="error-banner">
              <span className="material-icons">error_outline</span>
              <p>{errorMessage}</p>
            </div>
          )}

          {!isLoading && !errorMessage && consolidados.length === 0 && (
            <div className="empty-state">
              <span className="material-icons">description</span>
              <h3>Todavía no hay consolidados generados</h3>
              <p>Cuando generes un consolidado de un grado y salón, quedará guardado y aparecerá aquí automáticamente.</p>
            </div>
          )}

          {!isLoading && !errorMessage && consolidados.length > 0 && (
            <div className="salon-groups">
              {gruposPorSalon.map((grupo) => (
                <div className="salon-group" key={grupo.salonCarpeta}>
                  <h3 className="salon-group-title">
                    <span className="material-icons">groups</span>
                    {grupo.gradoLabel} — {grupo.salonLabel}
                  </h3>
                  <div className="consolidados-grid">
                    {grupo.items.map((c) => (
                      <div
                        key={c.fileName + c.period}
                        className="consolidado-card a11y-clickable"
                        role="button"
                        tabIndex={0}
                        aria-label="Descargar consolidado"
                        onClick={() => descargar(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') descargar(c);
                          else if (e.key === ' ') { descargar(c); e.preventDefault(); }
                        }}
                      >
                        <div className="consolidado-icon">
                          <span className="material-icons">picture_as_pdf</span>
                        </div>
                        <div className="consolidado-info">
                          <h4>{c.displayName}</h4>
                          <span className="consolidado-period-badge">Período {c.period}</span>
                          <p className="consolidado-meta">{formatearFecha(c.generatedAt)} · {formatearTamano(c.sizeBytes)}</p>
                        </div>
                        <button className="download-btn" title="Descargar" disabled={!!descargando[c.fileName + c.period]}>
                          {descargando[c.fileName + c.period]
                            ? <span className="material-icons spin">autorenew</span>
                            : <span className="material-icons">download</span>}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
