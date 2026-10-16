import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import '../styles/pages/students.css';
import Overlay from '../components/Overlay.jsx';

const GRADES = ['Grado 1º', 'Grado 2º', 'Grado 3º', 'Grado 4º', 'Grado 5º', 'Grado 6º', 'Grado 7º', 'Grado 8º', 'Grado 9º', 'Grado 10º', 'Grado 11º'];
const CLASSROOMS = ['Salon A', 'Salon B'];
const EMPTY_NEW = { name: '', surname: '', documentNumber: '', grade: '', classGroup: '' };

export default function Students() {
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPrintButton, setShowPrintButton] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [studentToEdit, setStudentToEdit] = useState(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudent, setNewStudent] = useState({ ...EMPTY_NEW });
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [sinSalonTodos, setSinSalonTodos] = useState([]);
  const [sinSalonGrade, setSinSalonGrade] = useState(null);
  const [asignando, setAsignando] = useState({});

  // Valores vigentes para los setTimeout (equivalente a leer el valor actual)
  const cur = useRef({});
  cur.current = { selectedGrade, selectedClassroom, sinSalonTodos, sinSalonGrade };

  useEffect(() => { loadSinSalon(); }, []); // eslint-disable-line

  // ── Estudiantes sin salón ──
  const loadSinSalon = async () => {
    try {
      const list = await api.get('/students');
      setSinSalonTodos((list || []).filter((st) =>
        st.active !== false && !['Salon A', 'Salon B'].includes((st.classGroup || '').trim()) && /^Grado \d+º$/.test(st.grade || '')));
    } catch {
      setSinSalonTodos([]);
    }
  };

  const sinSalonCount = (grade) => sinSalonTodos.filter((st) => st.grade === grade).length;

  const sinSalonDelGrado = sinSalonTodos
    .filter((st) => st.grade === sinSalonGrade)
    .sort((a, b) => (a.surname || '').localeCompare(b.surname || '', 'es'));

  const selectSinSalon = (grade) => {
    setSinSalonGrade(grade);
    setSelectedGrade(null);
    setSelectedClassroom(null);
    setStudents([]);
    loadSinSalon();
  };

  const asignarSalon = async (student, letra) => {
    if (asignando[student.id]) return;
    setAsignando((a) => ({ ...a, [student.id]: true }));
    try {
      await api.post('/school-year/advance/assign-classrooms', { assignments: { [student.id]: letra } });
      setAsignando((a) => ({ ...a, [student.id]: false }));
      const rest = cur.current.sinSalonTodos.filter((st) => st.id !== student.id);
      setSinSalonTodos(rest);
      showSuccessNotification(`${student.surname} ${student.name} pasó al Salon ${letra}`);
      if (rest.filter((st) => st.grade === (cur.current.sinSalonGrade || '')).length === 0) {
        setSinSalonGrade(null);
      }
    } catch (err) {
      setAsignando((a) => ({ ...a, [student.id]: false }));
      showErrorNotification(err?.status === 403
        ? 'Solo un administrador puede asignar salones.'
        : 'No se pudo asignar el salón. Intenta de nuevo.');
    }
  };

  const selectClassroom = (grade, classroom) => {
    setSinSalonGrade(null);
    setSelectedGrade(grade);
    setSelectedClassroom(classroom);
    fetchStudents(grade, classroom);
  };

  const selectedGradeWord = (() => {
    const nombres = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto',
      'séptimo', 'octavo', 'noveno', 'décimo', 'once'];
    const n = Number(((selectedGrade || '').match(/\d+/) || [])[0]);
    return nombres[n] || (selectedGrade || '');
  })();

  const showLoading = () => {
    const loadingElement = document.querySelector('.pg-students .loading-indicator');
    if (loadingElement) loadingElement.classList.remove('fade-out');
    hidePrintButtonDelayed();
    setIsLoading(true);
  };

  const hideLoading = () => {
    const loadingElement = document.querySelector('.pg-students .loading-indicator');
    if (loadingElement) {
      loadingElement.classList.add('fade-out');
      setTimeout(() => {
        setIsLoading(false);
        setTimeout(() => showPrintButtonDelayed(), 300);
      }, 600);
    } else {
      setIsLoading(false);
      setTimeout(() => showPrintButtonDelayed(), 300);
    }
  };

  const showPrintButtonDelayed = () => {
    const c = document.querySelector('.pg-students .print-button-container');
    if (c) c.classList.remove('slide-out');
    setShowPrintButton(true);
  };

  const hidePrintButtonDelayed = () => {
    const c = document.querySelector('.pg-students .print-button-container');
    if (c) {
      c.classList.add('slide-out');
      setTimeout(() => setShowPrintButton(false), 500);
    } else {
      setShowPrintButton(false);
    }
  };

  const fetchStudents = async (grade, classroom) => {
    showLoading();
    let baseList;
    try {
      const res = await api.get(`/students/grade/${encodeURIComponent(grade)}/class/${encodeURIComponent(classroom)}`);
      baseList = res || [];
    } catch (error) {
      console.error('Failed to fetch students:', error);
      setStudents([]);
      setTimeout(() => hideLoading(), 800);
      return;
    }
    if (baseList.length === 0) {
      setStudents([]);
      setTimeout(() => hideLoading(), 800);
      return;
    }
    try {
      const parentData = await api.get(`/parents/by-grade-classroom?grade=${encodeURIComponent(grade)}&classroom=${encodeURIComponent(classroom)}`);
      const parentMap = new Map();
      ((parentData && parentData.students) || []).forEach((s) => {
        parentMap.set(s.id, { hasParent: !!s.hasParent, parentName: s.parentName || null });
      });
      setStudents(baseList.map((s) => {
        const info = parentMap.get(s.id);
        return { ...s, hasParent: info ? info.hasParent : false, parentName: info ? info.parentName : null };
      }).sort((a, b) => (a.surname || '').toLowerCase().localeCompare((b.surname || '').toLowerCase())));
    } catch {
      setStudents(baseList.map((s) => ({ ...s, hasParent: false, parentName: null }))
        .sort((a, b) => (a.surname || '').toLowerCase().localeCompare((b.surname || '').toLowerCase())));
    }
    setTimeout(() => hideLoading(), 800);
  };

  const generateCleanHTML = () => `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lista de Estudiantes</title>
        <style>
          @page { margin: 15mm; size: A4; }
          * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: white; color: #000; }
          .header { text-align: center; margin-bottom: 30px; padding: 20px; border: 2px solid #3103fc; border-radius: 8px; background: #f8f8fa; }
          .school-name { font-size: 24px; font-weight: bold; color: #3103fc; margin-bottom: 10px; text-transform: uppercase; }
          .document-title { font-size: 18px; font-weight: 600; color: #333; margin-bottom: 5px; }
          .subtitle { font-size: 14px; color: #666; font-style: italic; }
          .info-section { margin: 20px 0; padding: 15px; background: #f8f8fa; border-radius: 5px; border: 1px solid #dfdee6; }
          .info-row-horizontal { display: flex; justify-content: space-between; font-size: 14px; gap: 20px; }
          .info-item { display: flex; align-items: center; gap: 5px; flex: 1; }
          .info-label { font-weight: bold; color: #3103fc; white-space: nowrap; }
          table { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-top: 20px; }
          th, td { border: 1px solid #000; padding: 10px; text-align: left; font-size: 12px; }
          th { background: #3103fc; color: white; font-weight: bold; text-align: center; text-transform: uppercase; }
          .number-col { text-align: center; font-weight: bold; width: 8%; }
          .name-col { width: 42%; }
          .doc-col { width: 25%; }
          .classroom-col { width: 15%; }
          .status-col { text-align: center; width: 10%; }
          tr:nth-child(even) { background-color: #f8f8fa; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="school-name">EDUNOVA</div>
          <div class="document-title">Lista de Estudiantes</div>
          <div class="subtitle">Sistema de Gestión Académica</div>
        </div>
        <div class="info-section">
          <div class="info-row-horizontal">
            <div class="info-item"><span class="info-label">Grado:</span><span>${selectedGrade}</span></div>
            <div class="info-item"><span class="info-label">Salón:</span><span>${selectedClassroom}</span></div>
            <div class="info-item"><span class="info-label">Total Estudiantes:</span><span>${students.length}</span></div>
            <div class="info-item"><span class="info-label">Fecha:</span><span>${new Date().toLocaleDateString('es-ES')}</span></div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="number-col">#</th>
              <th class="name-col">Nombre Completo</th>
              <th class="doc-col">Documento</th>
              <th class="classroom-col">Salón</th>
              <th class="status-col">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${students.map((student, index) => `
              <tr>
                <td class="number-col">${index + 1}</td>
                <td class="name-col">${student.surname} ${student.name}</td>
                <td class="doc-col">${student.documentNumber || 'No proporcionado'}</td>
                <td class="classroom-col">${student.classGroup}</td>
                <td class="status-col">${student.active ? 'Activo' : 'Inactivo'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

  const printStudentsPDF = () => {
    if (students.length === 0) {
      showErrorNotification('No hay estudiantes para imprimir');
      return;
    }
    const printContent = generateCleanHTML();
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    iframe.onload = () => {
      setTimeout(() => {
        if (iframe.contentWindow) iframe.contentWindow.print();
        document.body.removeChild(iframe);
      }, 500);
    };
    if (iframe.contentDocument) {
      iframe.contentDocument.write(printContent);
      iframe.contentDocument.close();
    }
  };

  // Modal methods
  const openAddStudentModal = () => {
    if (!selectedGrade || !selectedClassroom) return;
    setNewStudent({ name: '', surname: '', documentNumber: '', grade: selectedGrade, classGroup: selectedClassroom });
    setShowAddStudentModal(true);
  };

  const closeAddStudentModal = () => {
    setShowAddStudentModal(false);
    setNewStudent({ ...EMPTY_NEW });
    setIsSavingStudent(false);
  };

  const openEditStudentModal = (student) => {
    setStudentToEdit({ ...student });
    setShowEditStudentModal(true);
  };

  const closeEditStudentModal = () => {
    setShowEditStudentModal(false);
    setStudentToEdit(null);
    setIsSavingStudent(false);
  };

  const refreshListLater = () => {
    const { selectedGrade: g, selectedClassroom: c } = cur.current;
    if (g && c) {
      setTimeout(() => {
        const { selectedGrade: g2, selectedClassroom: c2 } = cur.current;
        if (g2 && c2) fetchStudents(g2, c2);
      }, 500);
    }
  };

  const updateStudent = async () => {
    if (!studentToEdit) return;
    if (!studentToEdit.name || !studentToEdit.surname) {
      showErrorNotification('Por favor complete los campos obligatorios (nombres y apellidos)');
      return;
    }
    setIsSavingStudent(true);
    const updatedStudentData = {
      name: studentToEdit.name?.trim(),
      surname: studentToEdit.surname?.trim(),
      documentNumber: studentToEdit.documentNumber?.trim() || null,
      grade: studentToEdit.grade,
      classGroup: studentToEdit.classGroup || null,
      active: studentToEdit.active,
    };
    try {
      await api.put(`/students/${studentToEdit.id}`, updatedStudentData);
      const studentName = `${updatedStudentData.name} ${updatedStudentData.surname}`;
      showSuccessNotification(`El estudiante "${studentName}" fue actualizado correctamente`);
      closeEditStudentModal();
      loadSinSalon();
      refreshListLater();
    } catch (error) {
      console.error('Failed to update student:', error);
      showErrorNotification(error?.data?.error || 'Error al actualizar el estudiante. Favor intentarlo más tarde.');
      setIsSavingStudent(false);
    }
  };

  const addStudent = async () => {
    if (!newStudent.name || !newStudent.surname) {
      showErrorNotification('Por favor complete los campos obligatorios (nombres y apellidos)');
      return;
    }
    if (!selectedGrade || !selectedClassroom) {
      showErrorNotification('Error: No hay grado o salón seleccionado');
      return;
    }
    const studentData = {
      name: newStudent.name?.trim(),
      surname: newStudent.surname?.trim(),
      grade: selectedGrade,
      classGroup: selectedClassroom,
      documentNumber: newStudent.documentNumber?.trim() || null,
    };
    setIsSavingStudent(true);
    try {
      await api.post('/students', studentData);
      closeAddStudentModal();
      const studentName = `${studentData.name} ${studentData.surname}`;
      showSuccessNotification(`El estudiante "${studentName}" fue agregado correctamente`);
      refreshListLater();
    } catch (error) {
      console.error('Failed to add student:', error);
      if (error?.status === 409 && error?.data?.error) {
        showErrorNotification(error.data.error);
        setIsSavingStudent(false);
        return;
      }
      showErrorNotification('Ha ocurrido un error al agregar al estudiante, favor intentarlo más tarde');
      setIsSavingStudent(false);
    }
  };

  // Notification system
  const hideNotification = () => {
    setShowNotification(false);
    setTimeout(() => {
      setNotificationType(null);
      setNotificationMessage('');
    }, 300);
  };

  function showSuccessNotification(message) {
    setNotificationType('success');
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => hideNotification(), 3000);
  }

  function showErrorNotification(message) {
    setNotificationType('error');
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => hideNotification(), 4000);
  }

  const deleteStudent = (student) => setStudentToDelete(student);
  const closeDeleteModal = () => setStudentToDelete(null);

  const confirmDelete = async () => {
    if (!studentToDelete) return;
    const student = studentToDelete;
    try {
      await api.del(`/students/${student.id}`);
      setStudents((list) => list.filter((s) => s.id !== student.id));
      showSuccessNotification(`El estudiante "${student.surname} ${student.name}" fue eliminado correctamente`);
      closeDeleteModal();
    } catch (error) {
      console.error('Failed to delete student:', error);
      showErrorNotification('Error al eliminar el estudiante. Favor intentarlo más tarde.');
      closeDeleteModal();
    }
  };

  const toggleStudentStatus = async (student) => {
    const flipped = { ...student, active: !student.active };
    setStudents((list) => list.map((s) => (s.id === student.id ? { ...s, active: !student.active } : s)));
    try {
      await api.put(`/students/${student.id}`, flipped);
      const statusText = flipped.active ? 'activo' : 'inactivo';
      showSuccessNotification(`El estudiante "${student.surname} ${student.name}" ahora está ${statusText}`);
    } catch (error) {
      setStudents((list) => list.map((s) => (s.id === student.id ? { ...s, active: student.active } : s)));
      console.error('Failed to update student status:', error);
      showErrorNotification('Error al actualizar el estado del estudiante. Favor intentarlo más tarde.');
    }
  };

  const onSubmit = (fn) => (e) => { e.preventDefault(); fn(); };

  return (
    <div className="pg-students">
      <div className="students-container">
        <h2>Grados, Salones y Estudiantes</h2>

        <div className="grades-sidebar">
          <div className="grades-row">
            {GRADES.map((grade) => (
              <div className="grade-section" key={grade}>
                <h3>{grade}</h3>
                <div className="classrooms">
                  {CLASSROOMS.map((classroom) => (
                    <button
                      key={classroom}
                      className={'classroom-btn' + (selectedGrade === grade && selectedClassroom === classroom ? ' selected' : '')}
                      onClick={() => selectClassroom(grade, classroom)}
                    >
                      {classroom}
                    </button>
                  ))}
                  {sinSalonCount(grade) > 0 && (
                    <button
                      className={'classroom-btn sin-salon-btn' + (sinSalonGrade === grade ? ' selected' : '')}
                      onClick={() => selectSinSalon(grade)}
                    >
                      Sin salón ({sinSalonCount(grade)})
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="right-content">
          {sinSalonGrade && (
            <div className="table-container">
              <div className="table-header">
                <h3>{sinSalonGrade} · Estudiantes sin salón</h3>
              </div>
              <p className="sin-salon-help">Pulsa A o B junto a cada estudiante: pasa al instante a ese salón.</p>
              <table className="students-table">
                <thead>
                  <tr>
                    <th className="number-column">#</th>
                    <th>Nombre Completo</th>
                    <th>Numero de Identidad</th>
                    <th className="actions-column">Asignar salón</th>
                  </tr>
                </thead>
                <tbody>
                  {sinSalonDelGrado.map((student, i) => (
                    <tr key={student.id}>
                      <td className="number-column">{i + 1}</td>
                      <td>{student.surname} {student.name}</td>
                      <td>{student.documentNumber || 'No proporcionado'}</td>
                      <td className="actions-cell">
                        <button type="button" className="salon-pick-btn" disabled={!!asignando[student.id]} onClick={() => asignarSalon(student, 'A')}>A</button>
                        <button type="button" className="salon-pick-btn" disabled={!!asignando[student.id]} onClick={() => asignarSalon(student, 'B')}>B</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isLoading && (
            <div className="loading-indicator">
              <div className="spinner"></div>
              <p>Cargando estudiantes...</p>
            </div>
          )}

          {selectedGrade && selectedClassroom && !isLoading && (
            <div className="students-list">
              {students.length > 0 && (
                <div className="table-container printable-area">
                  <div className="table-header">
                    <h3>Estudiantes - {selectedGrade} - {selectedClassroom}</h3>
                    <button className="add-student-button" onClick={openAddStudentModal}>
                      ➕ Agregar Estudiante
                    </button>
                  </div>
                  <table className="students-table">
                    <thead>
                      <tr>
                        <th className="number-column">#</th>
                        <th>Nombre Completo</th>
                        <th>Numero de Identidad</th>
                        <th>Salón</th>
                        <th>Estado</th>
                        <th className="actions-column">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student, i) => (
                        <tr key={student.id}>
                          <td className="number-column">{i + 1}</td>
                          <td>
                            <span className="student-name-cell">
                              {student.surname} {student.name}
                              <span
                                className={'parent-status-dot' + (student.hasParent ? ' has-parent' : '') + (!student.hasParent ? ' no-parent' : '')}
                                title={student.hasParent ? 'Tiene padre asignado' : 'Sin padre asignado'}
                              ></span>
                            </span>
                          </td>
                          <td>{student.documentNumber || 'No proporcionado'}</td>
                          <td>{student.classGroup}</td>
                          <td className={'status-cell' + (student.active !== false ? ' active-text' : '') + (student.active === false ? ' inactive-text' : '')}>
                            {student.active !== false ? 'Activo' : 'Inactivo'}
                          </td>
                          <td className="actions-cell">
                            <button type="button" className="action-link edit-text" onClick={() => openEditStudentModal(student)}>Editar</button>
                            <button
                              type="button"
                              className={'action-link' + (student.active === false ? ' active-text' : '') + (student.active !== false ? ' inactive-text' : '')}
                              onClick={() => toggleStudentStatus(student)}
                            >
                              {student.active === false ? 'Activar' : 'Inactivar'}
                            </button>
                            <button type="button" className="action-link delete-text" onClick={() => deleteStudent(student)}>
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {students.length === 0 && (
                <div className="no-students-message">
                  <div className="no-students-content">
                    <h3>No hay estudiantes en este salón</h3>
                    <p>No hay estudiantes aún predefinidos en el grado {selectedGradeWord} ({selectedClassroom}). Por favor, agrégalos.</p>
                    <button className="add-student-button" onClick={openAddStudentModal}>
                      ➕ Agregar estudiante
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(!selectedGrade || !selectedClassroom) && !sinSalonGrade && (
            <div className="students-placeholder">
              <div className="placeholder-content">
                <h3>Selecciona un grado y salón</h3>
                <p>Elige un grado de la lista superior y luego selecciona un salón para ver los estudiantes</p>
              </div>
            </div>
          )}

          {showPrintButton && selectedGrade && selectedClassroom && students.length > 0 && (
            <div className="print-button-container">
              <button className="print-button" onClick={printStudentsPDF}>
                🖨️ Imprimir Lista de Estudiantes
              </button>
            </div>
          )}
        </div>

        {studentToDelete && (
          <Overlay className="modal-overlay" onClick={closeDeleteModal}>
            <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Confirmar eliminación</h3>
                <button className="close-button" onClick={closeDeleteModal}>✕</button>
              </div>
              <div className="modal-body">
                <p className="confirm-message">
                  ¿Está seguro de eliminar al estudiante <strong>{studentToDelete.surname} {studentToDelete.name}</strong>?
                </p>
                <div className="modal-actions">
                  <button type="button" className="cancel-button" onClick={closeDeleteModal}>Cancelar</button>
                  <button type="button" className="delete-confirm-button" onClick={confirmDelete}>Eliminar</button>
                </div>
              </div>
            </div>
          </Overlay>
        )}

        {showEditStudentModal && studentToEdit && (
          <Overlay className="modal-overlay" onClick={closeEditStudentModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Editar Estudiante</h3>
                <button className="close-button" onClick={closeEditStudentModal}>✕</button>
              </div>
              <div className="modal-body">
                <form noValidate onSubmit={onSubmit(updateStudent)}>
                  <div className="form-group">
                    <label htmlFor="editStudentName">Nombres: *</label>
                    <input type="text" id="editStudentName" name="name"
                      value={studentToEdit.name ?? ''} onChange={(e) => setStudentToEdit({ ...studentToEdit, name: e.target.value })}
                      required autoComplete="given-name" placeholder="Ingrese los nombres del estudiante" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="editStudentSurname">Apellidos: *</label>
                    <input type="text" id="editStudentSurname" name="surname"
                      value={studentToEdit.surname ?? ''} onChange={(e) => setStudentToEdit({ ...studentToEdit, surname: e.target.value })}
                      required autoComplete="family-name" placeholder="Ingrese los apellidos del estudiante" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="editStudentDocument">Numero de Identificacion:</label>
                    <input type="text" id="editStudentDocument" name="documentNumber"
                      value={studentToEdit.documentNumber ?? ''} onChange={(e) => setStudentToEdit({ ...studentToEdit, documentNumber: e.target.value })}
                      autoComplete="off" placeholder="Ingrese el numero de identificacion" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="editStudentGrade">Grado:</label>
                    <select id="editStudentGrade" name="grade" value={studentToEdit.grade ?? ''}
                      onChange={(e) => setStudentToEdit({ ...studentToEdit, grade: e.target.value })}>
                      {GRADES.map((g) => (<option key={g} value={g}>{g}</option>))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="editStudentClassGroup">Salón:</label>
                    <select id="editStudentClassGroup" name="classGroup" value={studentToEdit.classGroup || ''}
                      onChange={(e) => setStudentToEdit({ ...studentToEdit, classGroup: e.target.value })}>
                      {!studentToEdit.classGroup && (<option value="" disabled>Sin salón</option>)}
                      {CLASSROOMS.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="cancel-button" onClick={closeEditStudentModal}>
                      Cancelar
                    </button>
                    <button type="submit" className="save-button" disabled={!studentToEdit.name || !studentToEdit.surname || isSavingStudent}>
                      {!isSavingStudent && <span>💾 Guardar Cambios</span>}
                      {isSavingStudent && <span>Guardando...</span>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Overlay>
        )}

        {showAddStudentModal && (
          <Overlay className="modal-overlay" onClick={closeAddStudentModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Agregar Nuevo Estudiante</h3>
                <button className="close-button" onClick={closeAddStudentModal}>✕</button>
              </div>
              <div className="modal-body">
                <form noValidate onSubmit={onSubmit(addStudent)}>
                  <div className="form-group">
                    <label htmlFor="studentGrade">Grado:</label>
                    <input type="text" id="studentGrade" name="grade" value={selectedGrade ?? ''} readOnly className="readonly-input" autoComplete="off" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="studentClassroom">Salón:</label>
                    <input type="text" id="studentClassroom" name="classGroup" value={selectedClassroom ?? ''} readOnly className="readonly-input" autoComplete="off" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="studentName">Nombres: *</label>
                    <input type="text" id="studentName" name="name"
                      value={newStudent.name ?? ''} onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                      required autoComplete="given-name" placeholder="Ingrese los nombres del estudiante" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="studentSurname">Apellidos: *</label>
                    <input type="text" id="studentSurname" name="surname"
                      value={newStudent.surname ?? ''} onChange={(e) => setNewStudent({ ...newStudent, surname: e.target.value })}
                      required autoComplete="family-name" placeholder="Ingrese los apellidos del estudiante" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="studentDocument">Documento de Identidad:</label>
                    <input type="text" id="studentDocument" name="documentNumber"
                      value={newStudent.documentNumber ?? ''} onChange={(e) => setNewStudent({ ...newStudent, documentNumber: e.target.value })}
                      autoComplete="off" placeholder="Ingrese el documento de identidad" />
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="cancel-button" onClick={closeAddStudentModal}>
                      Cancelar
                    </button>
                    <button type="submit" className="save-button" disabled={!newStudent.name || !newStudent.surname || isSavingStudent}>
                      {!isSavingStudent && <span>💾 Guardar Estudiante</span>}
                      {isSavingStudent && <span>Guardando...</span>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Overlay>
        )}

        {showNotification && (
          <Overlay className="notification-overlay" onClick={hideNotification}>
            <div
              className={'notification-content' + (notificationType === 'success' ? ' notification-success' : '') + (notificationType === 'error' ? ' notification-error' : '')}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="notification-icon">
                {notificationType === 'success' && (
                  <svg className="checkmark" viewBox="0 0 52 52">
                    <path className="checkmark__check" fill="none" d="m14.1 27.2l7.1 7.2 16.7-16.8" />
                  </svg>
                )}
                {notificationType === 'error' && (
                  <svg className="error-mark" viewBox="0 0 52 52">
                    <path className="error-mark__x" fill="none" d="M16 16l20 20M36 16L16 36" />
                  </svg>
                )}
              </div>
              <div className="notification-body">
                <div className="notification-title">{notificationType === 'success' ? '¡Cambio efectivo!' : '¡Error!'}</div>
                <div className="notification-message">
                  {notificationMessage}
                </div>
              </div>
              <button className="notification-close" onClick={hideNotification}>✕</button>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}