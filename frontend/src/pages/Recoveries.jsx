import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/pages/recoveries.css';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDialog } from '../context/UiContext.jsx';
import { bus } from '../services/events.js';
import { renderMath } from '../utils/math.js';
import Overlay from '../components/Overlay.jsx';

const ALL_GRADES = ['Grado 1º', 'Grado 2º', 'Grado 3º', 'Grado 4º', 'Grado 5º', 'Grado 6º', 'Grado 7º', 'Grado 8º', 'Grado 9º', 'Grado 10º', 'Grado 11º'];
const CLASSROOMS = ['Salon A', 'Salon B'];
const parseGradeLabel = (g) => { const m = g.match(/(\d+)/); return m ? parseInt(m[1], 10) : null; };
const gradesInRange = (min, max) => ALL_GRADES.filter((g) => { const n = parseGradeLabel(g); return n !== null && n >= min && n <= max; });
const arraysEqual = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
const bySurnameEs = (a, b) => (a.surname || '').localeCompare(b.surname || '');

function calculateFinalGrade(grades) {
  const actGrades = []; let evalGrade = null; let autoEval = null; let promParc = null; let nFinal = null;
  for (const g of grades) {
    const name = g.gradeName?.toLowerCase() || '';
    if (g.isEvaluation) evalGrade = g.gradeValue;
    else if (name.includes('nfinal') || name.includes('n.final')) nFinal = g.gradeValue;
    else if (name.includes('act') && !name.includes('auto') && !name.includes('prom')) { if (g.gradeValue !== null) actGrades.push(g.gradeValue); }
    else if (name.includes('auto')) autoEval = g.gradeValue;
    else if (name.includes('prom')) promParc = g.gradeValue;
  }
  if (nFinal !== null) return nFinal;
  if (autoEval !== null) actGrades.push(autoEval);
  if (promParc !== null) actGrades.push(promParc);
  let p80 = 0;
  if (actGrades.length > 0) p80 = (actGrades.reduce((a, b) => a + b, 0) / actGrades.length) * 0.8;
  const p20 = evalGrade !== null ? evalGrade * 0.2 : 0;
  return p80 + p20;
}

function showPeriodToast() {
  document.querySelector('.period-change-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'period-change-toast';
  toast.innerHTML = '<span class="toast-icon">🔔</span> Los períodos se han actualizado';
  toast.style.cssText = 'position:fixed;top:80px;right:20px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;padding:12px 24px;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.2);z-index:10000;animation:slideIn 0.2s ease-out;font-family:Arial,sans-serif;font-size:14px;';
  const style = document.createElement('style');
  style.textContent = '@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}';
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'slideOut 0.2s ease-in forwards'; setTimeout(() => { toast.remove(); style.remove(); }, 200); }, 500);
}

function printHtml(html) {
  const doc = `<!DOCTYPE html><html><head><title>Plan de Recuperación</title><style>
    body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
    h1, h2, h3 { color: #2e1065; }
    h2 { border-bottom: 2px solid #7c3aed; padding-bottom: 8px; }
    h3 { color: #6d28d9; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    table th { background: #7c3aed; color: white; padding: 12px; text-align: left; border: 1px solid #ddd; }
    table td { padding: 10px; border: 1px solid #ddd; }
    table tr:nth-child(even) td { background: #f8f8fa; }
    ul, ol { margin: 10px 0 15px 20px; } li { margin: 6px 0; }
    strong { color: #6d28d9; } a { color: #e74c3c; text-decoration: none; }
    @page { margin: 10mm; size: A4; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  </style></head><body>${html}</body></html>`;
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', border: 'none', zIndex: '-1' });
  document.body.appendChild(iframe);
  const go = () => {
    if (!iframe.contentDocument) return;
    iframe.contentDocument.open(); iframe.contentDocument.write(doc); iframe.contentDocument.close();
    iframe.onload = null;
    setTimeout(() => {
      try { iframe.contentWindow?.print(); } catch (e) { console.error('Print error:', e); }
      finally { setTimeout(() => iframe.parentNode?.removeChild(iframe), 1000); }
    }, 250);
  };
  if (iframe.contentDocument?.readyState === 'complete') go(); else iframe.onload = go;
}

/** Recuperaciones: estudiantes con baja nota y su plan de estudio (recoveries del original). */
export default function Recoveries() {
  const { user } = useAuth();
  const dialog = useDialog();
  const roleName = user?.role?.name || user?.role;
  const isTeacher = roleName === 'TEACHER';
  const teacherId = isTeacher && user?.id ? Number(user.id) : null;

  const [grades, setGrades] = useState([...ALL_GRADES]);
  const [teacherGradeRange, setTeacherGradeRange] = useState(null);
  const [hasTeacherGradeRange, setHasTeacherGradeRange] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(1);
  const [availablePeriods, setAvailablePeriods] = useState([1]);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isFadingIn, setIsFadingIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [studentsWithRecovery, setStudentsWithRecovery] = useState([]);
  const [allRecoveryPlans, setAllRecoveryPlans] = useState([]);
  const [minPassingGrade, setMinPassingGrade] = useState(3.5);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const planRef = useRef(null);

  // Refs con el estado más reciente para los callbacks asíncronos (el original usa propiedades mutables).
  const st = useRef({});
  st.current = { selectedGrade, selectedClassroom, selectedPeriod, selectedSubject, availablePeriods, allRecoveryPlans, minPassingGrade, teacherSubjects, grades, teacherGradeRange };

  const applyFilters = useCallback((plans) => {
    setStudentsWithRecovery(plans.map((p) => ({
      student: { id: p.studentId, name: (p.studentName || '').split(' ')[1] || '', surname: (p.studentName || '').split(' ')[0] || '', grade: p.grade, classGroup: p.classGroup },
      recoveryPlan: p, finalGrade: 0, period: p.period,
    })));
  }, []);

  const loadGradesForStudents = useCallback(async (students, period, plans) => {
    const s = st.current;
    try {
      const query = { grade: s.selectedGrade, classroom: s.selectedClassroom, period };
      if (teacherId) query.teacherId = teacherId;
      if (s.selectedSubject) query.subjectName = s.selectedSubject;
      const response = await api.get('/grades/classroom', query);
      const gradesData = response.grades || [];
      setStudentsWithRecovery(students.map((student) => {
        const finalGrade = calculateFinalGrade(gradesData.filter((g) => g.student?.id === student.id));
        const recoveryPlan = plans.find((p) => p.studentId === student.id && p.period === period) || null;
        return { student, recoveryPlan, finalGrade, period };
      }).filter((x) => (x.finalGrade > 0 && x.finalGrade < s.minPassingGrade) || x.recoveryPlan !== null));
      setIsLoading(false);
    } catch { setStudentsWithRecovery([]); setIsLoading(false); }
  }, [teacherId]);

  const fetchStudents = useCallback(async (grade, classroom) => {
    const list = await api.get(`/students/grade/${encodeURIComponent(grade)}/class/${encodeURIComponent(classroom)}`);
    return [...list].sort(bySurnameEs);
  }, []);

  const loadStudentsWithRecovery = useCallback(async (period) => {
    const s = st.current;
    const p = period ?? s.selectedPeriod;
    if (!s.selectedGrade || !s.selectedClassroom || !p) { applyFilters(s.allRecoveryPlans); return; }
    try { loadGradesForStudents(await fetchStudents(s.selectedGrade, s.selectedClassroom), p, s.allRecoveryPlans); }
    catch { setStudentsWithRecovery([]); setIsLoading(false); }
  }, [applyFilters, fetchStudents, loadGradesForStudents]);

  const loadUnlockedPeriods = useCallback(async () => {
    try {
      const periods = await api.get('/periods');
      const unlocked = periods.filter((p) => p.isUnlocked).map((p) => p.periodNumber);
      const next = unlocked.length > 0 ? unlocked : [1];
      setAvailablePeriods(next); st.current.availablePeriods = next;
      try { localStorage.setItem('unlockedPeriods', JSON.stringify(unlocked.filter((p) => p > 1))); } catch { /* */ }
      return next;
    } catch {
      let next = [1];
      try { const stored = localStorage.getItem('unlockedPeriods'); if (stored) next = [1, ...JSON.parse(stored).filter((p) => p > 1)]; } catch { /* */ }
      setAvailablePeriods(next); st.current.availablePeriods = next;
      return next;
    }
  }, []);

  const loadAllRecoveryPlans = useCallback(async () => {
    try {
      const plans = await api.get('/grades/recovery-plans', teacherId ? { teacherId } : undefined);
      setAllRecoveryPlans(plans); st.current.allRecoveryPlans = plans;
      applyFilters(plans);
    } catch { setAllRecoveryPlans([]); }
  }, [applyFilters, teacherId]);

  const applyGradeFilterForSubject = useCallback((subjectName, animate, subjects) => {
    const list = subjects ?? st.current.teacherSubjects;
    const subject = list.find((x) => x.name === subjectName);
    let newGrades = []; let range = null; let has;
    if (subject && subject.gradeMin != null && subject.gradeMax != null) {
      newGrades = gradesInRange(subject.gradeMin, subject.gradeMax); range = { min: subject.gradeMin, max: subject.gradeMax }; has = true;
    } else {
      const withRange = list.filter((x) => x.gradeMin != null && x.gradeMax != null);
      if (withRange.length > 0) {
        const min = Math.min(...withRange.map((x) => x.gradeMin)); const max = Math.max(...withRange.map((x) => x.gradeMax));
        range = { min, max }; newGrades = gradesInRange(min, max); has = true;
      } else { range = null; newGrades = [...ALL_GRADES]; has = false; }
    }
    setTeacherGradeRange(range); setHasTeacherGradeRange(has);
    if (st.current.selectedGrade && !newGrades.includes(st.current.selectedGrade)) { setSelectedGrade(null); setSelectedClassroom(null); }
    if (!animate) { setGrades(newGrades); return; }
    if (arraysEqual(st.current.grades, newGrades) && st.current.grades.join() === newGrades.join()) return;
    setIsFadingOut(true); setIsFadingIn(false);
    setTimeout(() => {
      setGrades(newGrades); setIsFadingOut(false); setIsFadingIn(true);
      setTimeout(() => setIsFadingIn(false), 300);
    }, 300);
  }, []);

  // ngOnInit
  useEffect(() => {
    // loadTeacherGradeRange (localStorage)
    try {
      const json = localStorage.getItem('selectedTeacherGradeRange');
      if (json) {
        const p = JSON.parse(json);
        if (p && typeof p.min === 'number' && typeof p.max === 'number' && p.min > 0 && p.max >= p.min) {
          setTeacherGradeRange({ min: p.min, max: p.max }); setGrades(gradesInRange(p.min, p.max));
        }
      }
    } catch { /* */ }

    // loadTeacherSubjectsForGradeRange
    let t1;
    if (!user || !roleName || roleName !== 'TEACHER' || !user.id) setHasTeacherGradeRange(false);
    else {
      api.get(`/subjects/teacher/${user.id}`).then((subjects) => {
        setTeacherSubjects(subjects); st.current.teacherSubjects = subjects;
        const sel = subjects.find((x) => x.gradeMin != null && x.gradeMax != null)?.name || subjects[0]?.name || null;
        setSelectedSubject(sel); st.current.selectedSubject = sel;
        t1 = setTimeout(() => applyGradeFilterForSubject(sel || '', false, subjects), 600);
      }).catch(() => {
        t1 = setTimeout(() => { setTeacherGradeRange(null); setGrades([...ALL_GRADES]); setHasTeacherGradeRange(false); }, 600);
      });
    }

    loadUnlockedPeriods();
    api.get('/school-year/min-passing-grade').then((r) => { if (typeof r.minPassingGrade === 'number') setMinPassingGrade(r.minPassingGrade); }).catch(() => { /* 3.5 */ });
    loadAllRecoveryPlans();

    const off = bus.on('periods:changed', (periods) => {
      const unlocked = (periods || []).filter((p) => p.isUnlocked).map((p) => p.periodNumber);
      const next = unlocked.length > 0 ? unlocked : [1];
      if (!arraysEqual(st.current.availablePeriods, next)) {
        setAvailablePeriods(next); st.current.availablePeriods = next;
        showPeriodToast();
        if (!next.includes(st.current.selectedPeriod)) {
          const p = Math.max(...next); setSelectedPeriod(p); st.current.selectedPeriod = p; loadStudentsWithRecovery(p);
        }
      }
    });
    // Sondeo cada 10 s de los períodos para actualizar en tiempo real
    const iv = setInterval(async () => {
      const previous = [...st.current.availablePeriods];
      try {
        const periods = await api.get('/periods');
        const unlocked = periods.filter((p) => p.isUnlocked).map((p) => p.periodNumber);
        const next = unlocked.length > 0 ? unlocked : [1];
        if (!arraysEqual(previous, next)) {
          setAvailablePeriods(next); st.current.availablePeriods = next; showPeriodToast();
          if (!next.includes(st.current.selectedPeriod)) { const p = Math.max(...next); setSelectedPeriod(p); st.current.selectedPeriod = p; loadStudentsWithRecovery(p); }
        }
      } catch { /* */ }
    }, 10000);
    return () => { off(); clearInterval(iv); clearTimeout(t1); };
  }, []); // eslint-disable-line

  const selectGrade = async (grade, classroom) => {
    setSelectedGrade(grade); setSelectedClassroom(classroom);
    st.current.selectedGrade = grade; st.current.selectedClassroom = classroom;
    const periods = await loadUnlockedPeriods();
    const p = Math.max(...periods);
    setSelectedPeriod(p); st.current.selectedPeriod = p;
    setIsLoading(true);
    setTimeout(async () => {
      try { await fetchStudents(grade, classroom); loadStudentsWithRecovery(p); }
      catch { setIsLoading(false); }
    }, 800);
  };

  const onSubjectChange = (name) => {
    setSelectedSubject(name); st.current.selectedSubject = name;
    applyGradeFilterForSubject(name, true);
    if (st.current.selectedGrade && st.current.selectedClassroom) loadStudentsWithRecovery();
  };

  const onPeriodManualChange = (value) => {
    const newPeriod = parseInt(value.toString(), 10);
    if (!st.current.availablePeriods.includes(newPeriod)) {
      dialog.alert('Este período aún no está desbloqueado. Ve a Configuración para desbloquearlo.', 'Período bloqueado');
      return;
    }
    const previous = st.current.selectedPeriod;
    if (newPeriod > previous) {
      const last = Math.max(...st.current.availablePeriods);
      setSelectedPeriod(last); st.current.selectedPeriod = last; setStudentsWithRecovery([]); loadStudentsWithRecovery(last);
    } else { setSelectedPeriod(newPeriod); st.current.selectedPeriod = newPeriod; loadStudentsWithRecovery(newPeriod); }
  };

  const viewPlan = (plan) => { setSelectedPlan(plan); setShowPlanModal(true); };
  const closePlanModal = () => { setShowPlanModal(false); setSelectedPlan(null); };
  useEffect(() => {
    if (!showPlanModal) return;
    const t = setTimeout(() => renderMath(planRef.current), 100);
    return () => clearTimeout(t);
  }, [showPlanModal, selectedPlan]);

  const printPlan = () => {
    const el = planRef.current;
    if (!el) { dialog.alert('No hay plan de recuperación para imprimir', 'Nada que imprimir'); return; }
    if (!el.innerHTML.trim()) { dialog.alert('El contenido del plan está vacío', 'Nada que imprimir'); return; }
    printHtml(el.innerHTML);
  };

  const getGradeColor = (g) => (g >= 4.0 ? 'grade-green' : g >= minPassingGrade ? 'grade-yellow' : 'grade-red');
  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.split(' ');
    return ((parts.length > 1 ? parts[1].charAt(0) : '') + (parts.length > 0 ? parts[0].charAt(0) : '')).toUpperCase();
  };
  const items = selectedGrade && selectedClassroom ? studentsWithRecovery : [];
  const planHtml = useMemo(() => ({ __html: selectedPlan ? (selectedPlan.planContent || selectedPlan.day1Content || '') : '' }), [selectedPlan]);

  return (
    <div className="pg-recoveries">
      <div className="recoveries-container">
        <div className="page-header"><h2>Recuperaciones</h2></div>

        {isTeacher && hasTeacherGradeRange === false ? (
          <div className="fullscreen-warning">
            <span className="material-icons">warning</span>
            <span>No tienes materias asignadas. Por favor espere o llame al administrador.</span>
          </div>
        ) : isTeacher && hasTeacherGradeRange === null ? (
          <div className="fullscreen-loading">
            <div className="spinner" />
            <span style={{ color: '#332c50', fontSize: '1.1rem', fontWeight: 600 }}>Verificando materias asignadas...</span>
          </div>
        ) : (
          <>
            <div className="grades-sidebar">
              {teacherGradeRange && <div className="grade-range-indicator">Grados {teacherGradeRange.min}° - {teacherGradeRange.max}°</div>}
              {teacherSubjects && teacherSubjects.length > 1 && (
                <div className="subject-selector">
                  {teacherSubjects.map((subject) => (
                    <button key={subject.id} className={`subject-btn${selectedSubject === subject.name ? ' selected' : ''}`} onClick={() => onSubjectChange(subject.name)}>{subject.name}</button>
                  ))}
                </div>
              )}
              <div className={`grades-row${isFadingOut ? ' fade-out' : ''}${isFadingIn ? ' fade-in' : ''}`}>
                {grades.map((grade) => (
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

            <div className="right-content">
              {selectedGrade && selectedClassroom && (
                <div className="period-selector">
                  <label htmlFor="period-select">Período:</label>
                  <select id="period-select" name="period" value={selectedPeriod} onChange={(e) => onPeriodManualChange(e.target.value)}>
                    {availablePeriods.map((p) => <option key={p} value={p}>Período {p}</option>)}
                  </select>
                </div>
              )}

              {isLoading && <div className="loading-indicator"><div className="spinner" /><p>Cargando...</p></div>}

              {selectedGrade && selectedClassroom && !isLoading && (
                <div className="recoveries-list">
                  {items.length > 0 ? (
                    <div className="recovery-cards">
                      {items.map((item, i) => (
                        <div key={i} className={`recovery-card${item.recoveryPlan ? ' has-plan' : ''}`}>
                          <div className="card-header">
                            <div className="student-avatar">{getInitials(item.student.surname + ' ' + item.student.name)}</div>
                            <div className="student-info">
                              <h4>{item.student.surname} {item.student.name}</h4>
                              <p>{item.student.grade} - {item.student.classGroup}</p>
                            </div>
                            <div className="period-badge">P{item.period}</div>
                          </div>
                          <div className="card-body">
                            {item.finalGrade > 0 && (
                              <div className="grade-info">
                                <span className="label">Nota:</span>
                                <span className={`grade-value ${getGradeColor(item.finalGrade)}`}>{item.finalGrade.toFixed(1).replace('.', ',')}</span>
                              </div>
                            )}
                            {item.recoveryPlan ? (
                              <div className="plan-preview">
                                <div className="plan-days"><div className="day-badge day1">Día 1</div><div className="day-badge day2">Día 2</div></div>
                                <p className="plan-topics">{item.recoveryPlan.topics}</p>
                              </div>
                            ) : (
                              <div className="no-plan"><p>Sin plan de recuperación</p></div>
                            )}
                          </div>
                          <div className="card-footer">
                            {item.recoveryPlan && <button className="view-plan-btn" onClick={() => viewPlan(item.recoveryPlan)}>Ver Plan</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-students-message">
                      <div className="no-students-content">
                        <h3>No hay estudiantes reprobados</h3>
                        <p>El grado {selectedGrade} - {selectedClassroom} no tiene estudiantes con baja nota en este período.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showPlanModal && selectedPlan && (
        <Overlay className="fullscreen-modal-overlay" onClick={closePlanModal}>
          <div className="fullscreen-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📚 Plan de Estudio</h2>
              <button className="close-btn" onClick={closePlanModal}>✕</button>
            </div>
            <div className="modal-body-fullscreen">
              <div className="plan-meta-top">
                <p><strong>Estudiante:</strong> {selectedPlan.studentName}</p>
                <p><strong>Grado:</strong> {selectedPlan.grade} | <strong>Grupo:</strong> {selectedPlan.classGroup} | <strong>Período:</strong> {selectedPlan.period}</p>
              </div>
              <div ref={planRef} className="plan-content-fullscreen plan-text" id="recovery-plan-content" dangerouslySetInnerHTML={planHtml} />
            </div>
            <div className="modal-footer">
              <button className="print-btn" onClick={printPlan}>🖨️ Imprimir</button>
              <button className="close-modal-btn" onClick={closePlanModal}>Cerrar</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}