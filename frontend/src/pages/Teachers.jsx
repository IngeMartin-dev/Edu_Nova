import { useEffect, useRef, useState } from 'react';
import { api, imageUrl } from '../api/client.js';
import '../styles/pages/teachers.css';
import Overlay from '../components/Overlay.jsx';

const getSubjectAcronym = (subject) => {
  if (subject.code && subject.code.trim().length > 0) return subject.code.trim().toUpperCase();
  const cleaned = (subject.name || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
  if (!cleaned) return '';
  return cleaned.replace(/\s+/g, ' ').substring(0, 3);
};
const getSubjectLevelClass = (subject) =>
  (subject.level || '').toLowerCase() === 'primaria' ? 'subject-chip-primaria' : 'subject-chip-bachillerato';
const errMsg = (err, fallback) => err?.message || fallback;

const EMPTY_EDIT = { name: '', surname: '', username: '', email: '', newPassword: '' };

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEditTeacher, setSavingEditTeacher] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState(null);
  const [formName, setFormName] = useState('');
  const [formSurname, setFormSurname] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formConfirmPassword, setFormConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [teacherToEdit, setTeacherToEdit] = useState(null);
  const [editTeacherForm, setEditTeacherForm] = useState(EMPTY_EDIT);

  const [selectedTeacherForAssignment, setSelectedTeacherForAssignment] = useState(null);

  const [notif, setNotif] = useState({ show: false, type: null, message: '' });
  const notifTimer = useRef(null);
  const modalErrTimer = useRef(null);
  const [formEmailError, setFormEmailError] = useState(null);
  const [formUsernameError, setFormUsernameError] = useState(null);
  const [formModalError, setFormModalError] = useState(null);
  const [formPasswordError, setFormPasswordError] = useState(null);

  const showSuccess = (message) => {
    clearTimeout(notifTimer.current);
    setNotif({ show: true, type: 'success', message });
    notifTimer.current = setTimeout(() => setNotif((n) => ({ ...n, show: false })), 3500);
  };
  const showError = (message) => {
    clearTimeout(notifTimer.current);
    setNotif({ show: true, type: 'error', message });
    notifTimer.current = setTimeout(() => setNotif((n) => ({ ...n, show: false })), 4000);
  };

  const loadTeachers = async () => {
    setLoading(true);
    try { setTeachers(await api.get('/teachers')); } catch (err) { console.error('Failed to load teachers', err); }
    setLoading(false);
  };
  const loadSubjects = async () => {
    try { setAllSubjects(await api.get('/subjects')); } catch (err) { console.error('[Teachers] Failed to load subjects', err); setAllSubjects([]); }
  };

  useEffect(() => {
    loadTeachers(); loadSubjects();
    return () => { clearTimeout(notifTimer.current); clearTimeout(modalErrTimer.current); };
    // eslint-disable-next-line
  }, []);

  const getTeacherSubjectObjects = (teacher) => allSubjects.filter((s) => s.teacherId === teacher.id || s.teacher === teacher.id);
  const primarySubjects = allSubjects.filter((s) => (s.level || '').toLowerCase() === 'primaria');
  const highSchoolSubjects = allSubjects.filter((s) => (s.level || '').toLowerCase() === 'bachillerato');

  const getFilteredTeachers = () => {
    const term = searchTerm.toLowerCase();
    const filtered = term
      ? teachers.filter((t) => t.name.toLowerCase().includes(term) || t.surname.toLowerCase().includes(term) || t.email.toLowerCase().includes(term) || (t.username && t.username.toLowerCase().includes(term)))
      : teachers;
    return [...filtered].sort((a, b) => {
      const aHas = getTeacherSubjectObjects(a).length > 0;
      const bHas = getTeacherSubjectObjects(b).length > 0;
      if (aHas !== bHas) return aHas ? 1 : -1;
      return `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, 'es');
    });
  };

  const getProfilePictureUrl = (teacher) => {
    const pp = (teacher.profilePicture || '').trim();
    if (!pp) return '';
    return imageUrl(pp);
  };
  const getTeacherFullName = (t) => `${t.name} ${t.surname}`;

  // ---- localStorage de rango de grados
  const clearPersistedTeacherGradeRange = () => { try { localStorage.removeItem('selectedTeacherGradeRange'); } catch { /* */ } };
  const saveTeacherGradeRange = (teacher) => {
    const assigned = getTeacherSubjectObjects(teacher).filter((s) => s.gradeMin != null && s.gradeMax != null);
    if (assigned.length === 0) { clearPersistedTeacherGradeRange(); return; }
    const min = Math.min(...assigned.map((s) => s.gradeMin));
    const max = Math.max(...assigned.map((s) => s.gradeMax));
    try { localStorage.setItem('selectedTeacherGradeRange', JSON.stringify({ min, max })); } catch { /* */ }
  };

  // ---- Modal agregar
  const openAddModal = () => {
    setFormName(''); setFormSurname(''); setFormEmail(''); setFormUsername('');
    setFormPassword(''); setFormConfirmPassword('');
    setShowPassword(false); setShowConfirmPassword(false);
    setFormEmailError(null); setFormUsernameError(null); setFormModalError(null); setFormPasswordError(null);
    setShowAddModal(true);
  };
  const closeAddModal = () => {
    setShowAddModal(false);
    setFormPasswordError(null); setFormEmailError(null); setFormUsernameError(null); setFormModalError(null);
  };

  const createTeacher = async (e) => {
    e?.preventDefault();
    setSaving(true);
    const name = formName.trim();
    const surname = formSurname.trim();
    const email = formEmail.trim();
    const username = formUsername.trim();
    const password = formPassword;
    if (!name || !surname || !email || !password) {
      showError('Por favor completa los campos obligatorios (nombre, apellido, correo y contraseña)');
      setSaving(false); return;
    }
    if (password !== formConfirmPassword) {
      setFormPasswordError('La contraseña no coincide');
      setTimeout(() => { document.getElementById('teacherConfirmPassword')?.focus(); }, 0);
      setSaving(false); return;
    }
    if (password.length < 6) {
      showError('La contraseña debe tener al menos 6 caracteres');
      setSaving(false); return;
    }
    const payload = { name, surname, email, username, password, subjectCodes: [] };
    setFormEmailError(null); setFormUsernameError(null);
    try {
      await api.post('/teachers', payload);
      setSaving(false);
      closeAddModal();
      showSuccess('Profesor y materias asignadas creados correctamente');
      loadTeachers();
    } catch (err) {
      console.error('Failed to create teacher', err);
      setSaving(false);
      let backendMsg = errMsg(err, 'Error al crear el profesor');
      let inline = false;
      if (typeof backendMsg === 'string') {
        const lower = backendMsg.toLowerCase();
        if (lower.includes('email already in use') || lower.includes('email already')) {
          backendMsg = 'El correo ya está en uso';
          setFormEmailError(backendMsg); inline = true;
          setTimeout(() => { document.getElementById('teacherEmail')?.focus(); }, 0);
        } else if (lower.includes('username already in use') || lower.includes('username already')) {
          backendMsg = 'El nombre de usuario ya está en uso';
          setFormUsernameError(backendMsg); inline = true;
          setTimeout(() => { document.getElementById('teacherUsername')?.focus(); }, 0);
        }
      }
      if (!inline) {
        setFormModalError(backendMsg);
        clearTimeout(modalErrTimer.current);
        modalErrTimer.current = setTimeout(() => setFormModalError(null), 5000);
      }
    }
  };

  // ---- Modal editar
  const openEditTeacher = (teacher) => {
    setTeacherToEdit(teacher);
    setEditTeacherForm({ name: teacher.name, surname: teacher.surname, username: teacher.username || '', email: teacher.email, newPassword: '' });
    setShowEditModal(true);
  };
  const closeEditModal = () => {
    setShowEditModal(false); setTeacherToEdit(null); setSavingEditTeacher(false); setEditTeacherForm(EMPTY_EDIT);
  };
  const setEditField = (k) => (e) => setEditTeacherForm((f) => ({ ...f, [k]: e.target.value }));

  const saveTeacherEdit = async (e) => {
    e?.preventDefault();
    if (!teacherToEdit) return;
    const name = editTeacherForm.name.trim();
    const surname = editTeacherForm.surname.trim();
    const username = editTeacherForm.username.trim();
    const email = editTeacherForm.email.trim();
    const newPassword = editTeacherForm.newPassword.trim();
    if (!name || !surname || !username || !email) { showError('Completa nombre, apellido, usuario y correo'); return; }
    if (newPassword && newPassword.length < 6) { showError('La contraseña debe tener al menos 6 caracteres'); return; }
    setSavingEditTeacher(true);
    const updatedUser = { name, surname, username, email, enable: teacherToEdit.enable !== false };
    try {
      await api.put(`/users/${teacherToEdit.id}`, updatedUser);
    } catch (err) {
      console.error('Failed to update teacher', err);
      showError(errMsg(err, 'No se pudo actualizar el profesor'));
      setSavingEditTeacher(false);
      return;
    }
    if (newPassword) {
      try {
        await api.post(`/users/${teacherToEdit.id}/password/reset`, { newPassword });
      } catch (err) {
        console.error('Failed to update teacher password', err);
        showError('Perfil actualizado, pero no se pudo cambiar la contraseña');
        closeEditModal(); loadTeachers();
        return;
      }
    }
    showSuccess('Profesor actualizado correctamente');
    closeEditModal(); loadTeachers();
  };

  // ---- Asignación
  const selectTeacherForAssignment = (teacher) => {
    setSelectedTeacherForAssignment(teacher);
    if (getTeacherSubjectObjects(teacher).length > 0) saveTeacherGradeRange(teacher);
    else clearPersistedTeacherGradeRange();
  };
  const clearTeacherSelection = () => setSelectedTeacherForAssignment(null);

  const assignSubjectToSelectedTeacher = async (subject) => {
    if (!selectedTeacherForAssignment) return;
    const teacher = selectedTeacherForAssignment;
    const teacherId = teacher.id;
    if (subject.teacherId && subject.teacherId !== teacherId) return;
    try {
      await api.put(`/subjects/${subject.id}/teacher/${teacherId}`, {});
      try {
        localStorage.setItem(`teacher_assignment_${teacherId}_${subject.id}`, JSON.stringify({
          subjectId: subject.id, teacherId, subjectName: subject.name, level: subject.level,
          gradeMin: subject.gradeMin, gradeMax: subject.gradeMax, assignedAt: new Date().toISOString(),
        }));
      } catch { /* */ }
      showSuccess(`Materia ${subject.name} asignada a ${teacher.name} ${teacher.surname}`);
      loadSubjects(); loadTeachers(); clearTeacherSelection();
    } catch (err) {
      console.error('Error al asignar materia', err);
      showError('No se pudo asignar la materia. Intenta nuevamente.');
    }
  };

  const unassignSubject = async (subject, teacher) => {
    try {
      await api.del(`/subjects/${subject.id}/teacher`);
      const remaining = getTeacherSubjectObjects(teacher).filter((s) => s.id !== subject.id);
      if (remaining.length > 0) saveTeacherGradeRange(teacher); else clearPersistedTeacherGradeRange();
      showSuccess(`Materia ${subject.name} desasignada de ${teacher.name} ${teacher.surname}`);
      loadSubjects(); loadTeachers();
    } catch (err) {
      console.error('Error al quitar materia', err);
      showError('No se pudo quitar la materia. Intenta de nuevo.');
    }
  };

  // ---- Eliminar
  const deleteTeacher = (teacher) => { setTeacherToDelete(teacher); setShowConfirmDelete(true); };
  const cancelDeleteTeacher = () => { setShowConfirmDelete(false); setTeacherToDelete(null); };
  const confirmDeleteTeacher = async () => {
    if (!teacherToDelete) { setShowConfirmDelete(false); return; }
    const teacherId = teacherToDelete.id;
    const teacherName = `${teacherToDelete.name} ${teacherToDelete.surname}`;
    try {
      await api.del(`/teachers/${teacherId}`);
      setTeachers((ts) => ts.filter((t) => t.id !== teacherId));
      showSuccess(`Profesor ${teacherName} eliminado correctamente`);
    } catch (err) {
      console.error('[DELETE teacher error]', err);
      showError(errMsg(err, 'Error al eliminar el profesor'));
    }
    setShowConfirmDelete(false); setTeacherToDelete(null);
  };

  const subjectItem = (subject, levelKey) => {
    const assignedTo = subject.teacherId || subject.teacher;
    const selId = selectedTeacherForAssignment?.id;
    const clickable = !!selectedTeacherForAssignment && !assignedTo;
    return (
      <div key={subject.id}
        className={`subject-item${clickable ? ' clickable' : ''}${assignedTo === selId && assignedTo ? ' assigned' : ''}${assignedTo && assignedTo !== selId ? ' disabled' : ''}`}
        onClick={() => { if (clickable) assignSubjectToSelectedTeacher(subject); }}>
        <div className="subject-main">
          <span className="subject-name">{subject.name}</span>
          <span className={`subject-code-pill ${getSubjectLevelClass(subject)}`}>{getSubjectAcronym(subject)}</span>
        </div>
        <div className="subject-meta">
          <span className={`subject-badge ${levelKey}`}>{levelKey === 'bachillerato' ? 'Bachillerato' : 'Primaria'}</span>
          {subject.gradeMin != null && subject.gradeMax != null && (
            <span className="subject-range">Grados {subject.gradeMin}-{subject.gradeMax}</span>
          )}
        </div>
      </div>
    );
  };

  const filteredTeachers = getFilteredTeachers();

  return (
    <div className="pg-teachers">
      <div className="teachers-container">
        <div className="teachers-header">
          <h2>Gestión de Profesores y Materias</h2>
          <button className="add-teacher-button" onClick={openAddModal}>
            ➕ Agregar Profesor
          </button>
        </div>

        {loading ? (
          <div className="teachers-loading">
            <div className="spinner"></div>
            <p>Cargando profesores...</p>
          </div>
        ) : (
          <>
            <div className="search-bar">
              <span className="material-icons search-icon">search</span>
              <input type="text" id="teacher-search" name="teacherSearch" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar profesor..." autoComplete="off" />
            </div>

            <div className="two-columns">
              <div className="column">
                <h3>Profesores</h3>
                <div className="teachers-list">
                  {filteredTeachers.map((teacher) => {
                    const subs = getTeacherSubjectObjects(teacher);
                    const pic = getProfilePictureUrl(teacher);
                    return (
                      <div key={teacher.id}
                        className={`teacher-item a11y-clickable${selectedTeacherForAssignment?.id === teacher.id ? ' teacher-selected' : ''}`}
                        role="button" tabIndex={0} aria-label={'Seleccionar docente ' + teacher.name}
                        onClick={() => selectTeacherForAssignment(teacher)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') selectTeacherForAssignment(teacher);
                          else if (e.key === ' ') { selectTeacherForAssignment(teacher); e.preventDefault(); }
                        }}>
                        <div className="teacher-item-actions">
                          <button type="button" className="icon-action-button edit-icon-button" onClick={(e) => { openEditTeacher(teacher); e.stopPropagation(); }} title="Editar profesor">✎</button>
                          <button type="button" className="icon-action-button delete-icon-button" onClick={(e) => { deleteTeacher(teacher); e.stopPropagation(); }} title="Eliminar profesor">×</button>
                        </div>
                        <div className="teacher-info">
                          {pic ? (
                            <img className="teacher-photo" src={pic} alt={getTeacherFullName(teacher)} />
                          ) : (
                            <div className="teacher-avatar">{teacher.name.charAt(0)}{teacher.surname.charAt(0)}</div>
                          )}
                          <div className="teacher-details">
                            <div className="teacher-name-row">
                              <strong className="teacher-name">{teacher.name} {teacher.surname}</strong>
                            </div>
                            <span className="teacher-email">{teacher.email}</span>
                            <span className="teacher-username">{teacher.username || 'Sin usuario'}</span>
                            <div className="assigned-subjects">
                              <span className="assigned-subjects-label">Materias asignadas</span>
                              {subs.length > 0 ? (
                                <div className="teacher-subject-chips">
                                  {subs.map((subject) => (
                                    <span key={subject.id} className={`subject-chip ${getSubjectLevelClass(subject)}`} title={subject.name}
                                      onClick={(e) => { unassignSubject(subject, teacher); e.stopPropagation(); }}>
                                      {getSubjectAcronym(subject)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="empty-subjects">Sin materias asignadas</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {teachers.length === 0 && (
                    <div className="empty-state">
                      <span className="empty-icon">📭</span>
                      <p className="empty-text">No hay profesores registrados</p>
                      <small>Agrega el primer profesor con el boton superior</small>
                    </div>
                  )}
                </div>
              </div>

              <div className="column">
                <h3>Materias</h3>
                {selectedTeacherForAssignment && (
                  <div className="assignment-hint">
                    Profesor seleccionado: <strong>{selectedTeacherForAssignment.name} {selectedTeacherForAssignment.surname}</strong>. Haz clic en una materia para asignarla.
                    <button type="button" className="cancel-btn small" onClick={clearTeacherSelection}>Cancelar</button>
                  </div>
                )}
                <div className="subjects-list">
                  <div className="materia-columna">
                    <div className="columna-header bachillerato">
                      <span className="icono">🎓</span>
                      <h4>Bachillerato</h4>
                    </div>
                    <div className="columna-body">
                      {highSchoolSubjects.map((s) => subjectItem(s, 'bachillerato'))}
                      {highSchoolSubjects.length === 0 && <p className="empty-text">Sin materias de bachillerato</p>}
                    </div>
                  </div>
                  <div className="materia-columna">
                    <div className="columna-header primaria">
                      <span className="icono">🎒</span>
                      <h4>Primaria</h4>
                    </div>
                    <div className="columna-body">
                      {primarySubjects.map((s) => subjectItem(s, 'primaria'))}
                      {primarySubjects.length === 0 && <p className="empty-text">Sin materias de primaria</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <Overlay className="modal-overlay">
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-text">
                <h3>Agregar Nuevo Profesor</h3>
                <p className="modal-subtitle">Completa los datos del docente y asigna las materias con estilo profesional.</p>
              </div>
              <button className="close-button" onClick={closeAddModal}>✕</button>
            </div>
            <div className="modal-body">
              {formModalError && <div className="modal-form-error">{formModalError}</div>}
              <form autoComplete="off" noValidate onSubmit={createTeacher}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="teacherName">Nombre *</label>
                    <input type="text" id="teacherName" name="name" value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="Ingrese el nombre" autoComplete="off" className="form-input" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="teacherSurname">Apellido *</label>
                    <input type="text" id="teacherSurname" name="surname" value={formSurname} onChange={(e) => setFormSurname(e.target.value)} required placeholder="Ingrese el apellido" autoComplete="off" className="form-input" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="teacherEmail">Correo *</label>
                    <input type="email" id="teacherEmail" name="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required placeholder="correo@edunova.edu.co" autoComplete="off" className={`form-input${formEmailError ? ' input-error' : ''}`} />
                    {formEmailError && <div className="field-error">{formEmailError}</div>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="teacherUsername">Usuario</label>
                    <input type="text" id="teacherUsername" name="username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} placeholder="usuario.profesor" autoComplete="off" className={`form-input${formUsernameError ? ' input-error' : ''}`} />
                    {formUsernameError && <div className="field-error">{formUsernameError}</div>}
                    <small>Si se deja vacío, se usará el correo antes del @</small>
                  </div>
                </div>

                <div className="password-section">
                  <h4>Credenciales de acceso</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="teacherPassword">Contraseña *</label>
                      <div className="input-group">
                        <span className="material-icons input-icon">lock</span>
                        <input type={showPassword ? 'text' : 'password'} id="teacherPassword" name="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6} placeholder="Ingrese su contraseña" autoComplete="new-password" className="form-input" />
                        <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)} title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                          <span className="material-icons">{showPassword ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="teacherConfirmPassword">Confirmar Contraseña *</label>
                      <div className="input-group">
                        <span className="material-icons input-icon">lock</span>
                        <input type={showConfirmPassword ? 'text' : 'password'} id="teacherConfirmPassword" name="confirmPassword" value={formConfirmPassword} onChange={(e) => setFormConfirmPassword(e.target.value)} required placeholder="Confirma tu contraseña" autoComplete="new-password" className="form-input" />
                        <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((v) => !v)} title={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                          <span className="material-icons">{showConfirmPassword ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      </div>
                      {formPasswordError && <div className="field-error animated-error">{formPasswordError}</div>}
                    </div>
                  </div>
                  <small className="security-note">La contraseña será cifrada antes de guardarse.</small>
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={closeAddModal}>Cancelar</button>
                  <button type="submit" className="confirm-btn" disabled={saving}>
                    {saving ? 'Guardando...' : 'Guardar Profesor'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Overlay>
      )}

      {showEditModal && teacherToEdit && (
        <Overlay className="modal-overlay">
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-text">
                <h3>Editar Profesor</h3>
                <p className="modal-subtitle">Actualiza usuario, correo y contraseña del docente.</p>
              </div>
              <button className="close-button" onClick={closeEditModal}>✕</button>
            </div>
            <div className="modal-body">
              <form autoComplete="off" noValidate onSubmit={saveTeacherEdit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="editTeacherName">Nombre *</label>
                    <input type="text" id="editTeacherName" name="editName" value={editTeacherForm.name} onChange={setEditField('name')} required className="form-input" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="editTeacherSurname">Apellido *</label>
                    <input type="text" id="editTeacherSurname" name="editSurname" value={editTeacherForm.surname} onChange={setEditField('surname')} required className="form-input" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="editTeacherUsername">Usuario *</label>
                    <input type="text" id="editTeacherUsername" name="editUsername" value={editTeacherForm.username} onChange={setEditField('username')} required className="form-input" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="editTeacherEmail">Correo *</label>
                    <input type="email" id="editTeacherEmail" name="editEmail" value={editTeacherForm.email} onChange={setEditField('email')} required className="form-input" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label htmlFor="editTeacherPassword">Nueva contraseña</label>
                    <input type="password" id="editTeacherPassword" name="editPassword" value={editTeacherForm.newPassword} onChange={setEditField('newPassword')} placeholder="Dejar vacío para mantener la contraseña actual" autoComplete="new-password" className="form-input" />
                    <small>La contraseña debe tener al menos 6 caracteres si decides cambiarla.</small>
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={closeEditModal} disabled={savingEditTeacher}>Cancelar</button>
                  <button type="submit" className="confirm-btn" disabled={savingEditTeacher}>
                    {savingEditTeacher ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Overlay>
      )}

      {showConfirmDelete && teacherToDelete && (
        <Overlay className="modal-overlay" onClick={cancelDeleteTeacher}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-header-text">
                <h3>Confirmar eliminación</h3>
                <p className="modal-subtitle">¿Seguro que deseas eliminar al profesor {teacherToDelete.name} {teacherToDelete.surname}?</p>
              </div>
              <button className="close-button" onClick={cancelDeleteTeacher}>✕</button>
            </div>
            <div className="modal-body confirm-modal-body">
              <p className="confirm-message">Esta acción no se puede deshacer.</p>
              <div className="modal-actions confirm-actions">
                <button type="button" className="cancel-btn secondary" onClick={cancelDeleteTeacher}>Cancelar</button>
                <button type="button" className="confirm-btn danger" onClick={confirmDeleteTeacher}>Eliminar</button>
              </div>
            </div>
          </div>
        </Overlay>
      )}

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
  );
}