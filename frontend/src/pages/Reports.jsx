import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/consolidado.css';
import { api } from '../api/client.js';

const GRADES = ['Grado 1º', 'Grado 2º', 'Grado 3º', 'Grado 4º', 'Grado 5º', 'Grado 6º', 'Grado 7º', 'Grado 8º', 'Grado 9º', 'Grado 10º', 'Grado 11º'];
const CLASSROOMS = ['Salon A', 'Salon B'];
const PERIODOS = [1, 2, 3, 4];

/** Consolidado: genera el PDF horizontal de un grado y salón (consolidado del original). */
export default function Reports() {
  const navigate = useNavigate();
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const rawUrl = useRef(null);

  const revoke = () => { if (rawUrl.current) { URL.revokeObjectURL(rawUrl.current); rawUrl.current = null; } };
  useEffect(() => revoke, []);

  const selectGrade = (grade, classroom) => {
    setSelectedGrade(grade); setSelectedClassroom(classroom);
    revoke(); setPdfPreviewUrl(null); setErrorMessage('');
  };

  const generarConsolidado = async () => {
    if (!(selectedGrade && selectedClassroom && selectedPeriod)) return;
    setIsGenerating(true); setErrorMessage(''); setPdfPreviewUrl(null);
    try {
      const blob = await api.blob('GET', '/consolidado/grado-salon', { query: { grade: selectedGrade, classroom: selectedClassroom, period: selectedPeriod } });
      revoke();
      rawUrl.current = URL.createObjectURL(blob);
      setPdfPreviewUrl(rawUrl.current);
      setIsGenerating(false);
    } catch (err) {
      setIsGenerating(false);
      setErrorMessage(err?.status === 403
        ? 'No tienes permisos para generar este consolidado (solo Administrador o Director de Grupo).'
        : (err?.message || 'No se pudo generar el consolidado. Verifica que haya notas registradas para ese grado, salón y período.'));
    }
  };

  const descargarPdf = () => {
    if (!rawUrl.current || !selectedGrade || !selectedClassroom) return;
    const a = document.createElement('a');
    a.href = rawUrl.current;
    a.download = `Consolidado_${selectedGrade}_${selectedClassroom}_Periodo${selectedPeriod}.pdf`;
    a.click();
  };

  return (
    <div className="pg-consolidado">
      <div className="reports-container">
        <div className="page-header">
          <h2><span className="material-icons">assessment</span> Consolidado</h2>
          <p className="page-subtitle">Selecciona un grado y salón para generar el consolidado de calificaciones en PDF (horizontal).</p>
          <button className="ver-generados-btn" onClick={() => navigate('/consolidados-generados')}>
            <span className="material-icons">folder_special</span> Ver consolidados generados
          </button>
        </div>

        <div className="reports-layout">
          <div className="reports-sidebar">
            <div className="grades-row">
              {GRADES.map((grade) => (
                <div key={grade} className="grade-section">
                  <h3>{grade}</h3>
                  <div className="classrooms">
                    {CLASSROOMS.map((c) => (
                      <button key={c} className={`classroom-btn${selectedGrade === grade && selectedClassroom === c ? ' selected' : ''}`} onClick={() => selectGrade(grade, c)}>{c}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="reports-content">
            {(!selectedGrade || !selectedClassroom) && (
              <div className="empty-state">
                <span className="material-icons">bar_chart</span>
                <h3>Selecciona un grado y salón</h3>
                <p>Elige una opción del panel izquierdo para configurar el consolidado</p>
              </div>
            )}

            {selectedGrade && selectedClassroom && (
              <>
                <div className="content-header">
                  <h3>{selectedGrade} — {selectedClassroom}</h3>
                  <div className="period-filter">
                    <label>Período:</label>
                    <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(Number(e.target.value))}>
                      {PERIODOS.map((p) => <option key={p} value={p}>Período {p}</option>)}
                    </select>
                    <button className="generate-btn" disabled={isGenerating} onClick={generarConsolidado}>
                      {isGenerating
                        ? <><span className="material-icons spin">autorenew</span> Generando...</>
                        : <><span className="material-icons">picture_as_pdf</span> Generar consolidado</>}
                    </button>
                  </div>
                </div>

                {errorMessage && (
                  <div className="error-banner"><span className="material-icons">error_outline</span><p>{errorMessage}</p></div>
                )}

                {pdfPreviewUrl && (
                  <>
                    <div className="pdf-preview-toolbar">
                      <span>Vista previa del consolidado</span>
                      <button className="download-btn" onClick={descargarPdf}><span className="material-icons">download</span> Descargar</button>
                    </div>
                    <iframe className="pdf-preview" src={pdfPreviewUrl} title="Vista previa del consolidado" />
                  </>
                )}

                {!pdfPreviewUrl && !errorMessage && !isGenerating && (
                  <div className="empty-state">
                    <span className="material-icons">picture_as_pdf</span>
                    <h3>Listo para generar</h3>
                    <p>Elige el período y presiona "Generar consolidado" para ver la vista previa aquí mismo.</p>
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
