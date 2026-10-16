import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useDialog } from '../context/UiContext.jsx';
import '../styles/pages/promociones.css';

const fecha = (iso) => {
  if (!iso) return '-';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

/** "3 años y 2 meses" / "45 días" que le quedan antes del borrado automático. */
const restante = (dias) => {
  if (dias == null) return '-';
  if (dias < 60) return `${dias} día(s)`;
  const anios = Math.floor(dias / 365);
  const meses = Math.floor((dias % 365) / 30);
  return anios > 0 ? `${anios} año(s)${meses ? ' y ' + meses + ' mes(es)' : ''}` : `${meses} mes(es)`;
};

export default function Promociones() {
  const dialogService = useDialog();
  const [promociones, setPromociones] = useState([]);
  const [anioSeleccionado, setAnioSeleccionado] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [abriendo, setAbriendo] = useState({});

  const cargar = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await api.get('/promociones');
      setPromociones(data || []);
      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(err?.status === 403
        ? 'Solo un administrador puede ver las promociones.'
        : 'No se pudieron cargar las promociones.');
    }
  };

  useEffect(() => { cargar(); }, []);

  const anios = useMemo(() => {
    const mapa = new Map();
    for (const p of promociones) {
      if (!mapa.has(p.academicYear)) mapa.set(p.academicYear, []);
      mapa.get(p.academicYear).push(p);
    }
    return Array.from(mapa.entries())
      .map(([anio, lista]) => ({ anio, total: lista.length, conBoletines: lista.filter((x) => x.periodos.length > 0).length }))
      .sort((a, b) => b.anio - a.anio);
  }, [promociones]);

  const abrirAnio = (anio) => { setAnioSeleccionado(anio); setBusqueda(''); };
  const volver = () => setAnioSeleccionado(null);

  const estudiantesDelAnio = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return promociones.filter((p) =>
      p.academicYear === anioSeleccionado &&
      (!q || `${p.name} ${p.surname} ${p.documentNumber || ''}`.toLowerCase().includes(q)));
  }, [promociones, anioSeleccionado, busqueda]);

  const abrirBoletin = async (p, periodo) => {
    const key = `${p.id}-${periodo}`;
    setAbriendo((a) => ({ ...a, [key]: true }));
    try {
      await api.open('GET', `/promociones/${p.id}/boletines/${periodo}`);
      setAbriendo((a) => ({ ...a, [key]: false }));
    } catch {
      setAbriendo((a) => ({ ...a, [key]: false }));
      dialogService.alert('No se pudo abrir el boletín. Verifica que tu sesión siga activa.', 'Error');
    }
  };

  return (
    <div className="pg-promociones">
      <div className="pr-container">
        <div className="page-header">
          <h2><span className="material-icons">workspace_premium</span> Promociones</h2>
          <p className="page-subtitle">
            Estudiantes que terminaron Grado 11º. Sus boletines se conservan 5 años y después se borran automáticamente.
          </p>
        </div>

        {isLoading && <div className="pr-info">Cargando promociones…</div>}
        {errorMessage && <div className="pr-info pr-error">{errorMessage}</div>}

        {!isLoading && !errorMessage && promociones.length === 0 && (
          <div className="pr-empty">
            <span className="material-icons">school</span>
            <h3>Aún no hay promociones</h3>
            <p>Cuando el administrador adelante el año, los estudiantes de Grado 11º aparecerán aquí.</p>
          </div>
        )}

        {/* Recuadros: uno por año */}
        {!isLoading && promociones.length > 0 && anioSeleccionado === null && (
          <div className="pr-years-grid">
            {anios.map((a) => (
              <div key={a.anio} className="pr-year-card a11y-clickable" role="button" tabIndex={0}
                aria-label={'Abrir Promoción ' + a.anio}
                onClick={() => abrirAnio(a.anio)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') abrirAnio(a.anio);
                  else if (e.key === ' ' || e.key === 'Spacebar') { abrirAnio(a.anio); e.preventDefault(); }
                }}>
                <div className="pr-year-icon"><span className="material-icons">workspace_premium</span></div>
                <div className="pr-year-info">
                  <h4>Promoción {a.anio}</h4>
                  <span className="pr-year-badge">{a.total} egresado(s)</span>
                  <p className="pr-year-meta">{a.conBoletines} con boletines guardados</p>
                </div>
                <span className="material-icons pr-year-arrow">chevron_right</span>
              </div>
            ))}
          </div>
        )}

        {/* Estudiantes de la promoción elegida */}
        {anioSeleccionado !== null && (
          <>
            <div className="pr-year-header">
              <button type="button" className="pr-back-btn" onClick={volver}>
                <span className="material-icons">arrow_back</span> Promociones
              </button>
              <h3>Promoción {anioSeleccionado}</h3>
              <input type="text" className="pr-search" placeholder="Buscar por nombre o documento…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>

            {estudiantesDelAnio.length === 0 ? (
              <div className="pr-info">Ningún estudiante coincide con la búsqueda.</div>
            ) : (
              <div className="pr-students-grid">
                {estudiantesDelAnio.map((p) => (
                  <div key={p.id} className="pr-student-card">
                    <div className="pr-student-top">
                      <div className="pr-student-icon"><span className="material-icons">school</span></div>
                      <div className="pr-student-info">
                        <h4>{p.surname} {p.name}</h4>
                        <p className="pr-year-meta">{p.documentNumber || 'Sin documento'} · {p.grade}{p.classGroup ? ' · ' + p.classGroup : ''}</p>
                        <p className="pr-year-meta">Se borra el {fecha(p.expiresAt)} (en {restante(p.daysLeft)})</p>
                      </div>
                    </div>
                    {p.periodos.length === 0 ? (
                      <span className="pr-muted">Sin boletines guardados</span>
                    ) : (
                      <div className="pr-periods">
                        {p.periodos.map((per) => (
                          <button key={per} type="button" className="pr-period-btn" disabled={!!abriendo[p.id + '-' + per]} onClick={() => abrirBoletin(p, per)}>
                            <span className="material-icons">picture_as_pdf</span> Período {per}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
