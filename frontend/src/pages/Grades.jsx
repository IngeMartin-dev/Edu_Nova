import { useEffect, useReducer, useRef } from 'react';
import '../styles/pages/grades.css';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import renderMathInElement from 'katex/dist/contrib/auto-render.mjs';
import BoundInput from '../components/BoundInput.jsx';
import { useDialog } from '../context/UiContext.jsx';
import { Grades as GradesController } from './grades/GradesController.js';
import { deps } from './grades/compat.js';
import Overlay from '../components/Overlay.jsx';

// El original carga KaTeX por <script>; aquí se expone igual en window para la lógica portada.
window.katex = katex;
window.renderMathInElement = renderMathInElement;

const cx = (...a) => a.filter(Boolean).join(' ');

/** Gestión de Notas (grades del original). La lógica vive en grades/GradesController.js (port 1:1 de grades.ts). */
export default function Grades() {
  const dialog = useDialog();
  const [, force] = useReducer((x) => x + 1, 0);
  const ref = useRef({ c: null, pending: false, alive: true });
  const st = ref.current;
  deps.dialogService = dialog;

  const tick = () => {
    if (st.pending || !st.alive) return;
    st.pending = true;
    Promise.resolve().then(() => { st.pending = false; if (st.alive) force(); });
  };
  if (!st.c) {
    deps.tick = tick;
    st.c = new GradesController({ markForCheck: tick, detectChanges: tick });
  }
  const c = st.c;

  useEffect(() => {
    st.alive = true;
    deps.tick = tick;
    c.ngOnInit();
    const before = () => c.onBeforeUnload();
    window.addEventListener('beforeunload', before);
    tick();
    return () => {
      window.removeEventListener('beforeunload', before);
      c.ngOnDestroy();
      st.alive = false;
    };
  }, []); // eslint-disable-line

  /** Ejecuta un handler del controlador y repinta (equivale a la detección de cambios tras un evento). */
  const A = (fn) => (...args) => { const r = fn(...args); tick(); if (r && r.then) r.then(tick, tick); return r; };

  const teacher = c.isTeacher();
  const nums7 = [1, 2, 3, 4, 5, 6, 7];

  const gradeInput = (student, n, labelledBy) => (
    <BoundInput type="text" className="grade-input" id={`grade-input-${student.id}-${n}`} name={`grade-${student.id}-${n}`}
      value={c.getGradeDisplay(student.id, n)}
      onInput={A((e) => c.onGradeChange(student.id, n, e))}
      onClick={A((e) => c.onGradeClick(student.id, n, e))}
      onBlur={A((e) => c.onGradeBlur(student.id, n, e))}
      onFocus={A(() => c.onCellFocus(student.id, n))}
      onKeyDown={A((e) => c.handleKeydown(e))}
      placeholder="-" maxLength={4} autoComplete="off" aria-labelledby={labelledBy} />
  );
  const noteCell = (student, n, labelledBy) => (
    <td className={cx('note-cell', c.getGradeColor(c.getGrade(student.id, n)))}>{gradeInput(student, n, labelledBy)}</td>
  );

  return (
    <div className="pg-grades">
      <div className="grades-container">
        <div className="page-header"><h2>Gestión de Notas</h2></div>

        {teacher && c.hasTeacherGradeRange === false ? (
          <div className="fullscreen-warning">
            <span className="material-icons">warning</span>
            <span>No tienes materias asignadas. Por favor espere o llame al administrador.</span>
          </div>
        ) : teacher && c.hasTeacherGradeRange === null ? (
          <div className="fullscreen-loading">
            <div className="spinner" />
            <span style={{ color: 'var(--text-1)', fontSize: '1.1rem', fontWeight: 600 }}>Verificando materias asignadas...</span>
          </div>
        ) : (
          <>
            <div className="grades-sidebar">
              {c.teacherGradeRange && <div className="grade-range-indicator">Grados {c.teacherGradeRange.min}° - {c.teacherGradeRange.max}°</div>}
              {c.teacherSubjects && c.teacherSubjects.length > 1 && (
                <div className="subject-selector">
                  {c.teacherSubjects.map((subject) => (
                    <button key={subject.id} className={cx('subject-btn', c.selectedSubjectId === subject.id && 'selected')} onClick={A(() => c.onSubjectChange(subject))}>
                      {subject.name}{subject.level ? ' (' + subject.level + ')' : ''}
                    </button>
                  ))}
                </div>
              )}
              <div className={cx('grades-row', c.isFadingOut && 'fade-out', c.isFadingIn && 'fade-in')}>
                {c.grades.map((grade) => (
                  <div key={grade} className="grade-section">
                    <h3>{grade}</h3>
                    <div className="classrooms">
                      {c.classrooms.map((classroom) => (
                        <button key={classroom} className={cx('classroom-btn', c.selectedGrade === grade && c.selectedClassroom === classroom && 'selected')} onClick={A(() => c.selectGrade(grade, classroom))}>{classroom}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="right-content">
              {c.selectedGrade && c.selectedClassroom && (
                <div className="period-selector">
                  <label htmlFor="period-select">Período:</label>
                  <select id="period-select" name="period" value={c.selectedPeriod} onChange={A((e) => c.onPeriodManualChange(e.target.value))}>
                    {c.availablePeriods.map((period) => <option key={period} value={period}>Período {period}</option>)}
                  </select>
                </div>
              )}

              {c.isLoading && <div className="loading-indicator"><div className="spinner" /><p>Cargando notas...</p></div>}

              {c.selectedGrade && c.selectedClassroom && !c.isLoading && (
                <div className="grades-list">
                  {c.students.length > 0 && (
                    <>
                      <div className="report-header">
                        <div className="header-title">EDUNOVA</div>
                        <div className="header-subtitle">LISTADO DE NOTAS</div>
                        <div className="report-info">
                          <div className="info-row">
                            <span className="info-label">PERIODO:</span><span className="info-value">{c.selectedPeriod}</span>
                            <span className="info-label">ÁREA/ASIGNATURA:</span><span className="info-value">{c.selectedSubjectLabel}</span>
                          </div>
                          <div className="info-row">
                            <span className="info-label">GRADO:</span><span className="info-value">{c.selectedGrade}</span>
                            <span className="info-label">GRUPO:</span><span className="info-value">{c.selectedClassroom}</span>
                            <span className="info-label">AÑO:</span><span className="info-value">{c.currentYear}</span>
                          </div>
                        </div>
                      </div>

                      {teacher && (
                        <div className="pct-wrap">
                          <button type="button" className={cx('pct-open-btn', c.showPctPanel && 'active')} onClick={A(() => c.togglePctPanel())}>
                            Porcentajes
                            {(c.weightedMode || c.pctOver) && <span className={cx('pct-open-badge', c.pctOver && 'pct-open-badge-over')}>{c.totalPctSum}%</span>}
                          </button>

                          {c.showPctPanel && (
                            <div className="pct-panel">
                              <div className="pct-panel-head">
                                <span className="pct-panel-title">Porcentaje de cada nota en la nota final</span>
                                <span className={cx('pct-total', c.totalPctSum > 100 && 'pct-over', c.totalPctSum === 100 && 'pct-ok')}>Suma: {c.totalPctSum}%</span>
                              </div>

                              <div className="pct-rows">
                                <div className="pct-row-item">
                                  <BoundInput type="text" className="pct-name-input" name="act-name" value={c.actName} onInput={A((e) => c.onActNameInput(e))} onBlur={A((e) => c.onActNameBlur(e))} maxLength={12} autoComplete="off" aria-label="Nombre del grupo" />
                                  <BoundInput type="text" inputMode="numeric" className="pct-input" name="act-pct" value={c.actPct ?? ''} onInput={A((e) => c.onActPctInput(e))} placeholder="%" maxLength={3} autoComplete="off" aria-label="Porcentaje del grupo" />
                                  <span className="pct-row-note">todas las {c.actName} juntas (1 a 7)</span>
                                </div>
                                <div className="pct-row-item">
                                  <span className="pct-name-fixed">Eval.Period</span>
                                  <BoundInput type="text" inputMode="numeric" className="pct-input" name="eval-pct" value={c.evalPct} onInput={A((e) => c.onEvalPctInput(e))} onBlur={A((e) => c.onEvalPctBlur(e))} maxLength={3} autoComplete="off" aria-label="Porcentaje de Eval.Period" />
                                  <span className="pct-row-note">las actividades valen el {c.activitiesShare}% restante</span>
                                </div>
                                {c.categories.map((cat) => (
                                  <div key={cat.id} className="pct-row-item">
                                    <BoundInput type="text" className="pct-name-input" name={'name-' + cat.id} value={cat.name} onInput={A((e) => c.onCategoryNameInput(cat, e))} onBlur={A((e) => c.onCategoryNameBlur(cat, e))} maxLength={20} autoComplete="off" aria-label={'Nombre ' + cat.name} />
                                    <BoundInput type="text" inputMode="numeric" className="pct-input" name={'pct-' + cat.id} value={cat.pct ?? ''} onInput={A((e) => c.onCategoryPctInput(cat, e))} placeholder="%" maxLength={3} autoComplete="off" aria-label={'Porcentaje ' + cat.name} />
                                    <button type="button" className="pct-remove" onClick={A(() => c.removeCategory(cat))} title="Quitar">×</button>
                                  </div>
                                ))}
                              </div>

                              {c.pctOver && (
                                <p className="pct-error" role="alert">⚠ Los porcentajes suman {c.totalPctSum}% y no pueden pasar de 100%. No se guardarán hasta que los corrijas.</p>
                              )}

                              <p className="pct-hint">
                                {!c.weightedMode ? 'Escribe un porcentaje (1-100) en cada nombre. Sin porcentajes se usa el promedio normal. '
                                  : c.totalPctSum !== 100 ? 'Los porcentajes deberían sumar 100%. ' : 'Porcentajes completos. '}
                                Para poner una columna en la tabla usa el + del encabezado.
                              </p>

                              <button type="button" className="pct-plus" onClick={A(() => c.toggleAddCategoryForm())} title="Añadir nombre con porcentaje">+</button>

                              {c.showAddCategoryForm && (
                                <div className="pct-add-form">
                                  <input type="text" className="pct-add-name" name="addCategoryName" value={c.addCategoryName} onChange={A((e) => { c.addCategoryName = e.target.value; })} placeholder="Nombre (Quiz, Taller...)" maxLength={20} autoComplete="off" />
                                  <input type="number" className="pct-add-pct" name="addCategoryPct" value={c.addCategoryPct ?? ''} onChange={A((e) => { c.addCategoryPct = e.target.value === '' ? null : Number(e.target.value); })} placeholder="%" min="1" max="100" autoComplete="off" />
                                  <button type="button" className="pct-add-ok" onClick={A(() => c.confirmAddCategory())}>Guardar</button>
                                  <button type="button" className="pct-add-cancel" onClick={A(() => c.toggleAddCategoryForm())}>Cancelar</button>
                                  {c.addCategoryError && <span className="pct-add-error">{c.addCategoryError}</span>}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="table-container">
                        <table className="grades-table">
                          <thead>
                            <tr>
                              <th className="no-col">No.</th>
                              <th className="student-col">ESTUDIANTE</th>
                              {nums7.map((n) => <th key={n} id={`th-act${n}`} className="percent-col">{c.actHeader(n)}</th>)}
                              {c.gradeColumns.map((col) => (
                                <th key={col.id} className="percent-col extra-col">
                                  {c.colHeader(col)}
                                  {teacher && <button type="button" className="col-x" onClick={A(() => c.removeColumn(col))} title="Quitar columna">×</button>}
                                </th>
                              ))}
                              {teacher && (
                                <th className="plus-col">
                                  <button type="button" className="col-plus" onClick={A(() => c.toggleAddColumnMenu())} title="Añadir columna">+</button>
                                  {c.showAddColumnMenu && (
                                    <div className="col-menu">
                                      {c.categories.length === 0 && <span className="col-menu-empty">Primero crea un nombre en Porcentajes.</span>}
                                      {c.categories.map((cat) => (
                                        <button key={cat.id} type="button" className="col-menu-item" onClick={A(() => c.addColumnFromCategory(cat))}>
                                          {cat.name} <span className="col-menu-pct">{cat.pct ?? '-'}{cat.pct ? '%' : ''}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </th>
                              )}
                              <th id="th-auto-eval" className="calc-col">Auto.Eval</th>
                              <th id="th-prom-parc" className="calc-col">Prom.Parc</th>
                              <th className="calc-col">{c.activitiesShare}%</th>
                              <th id="th-eval-period" className="calc-col">Eval.Period</th>
                              <th className="calc-col">{c.evalPct}%</th>
                              <th className="def-col">N.FINAL</th>
                              <th id="th-jinteg" className="recovery-col">J.INTEG</th>
                              <th id="th-comp-social" className="recovery-col">COMP SOCIAL</th>
                              <th id="th-val-acudiente" className="recovery-col">VAL. ACUDIENTE</th>
                              <th id="th-recup-escrita" className="percent-col">Recup.Esc</th>
                              <th id="th-recup-oral" className="percent-col">Recup.Oral</th>
                              <th className="percent-col">Nota.Recup</th>
                              <th className="action-col">ACCIÓN</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.students.map((student, i) => {
                              const rec = c.getCurrentSubjectRecoveryData(student.id);
                              return (
                                <tr key={student.id} className={cx(i % 2 === 1 && 'alt', c.needsRecovery(student.id) && 'failing', c.isLosing(student.id) && 'losing', c.hasExcellentGrade(student.id) && 'excellent')}>
                                  <td className="no-cell">{i + 1}</td>
                                  <td className="student-cell">{student.surname} {student.name}</td>

                                  {nums7.map((n) => <FragmentKey key={n}>{noteCell(student, n, `th-act${n}`)}</FragmentKey>)}

                                  {c.gradeColumns.map((col) => (
                                    <td key={col.id} className={cx('note-cell', c.getGradeColor(c.getDynamicGradeValue(student.id, col.id)))}>
                                      <BoundInput type="text" className="grade-input" name={`dyn-${student.id}-${col.id}`} value={c.getDynamicGradeDisplay(student.id, col.id)} onInput={A((e) => c.onDynamicGradeInput(student.id, col, e))} placeholder="-" maxLength={4} autoComplete="off" aria-label={c.colHeader(col)} />
                                    </td>
                                  ))}
                                  {teacher && <td className="plus-cell" />}

                                  {noteCell(student, 9, 'th-auto-eval')}
                                  {noteCell(student, 10, 'th-prom-parc')}

                                  <td className={cx('calc-cell', c.get80Color(student.id))}>{c.get80Percent(student.id)}</td>

                                  {noteCell(student, 8, 'th-eval-period')}

                                  <td className={cx('calc-cell', c.get20Color(student.id))}>{c.get20Percent(student.id)}</td>

                                  <td className={cx('def-cell', c.getFinalColor(student.id))}>{c.getFinalWithRecovery(student.id)}</td>

                                  <td className="recovery-cell">
                                    <BoundInput type="text" className="grade-input" id={`recovery-jinteg-${student.id}`} name={`recovery-jinteg-${student.id}`} value={rec?.jInteg || ''} onInput={A((e) => c.onJIntegChange(student.id, e))} onKeyDown={A((e) => c.handleKeydown(e))} onFocus={A(() => c.onCellFocus(student.id, 8))} placeholder="-" maxLength={50} autoComplete="off" aria-labelledby="th-jinteg" />
                                  </td>

                                  <td className={cx('recovery-cell', 'comp-social-cell', c.getCompSocialColor(student.id))}>
                                    <BoundInput type="text" className="grade-input" id={`recovery-compsocial-${student.id}`} name={`recovery-compsocial-${student.id}`} value={c.getCompSocialDisplay(student.id)} onInput={A((e) => c.onCompSocialChange(student.id, e))} onKeyDown={A((e) => c.handleKeydown(e))} onFocus={A(() => c.onCellFocus(student.id, 8))} placeholder="-" maxLength={4} autoComplete="off" aria-labelledby="th-compsocial" />
                                    <span className="comp-social-label">{c.getCompSocialScaleLabel(student.id)}</span>
                                  </td>

                                  <td className={cx('recovery-cell', 'comp-social-cell', c.getValoracionAcudienteColor(student.id))}>
                                    <BoundInput type="text" className="grade-input" id={`recovery-acudiente-${student.id}`} name={`recovery-acudiente-${student.id}`} value={c.getValoracionAcudienteDisplay(student.id)} onInput={A((e) => c.onValoracionAcudienteChange(student.id, e))} onKeyDown={A((e) => c.handleKeydown(e))} onFocus={A(() => c.onCellFocus(student.id, 8))} placeholder="-" maxLength={4} autoComplete="off" aria-labelledby="th-val-acudiente" />
                                    <span className="comp-social-label">{c.getValoracionAcudienteScaleLabel(student.id)}</span>
                                  </td>

                                  <td className="note-cell">
                                    <BoundInput type="text" className="grade-input" id={`recup-escrita-${student.id}`} name={`recup-escrita-${student.id}`} value={(rec?.written ?? '').toString().replace('.', ',')} onInput={A((e) => c.onRecoveryWrittenChange(student.id, e))} onKeyDown={A((e) => c.handleKeydown(e))} onFocus={A(() => c.onCellFocus(student.id, 8))} placeholder="-" maxLength={4} autoComplete="off" aria-labelledby="th-recup-escrita" />
                                  </td>

                                  <td className="note-cell">
                                    <BoundInput type="text" className="grade-input" id={`recup-oral-${student.id}`} name={`recup-oral-${student.id}`} value={(rec?.oral ?? '').toString().replace('.', ',')} onInput={A((e) => c.onRecoveryOralChange(student.id, e))} onKeyDown={A((e) => c.handleKeydown(e))} onFocus={A(() => c.onCellFocus(student.id, 8))} placeholder="-" maxLength={4} autoComplete="off" aria-labelledby="th-recup-oral" />
                                  </td>

                                  <td className="calc-cell">{c.getNotaRecup(student.id)}</td>

                                  <td className="action-cell">
                                    {(c.needsRecovery(student.id) || c.hasRecoveryPlan(student.id, c.selectedPeriod)) && (
                                      <button className={cx('study-plan-btn', c.hasRecoveryPlan(student.id, c.selectedPeriod) && 'has-plan')} onClick={A(() => c.openStudyPlanModal(student))} title="Generar Plan de Estudio">📚</button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {c.students.length === 0 && (
                    <div className="no-students-message">
                      <div className="no-students-content">
                        <h3>No hay estudiantes en este salón</h3>
                        <p>El grado {c.selectedGrade} - {c.selectedClassroom} no tiene estudiantes registrados.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {c.showStudyPlanModal && (
        <Overlay className="fullscreen-modal-overlay" onClick={A(() => c.closeStudyPlanModal())}>
          <div className="fullscreen-modal-content spm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="spm-title">
            <header className="spm-header">
              <div className="spm-header-icon" aria-hidden="true">📚</div>
              <div className="spm-header-text">
                <h2 id="spm-title">Plan de Estudio</h2>
                <span>Plan personalizado generado con IA</span>
              </div>
              <button type="button" className="spm-close" aria-label="Cerrar" onClick={A(() => c.closeStudyPlanModal())}>×</button>
            </header>

            <div className="spm-body">
              {c.selectedStudentForPlan && (
                <section className="spm-student">
                  <div className="spm-avatar" aria-hidden="true">{(c.selectedStudentForPlan.name || '').charAt(0)}{(c.selectedStudentForPlan.surname || '').charAt(0)}</div>
                  <div className="spm-student-main">
                    <h3>{c.selectedStudentForPlan.surname} {c.selectedStudentForPlan.name}</h3>
                    <p>{c.selectedGrade} <span className="spm-dot">•</span> Período {c.selectedPeriod}</p>
                  </div>
                  <div className="spm-score">
                    <span className="spm-score-label">Nota actual</span>
                    <span className={cx('spm-score-badge', c.getFinalColor(c.selectedStudentForPlan.id))}>{c.getFinalWithRecovery(c.selectedStudentForPlan.id)}</span>
                  </div>
                </section>
              )}

              {!c.planGenerated && (
                <div className="spm-form">
                  <section className="spm-info">
                    <span className="spm-info-icon" aria-hidden="true">✨</span>
                    <div>
                      <strong>Plan profesional completo</strong>
                      <p>Incluye objetivo, cronograma de un solo día (DÍA 1), recursos reales, ejercicios prácticos, consejos y evaluación final. No se interrumpe a la mitad.</p>
                    </div>
                  </section>

                  <section className="spm-card">
                    <label className="spm-label" htmlFor="topics"><span aria-hidden="true">📝</span> Temas que debe estudiar el estudiante</label>
                    <textarea id="topics" name="topics" className="spm-textarea" value={c.studyPlanTopics} onChange={A((e) => { c.studyPlanTopics = e.target.value; })} placeholder="Ej: Álgebra básico, ecuaciones de primer grado, operaciones con fracciones..." rows={5} autoComplete="off" />
                  </section>

                  <section className="spm-card">
                    <input type="file" id="topicImage" name="topicImage" className="spm-file" accept="image/*" onChange={A((e) => c.onImageSelected(e))} multiple autoComplete="off" />
                    <label htmlFor="topicImage" className="spm-drop">
                      <span className="spm-drop-icon" aria-hidden="true">📷</span>
                      <span className="spm-drop-text">
                        <strong>Adjuntar imagen <em>(opcional)</em></strong>
                        <small>Fotos del cuaderno, guía o evaluación para que la IA se base en ellas</small>
                      </span>
                      <span className="spm-drop-action">Elegir</span>
                    </label>
                    {c.uploadedImages.length > 0 && (
                      <div className="spm-thumbs">
                        {c.uploadedImages.map((img, i) => (
                          <div key={i} className="spm-thumb">
                            <img src={img.preview} alt="Imagen adjunta" />
                            <button type="button" className="spm-thumb-x" aria-label="Quitar imagen" onClick={A(() => c.removeImage(i))}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <button type="button" className={cx('spm-generate', c.isGeneratingPlan && 'is-generating')} onClick={A(() => c.generateStudyPlan())} disabled={!c.studyPlanTopics.trim() || c.isGeneratingPlan}>
                    {c.isGeneratingPlan ? (
                      <>
                        <span className="btn-progress-bar"><span className="btn-progress-fill" style={{ width: `${c.progressPercent}%` }} /></span>
                        <span className="btn-progress-text">Generando plan… {Math.round(c.progressPercent)}%</span>
                      </>
                    ) : (<><span aria-hidden="true">🤖</span> Generar plan con IA</>)}
                  </button>
                  {!c.studyPlanTopics.trim() && !c.isGeneratingPlan && <p className="spm-hint">Escribe al menos un tema para poder generar el plan.</p>}
                </div>
              )}

              {c.studyPlanContent && !c.isGeneratingPlan && (
                <div className={cx('plan-content-fullscreen', c.planGenerated && 'fade-in')} id="study-plan-content">
                  <h3>Plan de Estudio</h3>
                  <div className="plan-text" dangerouslySetInnerHTML={{ __html: c.studyPlanContentSafe || '' }} />
                </div>
              )}
            </div>

            {c.studyPlanContent && c.planGenerated && (
              <footer className="spm-footer">
                <button type="button" className="spm-btn spm-btn-ghost" onClick={A(() => c.printStudyPlan())}>🖨️ Imprimir plan</button>
                {c.planSaved
                  ? <button type="button" className="spm-btn spm-btn-saved" onClick={A(() => c.closeStudyPlanModal())}>✓ Guardado — cerrar</button>
                  : <button type="button" className="spm-btn spm-btn-primary" onClick={A(() => c.savePlan())}>💾 Guardar plan</button>}
              </footer>
            )}
          </div>
        </Overlay>
      )}
    </div>
  );
}

function FragmentKey({ children }) { return <>{children}</>; }