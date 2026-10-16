import { useState } from 'react';
import '../styles/pages/parents.css';
import { api } from '../api/client.js';
import { usePageNotification } from '../components/PageNotification.jsx';
import Overlay from '../components/Overlay.jsx';

const ALL_GRADES = Array.from({ length: 11 }, (_, i) => `Grado ${i + 1}º`);
const CLASSROOMS = ['Salon A', 'Salon B'];
const bySurname = (a, b) => (a.surname || '').toLowerCase().localeCompare((b.surname || '').toLowerCase(), 'es');
const emptyEdit = { name: '', email: '', surname: '', newPassword: '' };
const emptyNew = { name: '', surname: '', email: '', password: '', grade: '', classGroup: '' };

/** Padres de familia: vincular estudiantes con padres por grado y salón (parents del original). */
export default function Parents() {
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [allStudents, setAllStudents] = useState([]);
  const [allParents, setAllParents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedParent, setSelectedParent] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const note = usePageNotification('¡Exito!');

  const [editingParent, setEditingParent] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [parentSaving, setParentSaving] = useState(false);
  const [parentToDelete, setParentToDelete] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(emptyNew);

  const loadData = async (grade = selectedGrade, classroom = selectedClassroom) => {
    if (!grade || !classroom) return;
    setIsLoading(true);
    try {
      const r = await api.get('/parents/by-grade-classroom', { grade, classroom });
      setAllStudents((r.students || []).map((s) => ({
        id: s.id, name: s.name, surname: s.surname, documentNumber: s.documentNumber, grade: s.grade, classGroup: s.classGroup,
        hasParent: s.hasParent || false, parentId: s.parentId || null, parentName: s.parentName || null,
      })).sort((a, b) => (a.hasParent !== b.hasParent ? (a.hasParent ? 1 : -1) : bySurname(a, b))));
      const mapped = (r.parents || []).map((p) => ({
        id: p.id, name: p.name, surname: p.surname, username: p.username, email: p.email, hasStudent: p.hasStudent || false,
        assignedStudentId: p.assignedStudentId || null, assignedStudentName: p.assignedStudentName || null,
      }));
      setAllParents([...mapped.filter((p) => !p.hasStudent).sort(bySurname), ...mapped.filter((p) => p.hasStudent).sort(bySurname)]);
    } catch {
      setAllStudents([]); setAllParents([]);
      note.error('Error al cargar los datos de padres de familia');
    }
    setIsLoading(false);
  };

  const selectGradeAndClassroom = (grade, classroom) => {
    if (selectedGrade === grade && selectedClassroom === classroom) return;
    setSelectedGrade(grade); setSelectedClassroom(classroom);
    setSelectedStudent(null); setSelectedParent(null);
    loadData(grade, classroom);
  };

  const selectStudent = (student) => {
    if (student.hasParent) return;
    setSelectedStudent(selectedStudent?.id === student.id ? null : student);
    setSelectedParent(null);
  };

  const assignParentToStudent = async (student, parent) => {
    try {
      await api.post('/parents/assign', { studentId: student.id, parentId: parent.id });
      note.success('Padre de familia asignado correctamente');
      setSelectedStudent(null); setSelectedParent(null);
      loadData();
    } catch { note.error('Error al asignar el padre de familia'); setSelectedParent(null); }
  };
  const selectParent = (parent) => {
    if (selectedStudent === null) { note.error('Selecciona primero un estudiante'); return; }
    if (parent.hasStudent) return;
    const next = selectedParent?.id === parent.id ? null : parent;
    setSelectedParent(next);
    if (selectedStudent && next && selectedStudent.id !== next.assignedStudentId) assignParentToStudent(selectedStudent, next);
  };

  const unassignParent = async (student) => {
    if (!student.hasParent || !student.parentId) return;
    try {
      await api.del('/parents/unassign', { studentId: student.id, parentId: student.parentId });
      note.success('Asignacion removida correctamente');
      if (selectedStudent?.id === student.id) setSelectedStudent(null);
      loadData();
    } catch { note.error('Error al remover la asignacion'); }
  };

  const startEditParent = (p) => { setEditingParent(p); setEditForm({ name: p.name || '', email: p.email || '', surname: p.surname || '', newPassword: '' }); setShowEdit(true); };
  const closeEditModal = () => { setShowEdit(false); setEditingParent(null); setEditForm(emptyEdit); setParentSaving(false); };
  const saveParentEdit = async (parent) => {
    setParentSaving(true);
    const name = editForm.name.trim(); const surname = editForm.surname.trim(); const email = editForm.email.trim(); const newPassword = editForm.newPassword.trim();
    try {
      await api.put(`/users/${parent.id}`, { name, surname, email, username: email, enable: true });
    } catch (e) { note.error(e?.message || 'No se pudo actualizar el padre de familia'); setParentSaving(false); return; }
    if (newPassword) {
      try { await api.post(`/users/${parent.id}/password/reset`, { newPassword }); note.success('Padre de familia actualizado correctamente'); closeEditModal(); loadData(); }
      catch (e) { note.error(e?.message || 'Perfil actualizado, pero no se pudo cambiar la contraseña'); closeEditModal(); loadData(); setParentSaving(false); }
    } else { note.success('Padre de familia actualizado correctamente'); closeEditModal(); loadData(); }
  };

  const confirmDelete = async () => {
    if (!parentToDelete) return;
    const id = parentToDelete.id;
    setShowDeleteConfirm(false);
    try { await api.del(`/users/${id}`); note.success('Padre de familia eliminado correctamente'); loadData(); }
    catch (e) { note.error(e?.message || 'No se pudo eliminar el padre de familia'); }
    setParentToDelete(null);
  };

  const openCreate = () => { setNewForm({ ...emptyNew, grade: selectedGrade || '', classGroup: selectedClassroom || '' }); setCreating(false); setShowCreate(true); };
  const createParent = async () => {
    setCreating(true);
    const name = newForm.name.trim(); const surname = newForm.surname.trim(); const email = newForm.email.trim(); const password = newForm.password;
    const fail = (m) => { note.error(m); setCreating(false); };
    if (!name || !surname || !email || !password) return fail('Completa todos los campos');
    if (name.length > 100) return fail('El nombre no puede superar 100 caracteres');
    if (surname.length > 100) return fail('El apellido no puede superar 100 caracteres');
    if (email.length > 200) return fail('El correo no puede superar 200 caracteres');
    if (password.length < 6 || password.length > 255) return fail('La contraseña debe tener al menos 6 caracteres y no más de 255 caracteres');
    try {
      await api.post('/parents', { name, surname, email, password, grade: newForm.grade, classroom: newForm.classGroup });
      note.success('Padre de familia creado correctamente');
      setShowCreate(false); setCreating(false); loadData();
    } catch (e) { fail(e?.message || 'No se pudo crear el padre de familia'); }
  };

  const availableStudents = allStudents.filter((s) => !s.hasParent).length;
  const availableParents = allParents.filter((p) => !p.hasStudent).length;
  const set = (setter, form) => (k) => (e) => setter({ ...form, [k]: e.target.value });

  return (
    <div className="pg-parents">
      <div className="parents-container">
        <div className="parents-header"><h2>Padres de Familia</h2></div>

        <div className="grades-sidebar-like">
          <div className="grades-row">
            {ALL_GRADES.map((grade) => (
              <div key={grade} className="grade-section">
                <h3>{grade}</h3>
                <div className="classrooms">
                  {CLASSROOMS.map((c) => (
                    <button key={c} className={`classroom-btn${selectedGrade === grade && selectedClassroom === c ? ' selected' : ''}`} onClick={() => selectGradeAndClassroom(grade, c)}>{c}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="right-content">
          {(!selectedGrade || !selectedClassroom) && (
            <div className="parents-placeholder">
              <div className="placeholder-content">
                <span className="placeholder-icon">👨‍👩‍👧‍👦</span>
                <h3>Selecciona un grado y salón</h3>
                <p>Elige un grado y salón de la lista superior para ver los estudiantes y padres de familia.</p>
              </div>
            </div>
          )}

          {selectedGrade && selectedClassroom && isLoading && (
            <div className="loading-indicator"><div className="spinner" /><p>Cargando datos...</p></div>
          )}

          {selectedGrade && selectedClassroom && !isLoading && (
            <>
              <div className={`selection-hint${selectedStudent === null && selectedParent === null ? ' hidden' : ''}`}>
                <span className="hint-icon">ℹ️</span>
                <strong>Instrucciones:</strong> Selecciona un estudiante de la lista izquierda y luego un padre de la lista derecha para vincularlos.
                {selectedStudent !== null && <span className="hint-selected">Estudiante: <strong>{selectedStudent?.surname} {selectedStudent?.name}</strong></span>}
              </div>

              <div className="assign-section">
                <button className="link-btn add-parent-btn" onClick={openCreate}>+ Añadir Padre de Familia</button>
                {selectedStudent !== null && <button className="link-btn cancel-btn" onClick={() => { setSelectedStudent(null); setSelectedParent(null); }}>Cancelar selección</button>}
              </div>

              {allParents.length === 0 && (
                <div className="no-assignments-banner">
                  <span className="no-assignments-icon">ℹ️</span>
                  <div>
                    <strong>No hay padres de familia en este salón</strong>
                    <p>Aún no se han creado padres de familia para este grado y salón. Puedes crearlos con el botón "+ Añadir Padre de Familia".</p>
                  </div>
                </div>
              )}

              <div className="parents-grid">
                <div className="parents-column students-column">
                  <div className="column-header">
                    <h3 className="column-title">Estudiantes</h3>
                    <div className="column-badges">
                      <span className="column-badge has-parents">🎓 {allStudents.length}</span>
                      <span className="column-badge">Disponibles {availableStudents}</span>
                    </div>
                  </div>
                  {allStudents.length === 0 && <div className="empty-column"><span className="empty-icon">📭</span><p>No hay estudiantes en este salón</p></div>}
                  <div className="people-list">
                    {allStudents.map((student) => (
                      <div key={student.id} className={`person-card student-card${selectedStudent?.id === student.id ? ' person-selected' : ''}${student.hasParent ? ' assigned' : ''}`} onClick={() => selectStudent(student)}>
                        <div className="person-avatar student-avatar">{student.surname.charAt(0)}{student.name.charAt(0)}</div>
                        <div className={`status-indicator ${student.hasParent ? 'status-green' : 'status-red'}`} />
                        <div className="person-info">
                          <div className="person-name">{student.surname} {student.name}</div>
                          <div className="person-detail">{student.documentNumber || 'Sin documento'}</div>
                        </div>
                        {student.hasParent && (
                          <div className="corner-actions">
                            <button className="icon-btn delete-btn" onClick={(e) => { unassignParent(student); e.stopPropagation(); }} title="Quitar padre de familia">✕</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="parents-column parents-column-content">
                  <div className="column-header">
                    <h3 className="column-title">Padres de Familia</h3>
                    <div className="column-badges">
                      <span className="column-badge has-parents">👥 {allParents.length}</span>
                      <span className="column-badge">Disponibles {availableParents}</span>
                    </div>
                  </div>
                  {allParents.length === 0 && <div className="empty-column"><span className="empty-icon">👥</span><p>No hay padres de familia en este salón</p></div>}
                  <div className="people-list">
                    {allParents.map((parent) => (
                      <div key={parent.id} className={`person-card parent-card${parent.hasStudent ? ' is-linked linked-card' : ' unlinked-card'}${parent.hasStudent || selectedStudent === null ? ' not-selectable' : ''}${selectedParent?.id === parent.id ? ' person-selected' : ''}`} onClick={() => selectParent(parent)}>
                        <div className="parent-card-top">
                          <div className={`person-avatar parent-avatar ${parent.hasStudent ? 'linked-avatar' : 'unlinked-avatar'}`}>{parent.surname.charAt(0)}{parent.name.charAt(0)}</div>
                          <div className={`status-indicator ${parent.hasStudent ? 'status-green' : 'status-amber'}`} />
                          <div className="parent-card-main">
                            <div className="parent-name-block">
                              <div className="person-name">{parent.surname} {parent.name}</div>
                              <div className="person-detail parent-email">{parent.email || 'Sin correo'}</div>
                            </div>
                            <div className="corner-actions parent-card-actions">
                              <button className="icon-btn edit-btn" onClick={(e) => { startEditParent(parent); e.stopPropagation(); }} title="Editar padre de familia">✎</button>
                              <button className="icon-btn delete-btn" onClick={(e) => { setParentToDelete(parent); setShowDeleteConfirm(true); e.stopPropagation(); }} title="Eliminar padre de familia">✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {showEdit && (
            <Overlay className="modal-overlay" onClick={(e) => { closeEditModal(); e.stopPropagation(); }}>
              <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
                <div className="edit-modal-header">
                  <div className="edit-modal-header-text">
                    <h3>Editar padre de familia</h3>
                    <p>Actualiza la información de <strong>{editingParent?.surname} {editingParent?.name}</strong></p>
                  </div>
                  <button className="edit-modal-close" onClick={closeEditModal}>✕</button>
                </div>
                <div className="edit-modal-body">
                  <div className="form-group"><label htmlFor="edit-parent-name">Nombre</label><input id="edit-parent-name" type="text" value={editForm.name} onChange={set(setEditForm, editForm)('name')} placeholder="Nombre" /></div>
                  <div className="form-group"><label htmlFor="edit-parent-surname">Apellido</label><input id="edit-parent-surname" type="text" value={editForm.surname} onChange={set(setEditForm, editForm)('surname')} placeholder="Apellido" /></div>
                  <div className="form-group"><label htmlFor="edit-parent-email">Correo electrónico</label><input id="edit-parent-email" type="email" value={editForm.email} onChange={set(setEditForm, editForm)('email')} placeholder="correo@ejemplo.com" /></div>
                  <div className="form-group"><label htmlFor="edit-parent-password">Nueva Contraseña (opcional)</label><input id="edit-parent-password" type="password" value={editForm.newPassword} onChange={set(setEditForm, editForm)('newPassword')} placeholder="Dejar vacío para mantener la actual" autoComplete="new-password" /></div>
                </div>
                <div className="edit-modal-footer">
                  <button className="edit-modal-btn secondary" onClick={closeEditModal}>Cancelar</button>
                  <button className="edit-modal-btn primary" disabled={parentSaving} onClick={() => saveParentEdit(editingParent)}>{parentSaving ? 'Guardando...' : 'Guardar cambios'}</button>
                </div>
              </div>
            </Overlay>
          )}

          {showDeleteConfirm && parentToDelete && (
            <Overlay className="modal-overlay" onClick={() => { setShowDeleteConfirm(false); setParentToDelete(null); }}>
              <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header"><h3>Confirmar eliminación</h3><button className="close-button" onClick={() => { setShowDeleteConfirm(false); setParentToDelete(null); }}>✕</button></div>
                <div className="modal-body">
                  <p className="confirm-message">¿Estás seguro de eliminar al padre de familia <strong>{parentToDelete.surname} {parentToDelete.name}</strong>?</p>
                  <div className="modal-actions">
                    <button className="cancel-button" onClick={() => { setShowDeleteConfirm(false); setParentToDelete(null); }}>Cancelar</button>
                    <button className="delete-confirm-button" onClick={confirmDelete}>Eliminar</button>
                  </div>
                </div>
              </div>
            </Overlay>
          )}

          {showCreate && (
            <Overlay className="modal-overlay" onClick={() => { setShowCreate(false); setCreating(false); }}>
              <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
                <div className="edit-modal-header">
                  <div className="edit-modal-header-text"><h3>Nuevo Padre de Familia</h3><p>Crear un nuevo usuario como padre de familia</p></div>
                  <button className="edit-modal-close" onClick={() => { setShowCreate(false); setCreating(false); }}>✕</button>
                </div>
                <div className="edit-modal-body">
                  <div className="form-group"><label htmlFor="new-parent-name">Nombre</label><input id="new-parent-name" type="text" value={newForm.name} onChange={set(setNewForm, newForm)('name')} placeholder="Nombre" /></div>
                  <div className="form-group"><label htmlFor="new-parent-surname">Apellido</label><input id="new-parent-surname" type="text" value={newForm.surname} onChange={set(setNewForm, newForm)('surname')} placeholder="Apellido" /></div>
                  <div className="form-group"><label htmlFor="new-parent-email">Correo electrónico</label><input id="new-parent-email" type="email" value={newForm.email} onChange={set(setNewForm, newForm)('email')} placeholder="correo@ejemplo.com" /></div>
                  <div className="form-group"><label htmlFor="new-parent-password">Contraseña</label><input id="new-parent-password" type="password" value={newForm.password} onChange={set(setNewForm, newForm)('password')} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></div>
                  <div className="form-group">
                    <label htmlFor="new-parent-grade">Grado</label>
                    <select id="new-parent-grade" value={newForm.grade} onChange={set(setNewForm, newForm)('grade')}>
                      <option value="">Selecciona un grado</option>
                      {ALL_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="new-parent-classroom">Salón</label>
                    <select id="new-parent-classroom" value={newForm.classGroup} onChange={set(setNewForm, newForm)('classGroup')}>
                      <option value="">Selecciona un salón</option>
                      {CLASSROOMS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="edit-modal-footer">
                  <button className="edit-modal-btn secondary" onClick={() => { setShowCreate(false); setCreating(false); }}>Cancelar</button>
                  <button className="edit-modal-btn primary" disabled={creating} onClick={createParent}>{creating ? 'Creando...' : 'Crear padre'}</button>
                </div>
              </div>
            </Overlay>
          )}

          {note.node}
        </div>
      </div>
    </div>
  );
}