import { useEffect, useRef, useState } from 'react';
import '../styles/pages/mis-boletines.css';
import { misBoletinesService } from '../services/mis-boletines.service.js';
import { useDialog } from '../context/UiContext.jsx';

const POLL_MS = 15000;

function agrupar(data) {
  const mapa = new Map();
  for (const b of data) {
    let g = mapa.get(b.studentId);
    if (!g) { g = { studentId: b.studentId, studentName: b.studentName, grade: b.grade, classroom: b.classroom, boletines: [] }; mapa.set(b.studentId, g); }
    g.boletines.push(b);
  }
  for (const g of mapa.values()) g.boletines.sort((a, b) => a.period - b.period);
  return Array.from(mapa.values());
}

const formatearFecha = (iso) => {
  try { return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

/** Mis Boletines: vista de solo lectura del padre de familia, se refresca cada 15 s. */
export default function MisBoletines() {
  const dialog = useDialog();
  const [grupos, setGrupos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [descargando, setDescargando] = useState({});
  const err = useRef('');

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      let data;
      try { data = await misBoletinesService.listar(); }
      catch { err.current = 'No se pudieron cargar tus boletines. Verifica tu conexión.'; data = []; }
      if (!alive) return;
      const msg = data.length === 0 && err.current ? err.current : '';
      if (data.length > 0) err.current = '';
      setErrorMessage(msg);
      setGrupos(agrupar(data));
      setIsLoading(false);
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const descargar = async (b) => {
    const key = b.studentId + '-' + b.period;
    setDescargando((d) => ({ ...d, [key]: true }));
    try { await misBoletinesService.descargarPdf(b); }
    catch { dialog.alert('No se pudo descargar el boletín. Verifica que tu sesión siga activa.', 'Error al descargar'); }
    setDescargando((d) => ({ ...d, [key]: false }));
  };

  return (
    <div className="pg-mis-boletines">
      <div className="mb-container">
        <div className="page-header">
          <h2><span className="material-icons">description</span> Mis Boletines</h2>
          <p className="page-subtitle">Boletines generados de tu(s) hijo(a)(s). Se actualiza automáticamente.</p>
        </div>

        {isLoading && <div className="loading-container"><div className="loading-spinner" /><p>Cargando boletines...</p></div>}

        {!isLoading && errorMessage && (
          <div className="error-banner"><span className="material-icons">error_outline</span><p>{errorMessage}</p></div>
        )}

        {!isLoading && !errorMessage && grupos.length === 0 && (
          <div className="empty-state">
            <span className="material-icons">folder_open</span>
            <h3>Todavía no hay boletines disponibles</h3>
            <p>Cuando el colegio genere el boletín de tu hijo(a), aparecerá aquí automáticamente. Si tu hijo(a) está marcado como inactivo, sus boletines no se mostrarán hasta que sea reactivado.</p>
          </div>
        )}

        {!isLoading && grupos.length > 0 && grupos.map((grupo) => (
          <div key={grupo.studentId} className="student-group">
            <div className="student-group-header">
              <span className="material-icons">person</span>
              <div>
                <h3>{grupo.studentName}</h3>
                <span className="student-meta">{grupo.grade} · {grupo.classroom}</span>
              </div>
            </div>
            <div className="boletines-grid">
              {grupo.boletines.map((b) => {
                const key = b.studentId + '-' + b.period;
                const act = (e) => { if (e.key === 'Enter') descargar(b); else if (e.key === ' ') { descargar(b); e.preventDefault(); } };
                return (
                  <div key={key} className="boletin-card a11y-clickable" role="button" tabIndex={0} aria-label="Descargar boletín" onClick={() => descargar(b)} onKeyDown={act}>
                    <div className="boletin-icon"><span className="material-icons">picture_as_pdf</span></div>
                    <div className="boletin-info">
                      <h4>Período {b.period}</h4>
                      <p className="boletin-meta">{formatearFecha(b.generatedAt)}</p>
                    </div>
                    <button className="download-btn" title="Descargar" aria-label="Descargar boletín" disabled={!!descargando[grupo.studentId + '-' + b.period]}>
                      <span className="material-icons">{descargando[grupo.studentId + '-' + b.period] ? 'hourglass_empty' : 'download'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
