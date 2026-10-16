import { useState } from 'react';
import { api } from '../api/client.js';
import { useDialog } from '../context/UiContext.jsx';
import '../styles/pages/boletines-generados.css';

const GRADES = ['Grado 1º', 'Grado 2º', 'Grado 3º', 'Grado 4º', 'Grado 5º', 'Grado 6º',
  'Grado 7º', 'Grado 8º', 'Grado 9º', 'Grado 10º', 'Grado 11º'];
const CLASSROOMS = ['Salon A', 'Salon B'];
const PERIODOS = [1, 2, 3, 4];

const numeroGrado = (grade) => { const m = grade.match(/\d+/); return m ? m[0] : grade; };
const letraSalon = (classroom) => {
  const partes = classroom.trim().split(/\s+/);
  return (partes[partes.length - 1] || '').toUpperCase();
};
// "BOLETIN_Perez_Juan.pdf" → "Juan Perez"
const formatearNombre = (fileName) => {
  const base = fileName.replace(/\.pdf$/i, '').replace(/^BOLETIN_/i, '');
  const partes = base.split('_').filter(Boolean);
  if (partes.length >= 2) {
    const apellido = partes[0];
    const nombre = partes.slice(1).join(' ');
    return `${nombre} ${apellido}`;
  }
  return base.replace(/_/g, ' ');
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

export default function BoletinesGenerados() {
  const dialogService = useDialog();
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [boletines, setBoletines] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [, setDescargando] = useState({});

  const cargarBoletines = (grade, classroom, period) => {
    if (!grade || !classroom) return;
    setIsLoading(true);
    setErrorMessage('');
    const query = { grade: numeroGrado(grade), classroom: letraSalon(classroom) };
    if (period) query.period = String(period);
    api.get('/boletines/generados', query).then((data) => {
      setBoletines((data || []).map((b) => ({ ...b, displayName: formatearNombre(b.fileName) })));
      setIsLoading(false);
    }).catch((err) => {
      setIsLoading(false);
      setErrorMessage(err?.status === 403
        ? 'Solo un administrador puede ver los boletines generados.'
        : 'No se pudieron cargar los boletines generados.');
    });
  };

  const selectGrade = (grade, classroom) => {
    setSelectedGrade(grade);
    setSelectedClassroom(classroom);
    cargarBoletines(grade, classroom, selectedPeriod);
  };

  const onPeriodFilterChange = (value) => {
    const p = value === '' ? null : Number(value);
    setSelectedPeriod(p);
    cargarBoletines(selectedGrade, selectedClassroom, p);
  };

  const descargar = (b) => {
    const key = b.fileName + b.period;
    setDescargando((d) => ({ ...d, [key]: true }));
    api.open('GET', '/boletines/generados/descargar', {
      query: { period: String(b.period), grade: b.grade, classroom: b.classroom, fileName: b.fileName },
    }).then(() => {
      setDescargando((d) => ({ ...d, [key]: false }));
    }).catch(() => {
      setDescargando((d) => ({ ...d, [key]: false }));
      dialogService.alert('No se pudo descargar el boletín. Verifica que tu sesión siga activa.', 'Error al descargar');
    });
  };

  return (
    <div className="pg-boletines-generados">
      <div className="bg-container">
        <div className="page-header">
          <h2><span className="material-icons">folder_special</span> Boletines Generados</h2>
          <p className="page-subtitle">Consulta y descarga los boletines ya generados, organizados por período y salón.</p>
        </div>

        <div className="bg-layout">
          <div className="bg-sidebar">
            <div className="grades-row">
              {GRADES.map((grade) => (
                <div className="grade-section" key={grade}>
                  <h3>{grade}</h3>
                  <div className="classrooms">
                    {CLASSROOMS.map((classroom) => (
                      <button
                        key={classroom}
                        className={'classroom-btn' + (selectedGrade === grade && selectedClassroom === classroom ? ' selected' : '')}
                        onClick={() => selectGrade(grade, classroom)}
                      >
                        {classroom}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-content">
            {(!selectedGrade || !selectedClassroom) && (
              <div className="empty-state">
                <span className="material-icons">folder_open</span>
                <h3>Selecciona un grado y salón</h3>
                <p>Elige una opción del panel izquierdo para ver los boletines generados</p>
              </div>
            )}

            {selectedGrade && selectedClassroom && (
              <>
                <div className="content-header">
                  <h3>{selectedGrade} — {selectedClassroom}</h3>
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
                    <p>Cargando boletines...</p>
                  </div>
                )}

                {!isLoading && errorMessage && (
                  <div className="error-banner">
                    <span className="material-icons">error_outline</span>
                    <p>{errorMessage}</p>
                  </div>
                )}

                {!isLoading && !errorMessage && boletines.length === 0 && (
                  <div className="empty-state">
                    <span className="material-icons">description</span>
                    <h3>Todavía no hay boletines generados</h3>
                    <p>Cuando generes boletines para este grado y salón, aparecerán aquí automáticamente.</p>
                  </div>
                )}

                {!isLoading && !errorMessage && boletines.length > 0 && (
                  <div className="boletines-grid">
                    {boletines.map((b) => (
                      <div
                        key={b.fileName + b.period}
                        className="boletin-card a11y-clickable"
                        role="button"
                        tabIndex={0}
                        aria-label="Descargar boletín"
                        onClick={() => descargar(b)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') descargar(b);
                          else if (e.key === ' ') { descargar(b); e.preventDefault(); }
                        }}
                      >
                        <div className="boletin-icon">
                          <span className="material-icons">picture_as_pdf</span>
                        </div>
                        <div className="boletin-info">
                          <h4>{b.displayName}</h4>
                          <span className="boletin-period-badge">Período {b.period}</span>
                          <p className="boletin-meta">{formatearFecha(b.generatedAt)} · {formatearTamano(b.sizeBytes)}</p>
                        </div>
                        <button className="download-btn" title="Descargar" aria-label="Descargar boletín">
                          <span className="material-icons">download</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
