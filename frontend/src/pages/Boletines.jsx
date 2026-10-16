import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/pages/boletines.css';
import { api, imageUrl } from '../api/client.js';
import { useDialog } from '../context/UiContext.jsx';
import { bus } from '../services/events.js';
import { generation, useGenerationJobs } from '../services/generation.js';
import Overlay from '../components/Overlay.jsx';

/* Port de boletines.ts: formulario de 3 pasos + generación masiva (job) + resultados. */

/** Materia virtual que el backend trata como una "materia" más en el paso 1. */
const VALORACION_ACUDIENTE_SUBJECT = 'Valoracion Acudiente';
const GRADES = ['Grado 1º', 'Grado 2º', 'Grado 3º', 'Grado 4º', 'Grado 5º', 'Grado 6º', 'Grado 7º', 'Grado 8º', 'Grado 9º', 'Grado 10º', 'Grado 11º'];
const CLASSROOMS = ['Salon A', 'Salon B'];
const EMPTY_IND = { ih: undefined, fa: undefined, faa: undefined };

const isValoracionAcudiente = (subject) => {
  if (!subject) return false;
  return subject.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === 'valoracion acudiente';
};

// Acepta coma o punto como separador decimal y deja la nota entre 0 y 5.
function normalizeDecimal(value) {
  if (value == null || value === '') return null;
  const str = String(value).trim().replace(',', '.');
  const n = parseFloat(str);
  if (isNaN(n)) return null;
  const clamped = Math.max(0, Math.min(5, n));
  return Math.round(clamped * 100) / 100;
}

/** Escala valorativa institucional: E 4,6–5,0 / S 4,0–4,5 / B 3,5–3,9 / A 3,0–3,4 / I 1,0–2,9. */
function escalaValorativaLetra(nota) {
  if (nota == null || nota <= 0) return '';
  if (nota >= 4.6) return 'E';
  if (nota >= 4.0) return 'S';
  if (nota >= 3.5) return 'B';
  if (nota >= 3.0) return 'A';
  if (nota >= 1.0) return 'I';
  return '';
}

const presetPeriodLabel = (period) => {
  const nombres = ['Primer', 'Segundo', 'Tercer', 'Cuarto'];
  return `${nombres[period - 1] || ('Período ' + period)} periodo`;
};

const numOrUndef = (e) => (e.target.value === '' ? undefined : Number(e.target.value));

/**
 * Input de nota (texto decimal). Equivale al [value] + (input) del original:
 * cualquier "." tecleado se convierte al instante en ",", conservando el cursor,
 * y la nota se normaliza (0–5) hacia el estado del componente padre.
 */
function GradeInput({ value, onValue }) {
  const [text, setText] = useState(value ?? '');
  const last = useRef(value ?? null);
  useEffect(() => {
    if ((value ?? null) !== last.current) {
      last.current = value ?? null;
      setText(value ?? '');
    }
  }, [value]);
  const onInput = (e) => {
    const input = e.target;
    const cursor = input.selectionStart ?? input.value.length;
    const newValue = input.value.replace(/\./g, ',');
    setText(newValue);
    if (newValue !== input.value) {
      requestAnimationFrame(() => { try { input.setSelectionRange(cursor, cursor); } catch { /* sin foco */ } });
    }
    last.current = normalizeDecimal(newValue) ?? 0;
    onValue(newValue);
  };
  return <input type="text" inputMode="decimal" value={text} onChange={onInput} className="indicator-input-small" maxLength={4} placeholder="0,0" />;
}

export default function Boletines() {
  const dialog = useDialog();
  const jobs = useGenerationJobs();

  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState(1);

  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [signatures, setSignatures] = useState([]);

  const [studentIndicators, setStudentIndicators] = useState({});
  const [groupObjectives, setGroupObjectives] = useState({});
  const [studentCompSocialRating, setStudentCompSocialRating] = useState({});
  const [studentCompSocialIndicators, setStudentCompSocialIndicators] = useState({});
  const [compSocialObjetivo, setCompSocialObjetivo] = useState('');
  const [studentValoracionAcudiente, setStudentValoracionAcudiente] = useState({});

  const [selectedDirectorSignature, setSelectedDirectorSignature] = useState(undefined);
  const [showSignaturePanel, setShowSignaturePanel] = useState(false);

  const [showFormView, setShowFormView] = useState(true);
  const [fadeOutForm, setFadeOutForm] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGeneratingIndex, setCurrentGeneratingIndex] = useState(-1);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [watchJobId, setWatchJobId] = useState(null);
  const [generatingTotal, setGeneratingTotal] = useState(0);
  const [generatingCompleted, setGeneratingCompleted] = useState(0);

  const [presetPeriods, setPresetPeriods] = useState([]);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [lostAreasPreview, setLostAreasPreview] = useState([]);

  const [currentStep, setCurrentStep] = useState('subjectIndicators');
  const [currentSubjectIndex, setCurrentSubjectIndex] = useState(0);

  // Espejo del estado actual para los callbacks asíncronos (equivale a `this.` en el original).
  const S = useRef({});
  S.current = { selectedGrade, selectedClassroom, selectedPeriod, students, subjects, studentIndicators, groupObjectives, studentCompSocialRating, studentCompSocialIndicators, compSocialObjetivo, studentValoracionAcudiente, selectedDirectorSignature, currentJobId };

  /* ───────── Generación: progreso / resultados ───────── */
  const applyJobProgress = (job) => {
    const total = job.total || S.current.students.length;
    setGeneratingTotal(total);
    setGeneratingCompleted(job.completed);
    setGenerationProgress(job.status === 'DONE' ? 100 : total > 0 ? Math.round((job.completed / total) * 100) : 0);
    setCurrentGeneratingIndex(Math.min(job.completed, Math.max(S.current.students.length - 1, 0)));
  };

  const finishJob = (job) => {
    setGeneratedFiles((job.files || []).map((f) => ({ studentId: f.studentId, studentName: f.studentName, fileName: f.fileName })));
    if (job.errors && job.errors.length > 0) {
      console.error('Errores durante la generación:', job.errors);
      dialog.alert('Algunos boletines no se pudieron generar:\n' + job.errors.join('\n'), 'Errores en la generación');
    }
    setIsGenerating(false);
    setCurrentGeneratingIndex(-1);
  };

  /** Cambia a la vista de progreso/resultados del job indicado. */
  const showJob = useCallback((jobId) => {
    const job = generation.currentJobs.find((j) => j.jobId === jobId);
    if (!job) return;
    setCurrentJobId(job.jobId);
    setShowFormView(false);
    setFadeOutForm(false);
    setShowSignaturePanel(false);
    setIsGenerating(job.status === 'RUNNING');
    setGeneratedFiles([]);
    applyJobProgress(job);
    if (job.status === 'RUNNING') setWatchJobId(job.jobId);
    else finishJob(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sigue el progreso de un job reutilizando el sondeo global (jobs$ del original).
  useEffect(() => {
    if (!watchJobId) return;
    const job = jobs.find((j) => j.jobId === watchJobId);
    if (!job) return;
    applyJobProgress(job);
    if (job.status === 'DONE' || job.status === 'ERROR') {
      finishJob(job);
      setWatchJobId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, watchJobId]);

  /* ───────── Carga de datos ───────── */
  const loadPresetPeriods = (grade, classroom) => {
    setPresetPeriods([]);
    setShowPresetMenu(false);
    if (!grade || !classroom) return;
    api.get('/boletines/objetivos-predeterminados', { grade, classroom }).then((list) => {
      // Evita aplicar una respuesta vieja si el usuario ya cambió de salón.
      if (grade !== S.current.selectedGrade || classroom !== S.current.selectedClassroom) return;
      setPresetPeriods((list || []).map((i) => i.period).sort((x, y) => x - y));
    }).catch(() => setPresetPeriods([]));
  };

  const initializeStudentIndicatorsForSubjects = (subjectList, studentList) => {
    setGroupObjectives((cur) => { const n = { ...cur }; subjectList.forEach((s) => { n[s] = ''; }); return n; });
    setStudentIndicators((cur) => {
      const n = { ...cur };
      subjectList.forEach((subject) => {
        studentList.forEach((st) => {
          n[st.id] = { ...(n[st.id] || {}) };
          if (!n[st.id][subject]) n[st.id][subject] = { ...EMPTY_IND };
        });
      });
      return n;
    });
  };

  const loadSubjects = (grade, classroom, studentList) => {
    if (!grade || !classroom) return;
    api.get('/boletines/materias-todas', { grade, classroom }).then((data) => {
      let list = data || [];
      // Anexamos la "materia virtual" Valoración Acudiente como si fuera una materia más.
      if (!list.includes(VALORACION_ACUDIENTE_SUBJECT)) list = [...list, VALORACION_ACUDIENTE_SUBJECT];
      setSubjects(list);
      initializeStudentIndicatorsForSubjects(list, studentList);
      setCurrentStep('subjectIndicators');
    }).catch(() => {
      const list = [VALORACION_ACUDIENTE_SUBJECT];
      setSubjects(list);
      initializeStudentIndicatorsForSubjects(list, studentList);
      setCurrentStep('subjectIndicators');
    });
  };

  const loadLostAreas = (grade, classroom, period, studentList) => {
    setLostAreasPreview([]);
    if (!grade || !classroom || studentList.length === 0) return;
    // Materias reprobadas (no promedio general del estudiante) del período que se está generando.
    api.get('/boletines/materias-perdidas', { grade, classroom, period }).then((data) => {
      setLostAreasPreview((data || []).map((item) => ({
        studentName: item.name || ('Estudiante ' + item.studentId),
        subjects: item.lostSubjects || [],
      })));
    }).catch(() => setLostAreasPreview([]));
  };

  const initializeData = () => {
    setStudentIndicators({});
    setGroupObjectives({});
    setStudentCompSocialRating({});
    setStudentCompSocialIndicators({});
    setStudentValoracionAcudiente({});
    setCompSocialObjetivo('');
  };

  const loadStudents = (grade, classroom, period) => {
    if (!grade || !classroom) return;
    api.get(`/students/grade/${encodeURIComponent(grade)}/class/${encodeURIComponent(classroom)}`).then((data) => {
      const list = [...(data || [])].sort((a, b) => (a.surname || '').localeCompare(b.surname || ''));
      setStudents(list);
      S.current.students = list;
      initializeData();
      loadSubjects(grade, classroom, list);
      loadPresetPeriods(grade, classroom);
      loadLostAreas(grade, classroom, period, list);
    }).catch(() => setStudents([]));
  };

  const loadSignatures = () => {
    api.get('/boletines/firmas').then((data) => setSignatures(data || [])).catch(() => setSignatures([]));
  };

  const loadUnlockedPeriod = () => {
    api.get('/periods').then((periods) => {
      const unlocked = (periods || []).filter((p) => p.isUnlocked).sort((a, b) => b.periodNumber - a.periodNumber);
      const p = unlocked.length > 0 ? unlocked[0].periodNumber : 1;
      setSelectedPeriod(p);
      S.current.selectedPeriod = p;
      loadStudents(S.current.selectedGrade, S.current.selectedClassroom, p);
    }).catch(() => {
      setSelectedPeriod(1);
      S.current.selectedPeriod = 1;
      loadStudents(S.current.selectedGrade, S.current.selectedClassroom, 1);
    });
  };

  useEffect(() => {
    loadUnlockedPeriod();
    loadSignatures();
    // Click en la notificación flotante: mostrar la vista donde SE ESTÁN generando los boletines.
    const pending = generation.consumeFocusJobId();
    if (pending) showJob(pending);
    // Si ya estamos en /boletines el componente no se recrea: escuchar el aviso.
    const off = bus.on('generation:focus', (jobId) => { generation.consumeFocusJobId(); showJob(jobId); });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────── Cambios de filtros ───────── */
  const resetForSelection = () => {
    setStudents([]);
    setSubjects([]);
    setStudentIndicators({});
    setGroupObjectives({});
    setStudentCompSocialRating({});
    setStudentCompSocialIndicators({});
    setStudentValoracionAcudiente({});
    setCompSocialObjetivo('');
    setLostAreasPreview([]);
    setCurrentStep('subjectIndicators');
    setCurrentSubjectIndex(0);
  };

  const onGradeChange = (grade) => {
    setSelectedGrade(grade);
    S.current.selectedGrade = grade;
    resetForSelection();
    loadStudents(grade, S.current.selectedClassroom, S.current.selectedPeriod);
  };

  const onClassroomChange = (classroom) => {
    setSelectedClassroom(classroom);
    S.current.selectedClassroom = classroom;
    resetForSelection();
    loadStudents(S.current.selectedGrade, classroom, S.current.selectedPeriod);
  };

  const loadPreviousPeriodData = (grade, classroom, period) => {
    if (!grade || !classroom || period <= 1) return;
    api.get(`/boletines/objetivos-predeterminados/${period - 1}`, { grade, classroom }).then((res) => {
      if (!res || !res.payload) return;
      try {
        const payload = JSON.parse(res.payload);
        // Se guardan como diccionarios { [studentId]: nota }, tal como los produce savePresetAfterGeneration().
        const compSocialDict = payload.studentCompSocialRating || {};
        const valAcudienteDict = payload.studentValoracionAcudiente || {};
        setStudentCompSocialRating((cur) => {
          const n = { ...cur };
          Object.keys(compSocialDict).forEach((sid) => {
            const id = Number(sid); const val = Number(compSocialDict[sid]);
            if (!isNaN(val) && val > 0 && !n[id]) n[id] = val;
          });
          return n;
        });
        setStudentValoracionAcudiente((cur) => {
          const n = { ...cur };
          Object.keys(valAcudienteDict).forEach((sid) => {
            const id = Number(sid); const val = Number(valAcudienteDict[sid]);
            if (!isNaN(val) && val > 0 && !n[id]) n[id] = val;
          });
          return n;
        });
      } catch { /* ignore parse errors */ }
    }).catch(() => {});
  };

  const onPeriodChange = (period) => {
    setSelectedPeriod(period);
    S.current.selectedPeriod = period;
    setSubjects([]);
    setGroupObjectives({});
    setStudentCompSocialRating({});
    setStudentCompSocialIndicators({});
    setStudentValoracionAcudiente({});
    setCompSocialObjetivo('');
    setCurrentStep('subjectIndicators');
    loadSubjects(S.current.selectedGrade, S.current.selectedClassroom, S.current.students);
    loadPreviousPeriodData(S.current.selectedGrade, S.current.selectedClassroom, period);
  };

  /* ───────── Objetivos predeterminados ───────── */
  const applyPreset = (period) => {
    setShowPresetMenu(false);
    const { selectedGrade: grade, selectedClassroom: classroom } = S.current;
    if (!grade || !classroom) return;
    api.get(`/boletines/objetivos-predeterminados/${period}`, { grade, classroom }).then((res) => {
      try {
        const payload = JSON.parse(res.payload || '{}');
        const objectives = payload.objectives || {};
        let aplicados = 0;
        const nuevos = {};
        for (const subject of S.current.subjects) {
          if (objectives[subject] != null && String(objectives[subject]).trim() !== '') {
            nuevos[subject] = objectives[subject];
            aplicados++;
          }
        }
        setGroupObjectives((cur) => ({ ...cur, ...nuevos }));
        if (payload.compSocialObjetivo) {
          setCompSocialObjetivo(payload.compSocialObjetivo);
          aplicados++;
        }
        if (aplicados === 0) {
          dialog.alert('Ese período no tiene objetivos que coincidan con las materias actuales.', 'Objetivos predeterminados');
        }
      } catch {
        dialog.alert('No se pudieron leer los objetivos guardados.', 'Error');
      }
    }).catch(() => dialog.alert('No se pudieron cargar los objetivos predeterminados.', 'Error'));
  };

  /** Guarda los objetivos escritos a mano justo cuando se inicia la generación. */
  const savePresetAfterGeneration = () => {
    const s = S.current;
    const objectives = {};
    for (const subject of s.subjects) {
      const text = (s.groupObjectives[subject] || '').trim();
      if (text) objectives[subject] = text;
    }
    const payload = {
      objectives,
      compSocialObjetivo: s.compSocialObjetivo || '',
      studentCompSocialRating: s.studentCompSocialRating,
      studentValoracionAcudiente: s.studentValoracionAcudiente,
    };
    api.post('/boletines/objetivos-predeterminados', {
      grade: s.selectedGrade, classroom: s.selectedClassroom, period: s.selectedPeriod, payload: JSON.stringify(payload),
    }).then(() => loadPresetPeriods(s.selectedGrade, s.selectedClassroom))
      .catch((err) => console.error('No se pudieron guardar los objetivos predeterminados', err));
  };

  /* ───────── Pasos ───────── */
  const goToComportamiento = () => {
    setCurrentStep('comportamiento');
    setStudentCompSocialIndicators((cur) => {
      const n = { ...cur };
      students.forEach((st) => { if (!n[st.id]) n[st.id] = { ...EMPTY_IND }; });
      return n;
    });
    setStudentCompSocialRating((cur) => {
      const n = { ...cur };
      students.forEach((st) => { if (!n[st.id]) n[st.id] = 0; });
      return n;
    });
    setStudentValoracionAcudiente((cur) => {
      const n = { ...cur };
      students.forEach((st) => { if (!n[st.id]) n[st.id] = 0; });
      return n;
    });
  };

  const nextSubjectIndicators = () => {
    if (currentSubjectIndex < subjects.length - 1) setCurrentSubjectIndex(currentSubjectIndex + 1);
    else goToComportamiento();
  };
  const prevSubjectIndicators = () => { if (currentSubjectIndex > 0) setCurrentSubjectIndex(currentSubjectIndex - 1); };
  const goToFinal = () => setCurrentStep('final');

  const getStudentIndicator = (studentId, subject) => studentIndicators[studentId]?.[subject] || EMPTY_IND;
  const setStudentIndicator = (studentId, subject, field, value) => {
    setStudentIndicators((cur) => ({
      ...cur,
      [studentId]: { ...(cur[studentId] || {}), [subject]: { ...(cur[studentId]?.[subject] || EMPTY_IND), [field]: value ?? undefined } },
    }));
  };
  const getCompSocialIndicator = (studentId) => studentCompSocialIndicators[studentId] || EMPTY_IND;
  const setCompSocialIndicator = (studentId, field, value) => {
    setStudentCompSocialIndicators((cur) => ({ ...cur, [studentId]: { ...(cur[studentId] || EMPTY_IND), [field]: value ?? undefined } }));
  };
  const setCompSocialRating = (studentId, value) => {
    const n = normalizeDecimal(value);
    setStudentCompSocialRating((cur) => ({ ...cur, [studentId]: n ?? 0 }));
  };
  const setValoracionAcudiente = (studentId, value) => {
    const n = normalizeDecimal(value);
    setStudentValoracionAcudiente((cur) => ({ ...cur, [studentId]: n ?? 0 }));
  };

  /* ───────── Generación ───────── */
  const isValid = () => !!selectedGrade && !!selectedClassroom && students.length > 0;

  const startGeneration = async () => {
    if (!isValid()) return;
    setFadeOutForm(true);
    await new Promise((r) => setTimeout(r, 500));

    setShowFormView(false);
    setFadeOutForm(false);
    setIsGenerating(true);
    setGeneratedFiles([]);
    setCurrentGeneratingIndex(0);
    setGenerationProgress(0);
    setCurrentJobId(null);

    const s = S.current;
    const schoolYear = new Date().getFullYear().toString();

    // Payload de TODOS los estudiantes en un solo POST; el backend lo procesa como un job.
    const studentsPayload = s.students.map((student, i) => {
      const subjectsData = s.subjects.map((subject) => {
        const indicator = s.studentIndicators[student.id]?.[subject] || {};
        return {
          subjectName: subject,
          objetivoPeriodo: s.groupObjectives[subject] || '',
          ih: indicator.ih ?? 0,
          fa: indicator.fa ?? 0,
          faa: indicator.faa ?? 0,
        };
      });
      const cs = s.studentCompSocialIndicators[student.id];
      const compSocialIndicadores = cs ? `IH: ${cs.ih ?? 0}, FA: ${cs.fa ?? 0}, FAA: ${cs.faa ?? 0}` : '';
      const valoracionAcudiente = s.studentValoracionAcudiente[student.id] ?? 0;
      return {
        studentId: student.id,
        grade: s.selectedGrade,
        classroom: s.selectedClassroom,
        period: s.selectedPeriod,
        nLista: i + 1,
        schoolYear,
        studentSubjectIndicators: subjectsData,
        objetivoPeriodo: '',
        valoracionAcudiente,
        valoracionAcudienteNota: valoracionAcudiente,
        compSocial: s.studentCompSocialRating[student.id] ?? 0,
        compSocialIndicadores,
        compSocialObjetivo: s.compSocialObjetivo || '',
        compSocialIh: s.studentCompSocialIndicators[student.id]?.ih ?? 0,
        compSocialFa: s.studentCompSocialIndicators[student.id]?.fa ?? 0,
        compSocialFaa: s.studentCompSocialIndicators[student.id]?.faa ?? 0,
        directorSignature: s.selectedDirectorSignature,
        leftSignature: null,
      };
    });

    const body = { grade: s.selectedGrade, classroom: s.selectedClassroom, period: s.selectedPeriod, students: studentsPayload };

    try {
      const job = await api.post('/boletines/generaciones', body);
      // Inserta el job de inmediato (optimista) para que la notificación aparezca en cualquier pantalla.
      generation.upsertJobLocal(job);
      setCurrentJobId(job.jobId);
      S.current.currentJobId = job.jobId;
      savePresetAfterGeneration();
      setWatchJobId(job.jobId);
    } catch (err) {
      console.error('Error iniciando la generación:', err);
      dialog.alert('No se pudo iniciar la generación de boletines.', 'Error');
      setIsGenerating(false);
    }
  };

  const initiateGenerate = () => { if (!isValid()) return; startGeneration(); };

  const previewPdf = (studentId) => {
    if (!currentJobId) return;
    api.open('GET', `/boletines/generaciones/${currentJobId}/archivo/${studentId}`)
      .catch(() => dialog.alert('No se pudo abrir el boletín.', 'Error'));
  };

  const downloadPdf = (studentId, fileName) => {
    if (!currentJobId) return;
    api.download('GET', `/boletines/generaciones/${currentJobId}/archivo/${studentId}`, { filename: fileName })
      .catch(() => dialog.alert('No se pudo descargar el boletín.', 'Error'));
  };

  /* ───────── Firmas ───────── */
  const uploadSignatureFile = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    api.post('/boletines/firmas/upload', formData)
      .then((sig) => setSignatures((cur) => [...cur, sig]))
      .catch(() => dialog.alert('Error al subir la firma', 'Error'));
  };

  const onSignatureUpload = (e) => {
    const input = e.target;
    if (input.files && input.files.length > 0) {
      Array.from(input.files).forEach((file) => uploadSignatureFile(file));
      input.value = '';
    }
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = document.querySelector('.signature-panel');
    if (panel) panel.classList.add('drag-over');
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = document.querySelector('.signature-panel');
    if (panel) panel.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => { if (file.type.startsWith('image/')) uploadSignatureFile(file); });
    }
  };

  const onImageError = (e) => { e.target.style.display = 'none'; };

  const backToForm = () => {
    setWatchJobId(null);
    setCurrentJobId(null);
    setShowFormView(true);
    setFadeOutForm(false);
    setIsGenerating(false);
    setGeneratedFiles([]);
    setCurrentGeneratingIndex(-1);
    setGenerationProgress(0);
    setShowSignaturePanel(false);
    setCurrentStep('subjectIndicators');
    setCurrentSubjectIndex(0);
  };

  const subj = subjects[currentSubjectIndex];
  const compScale = (id) => escalaValorativaLetra(studentCompSocialRating[id]);
  const valScale = (id) => escalaValorativaLetra(studentValoracionAcudiente[id]);

  const IndicatorInputs = ({ student }) => ['ih', 'fa', 'faa'].map((f) => (
    <td className="td-indicator" key={f}>
      <input type="number" min="0" value={getStudentIndicator(student.id, subj)[f] ?? ''} onChange={(e) => setStudentIndicator(student.id, subj, f, numOrUndef(e))} className="indicator-input-small" />
    </td>
  ));

  return (
    <div className="pg-boletines">
      <div className="boletines-container">
        <div className="boletines-header">
          <h2>📋 Boletines</h2>
        </div>

        {showFormView && (
          <div className={`form-view${fadeOutForm ? ' fade-out' : ''}`}>
            {/* FILTROS */}
            <div className="filters-section">
              <div className="filter-group">
                <label>Grado:</label>
                <select value={selectedGrade} onChange={(e) => onGradeChange(e.target.value)}>
                  <option value="">Seleccione un grado</option>
                  {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label>Salón:</label>
                <select value={selectedClassroom} onChange={(e) => onClassroomChange(e.target.value)}>
                  <option value="">Seleccione un salón</option>
                  {CLASSROOMS.map((classroom) => <option key={classroom} value={classroom}>{classroom}</option>)}
                </select>
              </div>
              <div className="filter-group">
                <label>Período:</label>
                <select value={selectedPeriod} onChange={(e) => onPeriodChange(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((p) => <option key={p} value={p}>Período {p}</option>)}
                </select>
              </div>
            </div>

            {/* MATERIAS PERDIDAS DEL PERÍODO SELECCIONADO */}
            {lostAreasPreview.length > 0 && (
              <div className="section-card lost-areas-card">
                <h3><span className="material-icons">warning</span> Materias perdidas — Período {selectedPeriod}</h3>
                <div className="lost-areas-list">
                  {lostAreasPreview.map((item) => (
                    <div className="lost-areas-row" key={item.studentName}>
                      <span className="lost-areas-student">{item.studentName}</span>
                      <span className="lost-areas-subjects">{item.subjects.join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PASO 1: INDICADORES POR MATERIA (UNA PANTALLA POR MATERIA) */}
            {students.length > 0 && currentStep === 'subjectIndicators' && (
              <div className="section-card">
                <h3>Paso 1: Indicadores por Materia</h3>
                <p className="step-hint">
                  Materia {currentSubjectIndex + 1} de {subjects.length}: {subj}
                </p>

                {presetPeriods.length > 0 && (
                  <div className="preset-objectives">
                    <button type="button" className="btn-preset" onClick={() => setShowPresetMenu(!showPresetMenu)}>
                      🎯 Objetivos predeterminados
                    </button>
                    {showPresetMenu && (
                      <div className="preset-menu">
                        {presetPeriods.map((p) => (
                          <button type="button" className="preset-option" key={p} onClick={() => applyPreset(p)}>{presetPeriodLabel(p)}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="subject-indicators-card">
                  <div className="subject-header">{subj}</div>
                  <div className="objective-field">
                    <label>Objetivo de la materia:</label>
                    <textarea
                      value={groupObjectives[subj] || ''}
                      onChange={(e) => setGroupObjectives((cur) => ({ ...cur, [subj]: e.target.value }))}
                      placeholder="Objetivo..."
                      className="objective-textarea"
                      rows={2}
                    />
                  </div>
                  {isValoracionAcudiente(subj) ? (
                    <div className="students-indicators-table">
                      <table className="indicators-table">
                        <thead>
                          <tr>
                            <th>Estudiante</th>
                            <th>Nota Val. Acudiente</th>
                            <th>I.H.</th>
                            <th>F.A.</th>
                            <th>F.A.A.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((student) => (
                            <tr key={student.id}>
                              <td className="td-student-name">{student.surname} {student.name}</td>
                              <td className="td-indicator">
                                <div className="grade-input-with-scale">
                                  <GradeInput value={studentValoracionAcudiente[student.id]} onValue={(raw) => setValoracionAcudiente(student.id, raw)} />
                                  {valScale(student.id) && (
                                    <span className={`scale-badge scale-${valScale(student.id)}`}>{valScale(student.id)}</span>
                                  )}
                                </div>
                              </td>
                              <IndicatorInputs student={student} />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="students-indicators-table">
                      <table className="indicators-table">
                        <thead>
                          <tr>
                            <th>Estudiante</th>
                            <th>I.H</th>
                            <th>F.A</th>
                            <th>F.A.A</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((student) => (
                            <tr key={student.id}>
                              <td className="td-student-name">{student.surname} {student.name}</td>
                              <IndicatorInputs student={student} />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="step-actions">
                  {currentSubjectIndex > 0 && (
                    <button className="btn-back" onClick={prevSubjectIndicators}>
                      ← Anterior
                    </button>
                  )}
                  <button className="btn-next" onClick={nextSubjectIndicators}>
                    {currentSubjectIndex < subjects.length - 1 ? 'Siguiente Materia →' : 'Continuar →'}
                  </button>
                </div>
              </div>
            )}

            {/* PASO 2: COMPORTAMIENTO SOCIAL (INDICADORES + OBJETIVO + CALIFICACIÓN) */}
            {students.length > 0 && currentStep === 'comportamiento' && (
              <div className="section-card">
                <h3>Paso 2: Comportamiento Social por Estudiante</h3>
                <p className="step-hint">
                  Ingrese la calificación valorativa, los indicadores (I.H. / F.A. / F.A.A.) y el objetivo general
                  del comportamiento social.
                </p>

                <div className="objective-field" style={{ marginBottom: '12px' }}>
                  <label>Objetivo / descripción del Comportamiento Social (se imprime en el boletín):</label>
                  <textarea
                    value={compSocialObjetivo}
                    onChange={(e) => setCompSocialObjetivo(e.target.value)}
                    placeholder="Objetivo / recomendación general del Comportamiento Social…"
                    className="objective-textarea"
                    rows={2}
                  />
                </div>

                <div className="students-indicators-table">
                  <table className="indicators-table">
                    <thead>
                      <tr>
                        <th>Estudiante</th>
                        <th>Nota Comp. Social</th>
                        <th>I.H.</th>
                        <th>F.A.</th>
                        <th>F.A.A.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => (
                        <tr key={student.id}>
                          <td className="td-student-name">{student.surname} {student.name}</td>
                          <td className="td-indicator">
                            <div className="grade-input-with-scale">
                              <GradeInput value={studentCompSocialRating[student.id]} onValue={(raw) => setCompSocialRating(student.id, raw)} />
                              {compScale(student.id) && (
                                <span className={`scale-badge scale-${compScale(student.id)}`}>{compScale(student.id)}</span>
                              )}
                            </div>
                          </td>
                          {[['ih', 'I.H.'], ['fa', 'F.A.'], ['faa', 'F.A.A.']].map(([f, ph]) => (
                            <td className="td-indicator" key={f}>
                              <input type="number" min="0" value={getCompSocialIndicator(student.id)[f] ?? ''}
                                onChange={(e) => setCompSocialIndicator(student.id, f, numOrUndef(e))}
                                className="indicator-input-small" placeholder={ph} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="step-actions">
                  <button className="btn-back" onClick={() => setCurrentStep('subjectIndicators')}>
                    ← Atrás
                  </button>
                  <button className="btn-next" onClick={goToFinal}>
                    Continuar →
                  </button>
                </div>
              </div>
            )}

            {/* PASO 3: FIRMA Y GENERAR */}
            {students.length > 0 && currentStep === 'final' && (
              <div className="section-card">
                <h3>Paso 3: Generar Boletines</h3>
                <p className="step-hint">Seleccione la firma del director y genere los boletines.</p>

                <div className="signature-management">
                  <h4>Firma del Director</h4>
                  <button className="btn-manage-sig" onClick={() => setShowSignaturePanel(true)}>
                    📁 Gestionar Firmas
                  </button>
                  {selectedDirectorSignature && (
                    <div className="selected-sig-preview">
                      <span>Firma seleccionada:</span>
                      <img src={imageUrl(selectedDirectorSignature)} alt="Firma director" className="sig-thumb" onError={onImageError} />
                      <button className="btn-clear-sig" onClick={() => setSelectedDirectorSignature(undefined)}>✕</button>
                    </div>
                  )}
                </div>

                <div className="step-actions">
                  <button className="btn-next" onClick={initiateGenerate}>
                    Generar Boletines
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Generation progress */}
        {!showFormView && isGenerating && (
          <div className="generating-view fade-in">
            <h3>⏳ Generando Boletines...</h3>
            <div className="progress-section">
              <div className="progress-bar-wrapper">
                <div className="progress-bar" style={{ width: `${generationProgress}%` }}></div>
              </div>
              <div className="progress-text">{generationProgress}% completado {generatingTotal > 0 && <>· {generatingCompleted} / {generatingTotal} boletines</>}</div>
            </div>
            <div className="generating-list">
              {students.map((student, i) => (
                <div key={student.id} className={`generating-item${i === currentGeneratingIndex ? ' generating' : ''}${i < currentGeneratingIndex ? ' done' : ''}`}>
                  <span className="gen-name">{student.surname} {student.name}</span>
                  <span className="gen-status">
                    {i < currentGeneratingIndex ? <span className="status-done">✅</span>
                      : i === currentGeneratingIndex ? <span className="status-active">⏳</span>
                        : <span className="status-pending">⬜</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {!showFormView && !isGenerating && generatedFiles.length > 0 && (
          <div className="results-view fade-in">
            <h3>✅ Boletines Generados</h3>
            <div className="results-summary">
              Se generaron {generatedFiles.length} boletines correctamente.
            </div>
            <div className="results-list">
              {generatedFiles.map((file) => (
                <div className="result-card" key={file.fileName}>
                  <div className="result-info">
                    <div className="result-name">{file.studentName}</div>
                    <div className="result-file">{file.fileName}</div>
                  </div>
                  <div className="result-actions">
                    <button className="preview-btn" onClick={() => previewPdf(file.studentId)}>
                      👁️ Vista Previa
                    </button>
                    <button className="download-btn" onClick={() => downloadPdf(file.studentId, file.fileName)}>
                      📥 Descargar
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="back-btn" onClick={backToForm}>
              ← Volver a generar
            </button>
          </div>
        )}

        {/* Signature Panel */}
        {showSignaturePanel && (
          <Overlay className="signature-panel-overlay" onClick={() => setShowSignaturePanel(false)}>
            <div className="signature-panel" onClick={(e) => e.stopPropagation()}>
              <div className="panel-header">
                <h3>Gestionar Firmas</h3>
                <button className="panel-close" onClick={() => setShowSignaturePanel(false)}>✕</button>
              </div>
              <div className="panel-body">
                <div className="upload-zone" onDragOver={onDragOver} onDrop={onDrop}>
                  <p>Arrastra fotos de firmas aquí o</p>
                  <input type="file" accept="image/*" onChange={onSignatureUpload} multiple />
                  <button className="btn-upload">Seleccionar archivos</button>
                </div>
                <div className="signatures-gallery">
                  <div className={`sig-card a11y-clickable${!selectedDirectorSignature ? ' selected' : ''}`} role="button" tabIndex={0} aria-label="Sin firma de director"
                    onClick={() => setSelectedDirectorSignature(undefined)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelectedDirectorSignature(undefined); else if (e.key === ' ') { setSelectedDirectorSignature(undefined); e.preventDefault(); } }}>
                    <div className="sig-img no-sig">
                      <span className="no-sig-icon">📝</span>
                      <span className="no-sig-text">Sin firma personalizada</span>
                    </div>
                    <div className="sig-name">Por defecto</div>
                  </div>
                  {signatures.map((sig) => (
                    <div key={sig.path} className={`sig-card a11y-clickable${selectedDirectorSignature === sig.path ? ' selected' : ''}`} role="button" tabIndex={0} aria-label={`Firma ${sig.name}`}
                      onClick={() => setSelectedDirectorSignature(sig.path)}
                      onKeyDown={(e) => { if (e.key === 'Enter') setSelectedDirectorSignature(sig.path); else if (e.key === ' ') { setSelectedDirectorSignature(sig.path); e.preventDefault(); } }}>
                      <div className="sig-img">
                        <img src={imageUrl(sig.path)} alt={sig.name} onError={onImageError} />
                      </div>
                      <div className="sig-name">{sig.name}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel-footer">
                <button className="btn-cancel" onClick={() => setShowSignaturePanel(false)}>Cerrar</button>
                <button className="btn-confirm" onClick={() => setShowSignaturePanel(false)}>Aceptar</button>
              </div>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}