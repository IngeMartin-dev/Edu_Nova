import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import '../styles/pages/subjects.css';
import Overlay from '../components/Overlay.jsx';

const capitalizeFirstLetter = (value) => (!value ? value : value.charAt(0).toUpperCase() + value.slice(1));
const sortByName = (list) => [...list].sort((a, b) => a.name.localeCompare(b.name));
const NEW_SUBJECT = () => ({ name: '', code: '', level: 'primaria', gradeMin: 1, gradeMax: 5, type: 'core' });
const numVal = (v) => (v === '' ? null : Number(v));

export default function Subjects() {
  const [selectedTab, setSelectedTab] = useState('primaria');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState(null);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [subjectToModifyGrades, setSubjectToModifyGrades] = useState(null);
  const [modifyGradesData, setModifyGradesData] = useState({ gradeMin: 1, gradeMax: 5 });
  const [isSavingSubject, setIsSavingSubject] = useState(false);
  const [isSavingGrades, setIsSavingGrades] = useState(false);
  const [newSubject, setNewSubject] = useState(NEW_SUBJECT());

  const [notif, setNotif] = useState({ show: false, type: null, message: '' });
  const notifTimer = useRef(null);
  useEffect(() => () => clearTimeout(notifTimer.current), []);

  useEffect(() => {
    let alive = true;
    api.get('/subjects').then((data) => {
      if (!alive) return;
      setSubjects(data);
      setLoading(false);
    }).catch((err) => {
      console.error('Failed to load subjects', err);
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const showNotification = (type, message) => {
    setNotif({ show: true, type, message });
    clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotif((n) => ({ ...n, show: false })), 2500);
  };
  const showSuccessNotification = (m) => showNotification('success', m);
  const showErrorNotification = (m) => showNotification('error', m);
  const hideNotification = () => setNotif((n) => ({ ...n, show: false }));

  const openAddModal = () => { setNewSubject(NEW_SUBJECT()); setShowAddModal(true); };
  const closeAddModal = () => setShowAddModal(false);

  const onLevelChange = (level) => {
    setNewSubject((s) => {
      const n = { ...s, level };
      if (level === 'bachillerato') { n.gradeMin = 6; n.gradeMax = 9; }
      else if (level === 'media') { n.gradeMin = 10; n.gradeMax = 11; }
      else { n.gradeMin = 1; n.gradeMax = 5; }
      return n;
    });
  };

  const onSubjectNameInput = (e) => {
    const input = e.target;
    const cursorPos = input.selectionStart ?? 0;
    const originalLength = input.value.length;
    const capitalized = capitalizeFirstLetter(input.value);
    setNewSubject((s) => ({ ...s, name: capitalized }));
    if (capitalized !== input.value) {
      const newPos = cursorPos + (capitalized.length - originalLength);
      requestAnimationFrame(() => { try { input.setSelectionRange(newPos, newPos); } catch { /* */ } });
    }
  };

  const addSubject = async (e) => {
    e?.preventDefault();
    if (!newSubject.name || !newSubject.name.trim()) {
      showErrorNotification('El nombre de la materia es obligatorio');
      return;
    }
    setIsSavingSubject(true);
    const subjectData = {
      name: capitalizeFirstLetter(newSubject.name.trim()),
      code: newSubject.code?.toUpperCase() || '',
      level: newSubject.level || 'primaria',
      gradeMin: newSubject.gradeMin || 1,
      gradeMax: newSubject.gradeMax || 5,
      type: newSubject.type || 'core',
    };
    try {
      const saved = await api.post('/subjects', subjectData);
      setSubjects((l) => [...l, saved]);
      closeAddModal();
      setIsSavingSubject(false);
      showSuccessNotification('Materia agregada exitosamente');
    } catch (err) {
      console.error('Error creating subject', err);
      setIsSavingSubject(false);
      showErrorNotification('Error al agregar la materia');
    }
  };

  const closeDeleteModal = () => setSubjectToDelete(null);

  const deleteSubject = async () => {
    if (!subjectToDelete) return;
    const id = subjectToDelete.id;
    try {
      await api.del(`/subjects/${id}`);
      setSubjects((l) => l.filter((s) => s.id !== id));
      closeDeleteModal();
      showSuccessNotification('Materia eliminada exitosamente');
    } catch (err) {
      console.error('Error deleting subject', err);
      closeDeleteModal();
      showErrorNotification('Error al eliminar la materia');
    }
  };

  const changeType = async (subject, type, okMsg, errMsg) => {
    try {
      const saved = await api.put(`/subjects/${subject.id}`, { ...subject, type });
      setSubjects((l) => l.map((s) => (s.id === saved.id ? saved : s)));
      showSuccessNotification(okMsg);
    } catch (err) {
      console.error('Error updating subject', err);
      showErrorNotification(errMsg);
    }
  };
  const changeToElective = (s) => changeType(s, 'elective', 'Materia cambiada a electiva', 'Error al cambiar a electiva');
  const changeToCore = (s) => changeType(s, 'core', 'Materia cambiada a básica', 'Error al cambiar a básica');

  const openModifyGrades = (subject) => {
    setSubjectToModifyGrades(subject);
    setModifyGradesData({ gradeMin: subject.gradeMin ?? 1, gradeMax: subject.gradeMax ?? 5 });
    setShowGradeModal(true);
  };
  const closeGradeModal = () => { setShowGradeModal(false); setSubjectToModifyGrades(null); };

  const saveModifiedGrades = async (e) => {
    e?.preventDefault();
    if (!subjectToModifyGrades) return;
    setIsSavingGrades(true);
    const updated = { ...subjectToModifyGrades, gradeMin: modifyGradesData.gradeMin, gradeMax: modifyGradesData.gradeMax };
    try {
      const saved = await api.put(`/subjects/${subjectToModifyGrades.id}`, updated);
      setSubjects((l) => l.map((s) => (s.id === saved.id ? saved : s)));
      closeGradeModal();
      setIsSavingGrades(false);
      showSuccessNotification('Grados modificados exitosamente');
    } catch (err) {
      console.error('Error updating grades', err);
      setIsSavingGrades(false);
      showErrorNotification('Error al modificar grados');
    }
  };

  const isElective = (s) => (s.type || 'core').toLowerCase() === 'elective';
  const totalSubjects = subjects.length;
  const coreCount = subjects.filter((s) => !isElective(s)).length;
  const electiveCount = subjects.filter(isElective).length;

  const selectTab = (tab) => setSelectedTab(tab);

  const tabSubjects = useMemo(() => subjects.filter((s) => {
    const min = s.gradeMin ?? 1;
    const max = s.gradeMax ?? 11;
    if (selectedTab === 'primaria') return max <= 5;
    if (selectedTab === 'bachillerato') return min >= 6 && min < 10;
    return min >= 10;
  }), [subjects, selectedTab]);

  const tabTitle = { primaria: 'Materias de Primaria', bachillerato: 'Materias de Bachillerato', media: 'Materias de Media' }[selectedTab];
  const tabEmpty = { primaria: 'primaria', bachillerato: 'bachillerato', media: 'Media' }[selectedTab];

  return (
    <div className="pg-subjects">
      <div className="subjects-container">
        <h2>Gestión de Materias y Asignaturas</h2>

        {/* Subject Statistics */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📚</div>
            <div className="stat-content"><h3>{totalSubjects}</h3><p>Materias Totales</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🎯</div>
            <div className="stat-content"><h3>{coreCount}</h3><p>Materias Básicas</p></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🎨</div>
            <div className="stat-content"><h3>{electiveCount}</h3><p>Materias Electivas</p></div>
          </div>
        </div>

        {/* Add Subject Button */}
        <div className="subjects-header">
          <button className="add-subject-button" onClick={openAddModal}>➕ Agregar Materia</button>
        </div>

        {/* Tab Selector */}
        <div className="tab-selector">
          <button className={`tab-btn${selectedTab === 'primaria' ? ' active' : ''}`} onClick={() => selectTab('primaria')}>📚 Primaria (1° - 5°)</button>
          <button className={`tab-btn${selectedTab === 'bachillerato' ? ' active' : ''}`} onClick={() => selectTab('bachillerato')}>🎓 Bachillerato (6° - 11°)</button>
          <button className={`tab-btn${selectedTab === 'media' ? ' active' : ''}`} onClick={() => selectTab('media')}>📖 Media (10° - 11°)</button>
        </div>

        {/* All Subjects by Tab */}
        <div className="subjects-content">
          <h3>
            {tabTitle}
            <span className="subject-count-badge">{tabSubjects.length} materias</span>
          </h3>
          <div className="subjects-grid">
            {tabSubjects.map((subject) => {
              const lvl = (subject.level || '').toLowerCase();
              return (
                <div className="subject-card" key={subject.id}>
                  <div className="subject-header">
                    <h5>{subject.name}</h5>
                    <span className="subject-code">{subject.code}</span>
                  </div>
                  <div className="subject-details">
                    <p className="grades-range">
                      📏 Grados{' '}
                      <strong>{subject.gradeMin ?? '?'}°</strong>
                      {' — '}
                      <strong>{subject.gradeMax ?? '?'}°</strong>
                    </p>
                    <p className="subject-level">
                      {lvl === 'primaria' && <>🏫 Primaria</>}
                      {lvl === 'bachillerato' && <>🏛️ Bachillerato</>}
                      {lvl === 'media' && <>📖 Media</>}
                    </p>
                    <p className="subject-type-badge">
                      {isElective(subject)
                        ? <span className="badge badge-elective">⚡ Electiva</span>
                        : <span className="badge badge-core">📘 Básica</span>}
                    </p>
                  </div>
                  <div className="subject-actions">
                    {isElective(subject)
                      ? <button className="action-btn core-btn" onClick={() => changeToCore(subject)}>Quitar electiva</button>
                      : <button className="action-btn elective-btn" onClick={() => changeToElective(subject)}>Cambiar a electiva</button>}
                    <button className="action-btn edit-btn" onClick={() => openModifyGrades(subject)}>Modificar grados</button>
                    <button className="action-btn delete-btn" onClick={() => setSubjectToDelete(subject)}>🗑️ Eliminar</button>
                  </div>
                </div>
              );
            })}
            {tabSubjects.length === 0 && (
              <div className="empty-message">
                No hay materias registradas para {tabEmpty}.
                <br /><br />
                <button className="add-subject-button" onClick={openAddModal} style={{ margin: '0 auto' }}>➕ Agregar materia ahora</button>
              </div>
            )}
          </div>
        </div>

        {/* Add Subject Modal */}
        {showAddModal && (
          <Overlay className="modal-overlay" onClick={closeAddModal}>
            <div className="modal-content add-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>➕ Agregar Nueva Materia</h3>
                <button className="close-button" onClick={closeAddModal}>✕</button>
              </div>
              <div className="modal-body">
                <form noValidate onSubmit={addSubject}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="subjectName">Nombre de la Materia *</label>
                      <input type="text" id="subjectName" name="name" value={newSubject.name ?? ''}
                        onChange={onSubjectNameInput} placeholder="Ej: Matemáticas" autoComplete="off" required maxLength={100} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="subjectCode">Código *</label>
                      <input type="text" id="subjectCode" name="code" value={newSubject.code ?? ''}
                        onChange={(e) => setNewSubject((s) => ({ ...s, code: e.target.value.toUpperCase() }))}
                        placeholder="Ej: MAT" autoComplete="off" required maxLength={20} />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="subjectLevel">Nivel *</label>
                      <select id="subjectLevel" name="level" value={newSubject.level} onChange={(e) => onLevelChange(e.target.value)} autoComplete="off" required>
                        <option value="primaria">Primaria</option>
                        <option value="bachillerato">Bachillerato</option>
                        <option value="media">Media (10°-11°)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="subjectType">Tipo *</label>
                      <select id="subjectType" name="type" value={newSubject.type} onChange={(e) => setNewSubject((s) => ({ ...s, type: e.target.value }))} autoComplete="off" required>
                        <option value="core">Básica</option>
                        <option value="elective">Electiva</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row form-row-2">
                    <div className="form-group">
                      <label htmlFor="gradeMin">Grado Mínimo *</label>
                      <input type="number" id="gradeMin" name="gradeMin" value={newSubject.gradeMin ?? ''}
                        onChange={(e) => setNewSubject((s) => ({ ...s, gradeMin: numVal(e.target.value) }))} min="1" max="11" required autoComplete="off" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="gradeMax">Grado Máximo *</label>
                      <input type="number" id="gradeMax" name="gradeMax" value={newSubject.gradeMax ?? ''}
                        onChange={(e) => setNewSubject((s) => ({ ...s, gradeMax: numVal(e.target.value) }))} min="1" max="11" required autoComplete="off" />
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="cancel-button" onClick={closeAddModal} disabled={isSavingSubject}>Cancelar</button>
                    <button type="submit" className="save-button" disabled={isSavingSubject}>
                      {!isSavingSubject && <span>💾 Guardar Materia</span>}
                      {isSavingSubject && <span>Guardando...</span>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Overlay>
        )}

        {/* Modify Grades Modal */}
        {showGradeModal && subjectToModifyGrades && (
          <Overlay className="modal-overlay" onClick={closeGradeModal}>
            <div className="modal-content add-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>📏 Modificar Grados - {subjectToModifyGrades.name}</h3>
                <button className="close-button" onClick={closeGradeModal}>✕</button>
              </div>
              <div className="modal-body">
                <form noValidate onSubmit={saveModifiedGrades}>
                  <div className="form-row form-row-2">
                    <div className="form-group">
                      <label htmlFor="modifyGradeMin">Grado Mínimo *</label>
                      <input type="number" id="modifyGradeMin" name="modifyGradeMin" value={modifyGradesData.gradeMin ?? ''}
                        onChange={(e) => setModifyGradesData((d) => ({ ...d, gradeMin: numVal(e.target.value) }))} min="1" max="11" required autoComplete="off" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="modifyGradeMax">Grado Máximo *</label>
                      <input type="number" id="modifyGradeMax" name="modifyGradeMax" value={modifyGradesData.gradeMax ?? ''}
                        onChange={(e) => setModifyGradesData((d) => ({ ...d, gradeMax: numVal(e.target.value) }))} min="1" max="11" required autoComplete="off" />
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="cancel-button" onClick={closeGradeModal} disabled={isSavingGrades}>Cancelar</button>
                    <button type="submit" className="save-button" disabled={isSavingGrades}>
                      {!isSavingGrades && <span>💾 Guardar Cambios</span>}
                      {isSavingGrades && <span>Guardando...</span>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Overlay>
        )}

        {/* Delete Confirmation Modal */}
        {subjectToDelete && (
          <Overlay className="modal-overlay" onClick={closeDeleteModal}>
            <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>⚠️ Confirmar eliminación</h3>
                <button className="close-button" onClick={closeDeleteModal}>✕</button>
              </div>
              <div className="modal-body">
                <p className="confirm-message">
                  ¿Está seguro de eliminar la materia <strong>{subjectToDelete.name}</strong>?
                  <br /><small>Esta acción no se puede deshacer.</small>
                </p>
                <div className="modal-actions">
                  <button type="button" className="cancel-button" onClick={closeDeleteModal}>Cancelar</button>
                  <button type="button" className="delete-confirm-button" onClick={deleteSubject}>🗑️ Eliminar</button>
                </div>
              </div>
            </div>
          </Overlay>
        )}

        {/* Custom Notification System */}
        {notif.show && (
          <Overlay className="notification-overlay">
            <div className={`notification-content${notif.type === 'success' ? ' notification-success' : ''}${notif.type === 'error' ? ' notification-error' : ''}`}
              onClick={(e) => e.stopPropagation()}>
              <div className="notification-icon">
                {notif.type === 'success' && <span>✓</span>}
                {notif.type === 'error' && <span>!</span>}
              </div>
              <div className="notification-body">
                <strong>{notif.type === 'success' ? '¡Operación exitosa!' : '¡Atención!'}</strong>
                <span>{notif.message}</span>
              </div>
              <button className="notification-close" onClick={hideNotification}>✕</button>
            </div>
          </Overlay>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Cargando materias...</p>
          </div>
        )}
      </div>
    </div>
  );
}