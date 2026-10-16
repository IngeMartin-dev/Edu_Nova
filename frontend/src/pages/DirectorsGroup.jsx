import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useDialog } from '../context/UiContext.jsx';
import '../styles/pages/directors-group.css';
import Overlay from '../components/Overlay.jsx';

const BACH = ['Salon A', 'Salon B'];
const ALL_GRADES = ['Grado 1º', 'Grado 2º', 'Grado 3º', 'Grado 4º', 'Grado 5º', 'Grado 6º', 'Grado 7º', 'Grado 8º', 'Grado 9º', 'Grado 10º', 'Grado 11º'];

const getSubjectAcronym = (subject) => {
  if (subject.code && subject.code.trim().length > 0) return subject.code.trim().toUpperCase();
  const cleaned = (subject.name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
  if (!cleaned) return '';
  return cleaned.replace(/\s+/g, ' ').substring(0, 3);
};
const getClassroomLetter = (classroom) => {
  const m = classroom.match(/([A-Za-z])$/);
  return m ? m[1].toUpperCase() : '';
};

export default function DirectorsGroup() {
  const dialog = useDialog();
  const [teachers, setTeachers] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [homeroomAssignments, setHomeroomAssignments] = useState([]);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [activeTab, setActiveTab] = useState('bachillerato');
  const [searchTerm, setSearchTerm] = useState('');
  const [notif, setNotif] = useState({ show: false, type: null, message: '' });
  const notifTimer = useRef(null);

  const loadTeachers = async () => {
    try { setTeachers(await api.get('/users/teachers')); } catch (e) { console.error('Error loading teachers:', e); setTeachers([]); }
  };
  const loadSubjects = async () => {
    try { setAllSubjects(await api.get('/subjects')); } catch (e) { console.error('Error loading subjects:', e); setAllSubjects([]); }
  };
  const loadHomeroomAssignments = async () => {
    try { setHomeroomAssignments(await api.get('/homeroom-assignments')); } catch (e) { console.error('Error loading homeroom assignments:', e); setHomeroomAssignments([]); }
  };

  useEffect(() => {
    loadTeachers(); loadSubjects(); loadHomeroomAssignments();
    return () => clearTimeout(notifTimer.current);
  }, []);

  const showNotification = (type, message, ms) => {
    clearTimeout(notifTimer.current);
    setNotif({ show: true, type, message });
    notifTimer.current = setTimeout(() => setNotif((n) => ({ ...n, show: false })), ms);
  };
  const showSuccessNotification = (m) => showNotification('success', m, 3000);
  const showErrorNotification = (m) => showNotification('error', m, 4000);

  const getTeacherSubjectObjects = (t) => allSubjects.filter((s) => s.teacherId === t.id || s.teacher === t.id);
  const getDirectorAssignment = (t) => homeroomAssignments.find((a) => a.userId === t.id);

  const getFilteredTeachers = () => {
    const term = searchTerm.toLowerCase();
    const filtered = term
      ? teachers.filter((t) => (t.name || '').toLowerCase().includes(term) || (t.surname || '').toLowerCase().includes(term) || (t.email && t.email.toLowerCase().includes(term)))
      : teachers;
    return [...filtered].sort((a, b) => {
      const aH = getDirectorAssignment(a) !== undefined;
      const bH = getDirectorAssignment(b) !== undefined;
      if (aH !== bH) return aH ? 1 : -1;
      return `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, 'es');
    });
  };

  const getClassroomsForTab = () => ALL_GRADES.filter((g) => {
    const num = parseInt(g.replace(/\D/g, ''));
    return activeTab === 'bachillerato' ? num >= 6 && num <= 11 : num >= 1 && num <= 5;
  });
  const getClassroomsForGrade = () => BACH;
  const getAssignmentForGradeClassroom = (g, c) => homeroomAssignments.find((a) => a.grade === g && a.classroom === c);
  const isAssigned = (g, c) => homeroomAssignments.some((a) => a.grade === g && a.classroom === c);
  const isAssignedToSelectedTeacher = (g, c) => {
    const a = getAssignmentForGradeClassroom(g, c);
    return a !== undefined && selectedTeacher !== null && a.userId === selectedTeacher.id;
  };

  const selectGradeAndClassroom = async (grade, classroom) => {
    if (!selectedTeacher) { showErrorNotification('Selecciona un profesor primero'); return; }
    const existing = getAssignmentForGradeClassroom(grade, classroom);
    if (existing && existing.userId !== selectedTeacher.id) {
      const ok = await dialog.confirm(
        `El salón ${grade} - ${classroom} ya tiene director asignado (${existing.userName}). ¿Desea reemplazarlo?`,
        'Director ya asignado',
        { confirmText: 'Reemplazar', cancelText: 'Cancelar', danger: true });
      if (!ok) return;
    }
    setSelectedGrade(grade);
    setSelectedClassroom(classroom);
    try {
      await api.post('/homeroom-assignments/assign', { userId: selectedTeacher.id, grade, classroom });
      showSuccessNotification(`Director asignado: ${selectedTeacher.name} ${selectedTeacher.surname} - ${grade} ${classroom}`);
      loadHomeroomAssignments();
    } catch (e) {
      console.error('Error assigning director:', e);
      showErrorNotification('Error al asignar el director de grupo');
    }
  };

  const removeAssignment = async (grade, classroom) => {
    try {
      await api.del('/homeroom-assignments/remove', { grade, classroom });
      showSuccessNotification('Asignación removida correctamente');
      loadHomeroomAssignments();
    } catch (e) {
      console.error('Error removing assignment:', e);
      showErrorNotification('Error al remover la asignación');
    }
  };

  const filtered = getFilteredTeachers();

  return (
    <div className="pg-directors-group">
      <div className="directors-container">
        <div className="directors-header">
          <h2>Directores de Grupo</h2>
        </div>

        <div className="search-bar">
          <span className="material-icons search-icon">search</span>
          <input type="text" id="director-search" name="directorSearch" onInput={(e) => setSearchTerm(e.target.value)} onChange={() => {}} placeholder="Buscar profesor..." autoComplete="off" />
        </div>

        <div className="two-columns">
          <div className="column">
            <h3>Profesores</h3>
            <div className="teachers-list">
              {filtered.map((teacher) => {
                const assignment = getDirectorAssignment(teacher);
                const select = () => setSelectedTeacher(teacher);
                return (
                  <div key={teacher.id}
                    className={`teacher-item a11y-clickable${selectedTeacher?.id === teacher.id ? ' teacher-selected' : ''}`}
                    role="button" tabIndex={0} aria-label={'Seleccionar docente ' + teacher.name}
                    onClick={select}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') select();
                      else if (e.key === ' ') { select(); e.preventDefault(); }
                    }}>
                    <div className="teacher-info">
                      <div className="teacher-avatar">{(teacher.name || '').charAt(0)}{(teacher.surname || '').charAt(0)}</div>
                      <div className="teacher-details">
                        <div className="teacher-name-row">
                          <strong className="teacher-name">{teacher.name} {teacher.surname}</strong>
                          {assignment && (
                            <button type="button" className="director-badge removable"
                              onClick={(e) => { removeAssignment(assignment.grade, assignment.classroom); e.stopPropagation(); }}
                              title="Quitar director de grupo">
                              <span className="material-icons director-icon">groups</span>
                              Director {assignment.grade} {getClassroomLetter(assignment.classroom || '')}
                            </button>
                          )}
                        </div>
                        <div className="teacher-subject-chips">
                          {getTeacherSubjectObjects(teacher).map((subject) => (
                            <span className="subject-chip" key={subject.id}>
                              {getSubjectAcronym(subject)}
                            </span>
                          ))}
                        </div>
                        <span className="teacher-email">{teacher.email}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <p className="empty-text">No hay profesores registrados</p>
                </div>
              )}
            </div>
          </div>

          <div className="column">
            <h3>Salones</h3>
            {selectedTeacher ? (
              <div className="assignment-hint">
                Profesor seleccionado: <strong>{selectedTeacher.name} {selectedTeacher.surname}</strong>.
                Selecciona un salón para asignar como director.
                <button type="button" className="cancel-btn small" onClick={() => setSelectedTeacher(null)}>Cancelar</button>
              </div>
            ) : (
              <div className="assignment-hint">
                Selecciona un profesor de la lista para empezar a asignar.
              </div>
            )}

            <div className="tabs">
              <button className={`tab-btn${activeTab === 'bachillerato' ? ' active' : ''}`} onClick={() => setActiveTab('bachillerato')}>
                Bachillerato
              </button>
              <button className={`tab-btn${activeTab === 'primaria' ? ' active' : ''}`} onClick={() => setActiveTab('primaria')}>
                Primaria
              </button>
            </div>

            <div className="classrooms-page-grid">
              {getClassroomsForTab().map((grade) => (
                <div className="grade-section-page" key={grade}>
                  <h3 className="grade-title">{grade}</h3>
                  <div className="classrooms-page">
                    {getClassroomsForGrade(grade).map((classroom) => {
                      const assigned = isAssigned(grade, classroom);
                      const mine = isAssignedToSelectedTeacher(grade, classroom);
                      const disabled = assigned && !mine;
                      return (
                        <button key={classroom}
                          className={`classroom-btn grade-page-style${assigned ? ' assigned' : ''}${mine ? ' assigned-to-me' : ''}${disabled ? ' disabled' : ''}${selectedGrade === grade && selectedClassroom === classroom ? ' selected' : ''}`}
                          onClick={() => selectGradeAndClassroom(grade, classroom)}
                          disabled={disabled}>
                          {classroom}
                          {assigned && <span className="assigned-icon">🔒</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {notif.show && (
          <Overlay className="notification-overlay" onClick={() => setNotif((n) => ({ ...n, show: false }))}>
            <div className={`notification-content${notif.type === 'success' ? ' notification-success' : ''}${notif.type === 'error' ? ' notification-error' : ''}`} onClick={(e) => e.stopPropagation()}>
              <div className="notification-icon">
                {notif.type === 'success' && (
                  <svg className="checkmark" viewBox="0 0 52 52"><path className="checkmark__check" fill="none" d="m14.1 27.2l7.1 7.2 16.7-16.8" /></svg>
                )}
                {notif.type === 'error' && (
                  <svg className="error-mark" viewBox="0 0 52 52"><path className="error-mark__x" fill="none" d="M16 16l20 20M36 16L16 36" /></svg>
                )}
              </div>
              <div className="notification-body">
                <div className="notification-title">{notif.type === 'success' ? '¡Éxito!' : '¡Error!'}</div>
                <div className="notification-message">{notif.message}</div>
              </div>
              <button className="notification-close" onClick={() => setNotif((n) => ({ ...n, show: false }))}>✕</button>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}