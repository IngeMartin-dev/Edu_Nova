import { useEffect, useState } from 'react';
import '../styles/pages/mis-notas.css';
import { api } from '../api/client.js';

const POLL_MS = 15000;
const fmt1 = (n) => Number(n).toFixed(1);
const esAprobatoria = (finalGrade, minPassing) => {
  if (finalGrade === null || finalGrade === undefined) return true;
  return finalGrade >= minPassing;
};

/** Vista de solo lectura de notas para PADRE DE FAMILIA. Se refresca cada 15s. */
export default function MisNotas() {
  const [hijos, setHijos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedPeriodByStudent, setSelected] = useState({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let data;
      let err = '';
      try {
        data = await api.get('/grades/mis-notas');
        if (!Array.isArray(data)) data = [];
      } catch {
        err = 'No se pudieron cargar tus notas. Verifica tu conexión.';
        data = [];
      }
      if (!alive) return;
      setErrorMessage(data.length === 0 && err ? err : '');
      setHijos(data);
      setSelected((prev) => {
        const next = { ...prev };
        for (const h of data) {
          if (!next[h.studentId] && h.periods.length > 0) next[h.studentId] = h.periods[h.periods.length - 1].period;
        }
        return next;
      });
      setIsLoading(false);
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const periodoActivo = (hijo) => hijo.periods.find((p) => p.period === selectedPeriodByStudent[hijo.studentId]);

  return (
    <div className="pg-mis-notas">
      <div className="mn-container">
        <div className="page-header">
          <h2><span className="material-icons">grade</span> Mis Notas</h2>
          <p className="page-subtitle">Notas de tu(s) hijo(a)(s). Solo lectura, se actualiza automáticamente.</p>
        </div>

        {isLoading && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando notas...</p>
          </div>
        )}

        {!isLoading && errorMessage && (
          <div className="error-banner">
            <span className="material-icons">error_outline</span>
            <p>{errorMessage}</p>
          </div>
        )}

        {!isLoading && !errorMessage && hijos.length === 0 && (
          <div className="empty-state">
            <span className="material-icons">assignment_late</span>
            <h3>Todavía no hay notas registradas</h3>
            <p>
              Cuando el profesor registre notas de tu hijo(a), aparecerán aquí automáticamente.
              Si tu hijo(a) está marcado como inactivo, sus notas no se mostrarán hasta que sea reactivado.
            </p>
          </div>
        )}

        {!isLoading && hijos.length > 0 && hijos.map((hijo) => {
          const periodo = periodoActivo(hijo);
          return (
            <div className="student-block" key={hijo.studentId}>
              <div className="student-header">
                <span className="material-icons">person</span>
                <div>
                  <h3>{hijo.studentName}</h3>
                  <span className="student-meta">{hijo.grade} · {hijo.classroom}</span>
                </div>
              </div>

              <div className="period-tabs">
                {hijo.periods.map((p) => (
                  <button
                    key={p.period}
                    className={`period-tab${selectedPeriodByStudent[hijo.studentId] === p.period ? ' active' : ''}`}
                    onClick={() => setSelected((s) => ({ ...s, [hijo.studentId]: p.period }))}
                  >
                    Período {p.period}
                  </button>
                ))}
              </div>

              {periodo && (
                <div className="subjects-grid">
                  {periodo.subjects.map((materia) => {
                    const hasFinal = materia.finalGrade !== null && materia.finalGrade !== undefined;
                    const ok = esAprobatoria(materia.finalGrade, hijo.minPassingGrade);
                    return (
                      <div className="subject-card" key={materia.subjectName}>
                        <div className="subject-card-header">
                          <h4>{materia.subjectName}</h4>
                          {hasFinal && (
                            <span className={`final-grade-badge${ok ? ' pass' : ''}${!ok ? ' fail' : ''}`}>
                              {fmt1(materia.finalGrade)}
                            </span>
                          )}
                        </div>
                        {materia.items.length > 0 ? (
                          <ul className="grade-items">
                            {materia.items.map((item) => (
                              <li key={item.gradeName}>
                                <span className="grade-name">
                                  {item.gradeName}
                                  {item.isEvaluation && <span className="eval-tag">Evaluación</span>}
                                </span>
                                <span className="grade-value">
                                  {item.gradeValue !== null ? fmt1(item.gradeValue) : '—'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="no-items">Sin notas individuales registradas todavía.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
