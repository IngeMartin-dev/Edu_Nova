import { useEffect, useMemo, useState } from 'react';
import '../styles/pages/school-year-config.css';
import { api } from '../api/client.js';
import { useDialog } from '../context/UiContext.jsx';
import Overlay from '../components/Overlay.jsx';

const WIZARD_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const emptyStudent = { name: '', surname: '', documentNumber: '', classGroup: 'A' };
const etiquetaHijo = (h) => (h.classroom ? `${h.grade} - ${h.classroom}` : h.grade);

/** Configuración de Año (school-year-config del original). */
export default function SchoolYear() {
  const dialog = useDialog();
  const [config, setConfig] = useState(null);
  const [editYearEndDate, setEditYearEndDate] = useState('');
  const [editMinPassingGrade, setEditMinPassingGrade] = useState(3.5);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState('');

  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeMessage, setWipeMessage] = useState('');

  const [advancing, setAdvancing] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [advanceMessage, setAdvanceMessage] = useState('');
  const [pendientes, setPendientes] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [guardando, setGuardando] = useState({});
  const [savingClassrooms] = useState(false);

  const [wizardIndex, setWizardIndex] = useState(0);
  const [newStudentsGrade1, setNewStudentsGrade1] = useState([]);
  const [newStudentForm, setNewStudentForm] = useState(emptyStudent);
  const [addingStudent, setAddingStudent] = useState(false);
  const [addStudentError, setAddStudentError] = useState('');

  const [usuariosSinRol, setUsuariosSinRol] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedRoleByUser, setSelectedRoleByUser] = useState({});
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [assigningUser, setAssigningUser] = useState({});

  const [usuariosGestion, setUsuariosGestion] = useState([]);
  const [loadingGestion, setLoadingGestion] = useState(false);
  const [activeRoleTab, setActiveRoleTab] = useState('PARENT');
  const [togglingAdminExtra, setTogglingAdminExtra] = useState({});
  const [selectedParentGradoSalon, setSelectedParentGradoSalon] = useState(null);

  const loadConfig = async () => {
    try {
      const cfg = await api.get('/school-year/config');
      setConfig(cfg); setEditYearEndDate(cfg.yearEndDate || ''); setEditMinPassingGrade(cfg.minPassingGrade ?? 3.5);
    } catch { /* igual que el original: sin aviso */ }
  };
  const loadPendientes = async () => { try { setPendientes(await api.get('/school-year/advance/pendientes')); setAsignaciones({}); } catch { /* */ } };
  const loadUsuariosSinRol = async () => {
    setLoadingUsuarios(true);
    try { setUsuariosSinRol(await api.get('/users/sin-rol')); } catch { /* */ }
    setLoadingUsuarios(false);
  };
  const loadRoles = async () => { try { setRoles(await api.get('/users/roles-disponibles')); } catch { /* */ } };
  const loadUsuariosGestion = async () => {
    setLoadingGestion(true);
    try { setUsuariosGestion(await api.get('/users/gestion-roles')); } catch { /* */ }
    setLoadingGestion(false);
  };

  useEffect(() => {
    loadConfig(); loadPendientes(); loadUsuariosSinRol(); loadRoles(); loadUsuariosGestion();
  }, []); // eslint-disable-line

  const saveConfig = async () => {
    setSavingConfig(true); setConfigMessage('');
    const clamped = Math.max(0, Math.min(5, Number(editMinPassingGrade)));
    try {
      const cfg = await api.put('/school-year/config', { yearEndDate: editYearEndDate || null, minPassingGrade: clamped });
      setConfig(cfg); setSavingConfig(false); setConfigMessage('Configuración guardada correctamente.');
      setTimeout(() => setConfigMessage(''), 4000);
    } catch { setSavingConfig(false); setConfigMessage('No se pudo guardar la configuración.'); }
  };

  const openWipeConfirm = () => { setWipeConfirmText(''); setWipeMessage(''); setShowWipeConfirm(true); };
  const confirmWipe = async () => {
    if (wipeConfirmText.trim().toUpperCase() !== 'BORRAR') return;
    setWiping(true);
    try {
      await api.post('/school-year/wipe', { confirm: 'BORRAR' });
      setWiping(false); setShowWipeConfirm(false);
      setWipeMessage('Se borró la información del año escolar. Estudiantes y padres de familia se conservaron.');
      loadConfig();
      setTimeout(() => setWipeMessage(''), 6000);
    } catch (e) { setWiping(false); setWipeMessage(e?.message || 'No se pudo completar el borrado.'); }
  };

  const advanceYear = async () => {
    const ok = await dialog.confirm(
      '¿Seguro que quieres adelantar el año? Todos los estudiantes activos subirán un grado (los de Grado 11º pasan a Promociones) y se borrarán TODAS las notas, los boletines y consolidados generados y los porcentajes de calificaciones (Promociones, estudiantes y cuentas de profesores se conservan). Podrás organizar los salones a continuación, y deshacer el cambio de grados con "Retroceder año" (lo borrado no se recupera).',
      'Adelantar año');
    if (!ok) return;
    setAdvancing(true); setAdvanceMessage('');
    try {
      const res = await api.post('/school-year/advance', {});
      setAdvancing(false);
      setAdvanceMessage(`${res.estudiantesPromovidos} estudiante(s) promovido(s), ${res.estudiantesGraduados} pasaron a Promociones (Grado 11º).`);
      setPendientes(res.pendientesDeOrganizar || []); setAsignaciones({}); setNewStudentsGrade1([]); setWizardIndex(0);
      loadConfig();
    } catch { setAdvancing(false); setAdvanceMessage('No se pudo adelantar el año.'); }
  };

  const revertYear = async () => {
    const ok = await dialog.confirm('¿Deshacer el último "Adelantar año"? Todos los estudiantes volverán a su grado y salón anteriores.', 'Retroceder año');
    if (!ok) return;
    setReverting(true);
    try {
      const res = await api.post('/school-year/revert', {});
      setReverting(false);
      setAdvanceMessage(`${res.revertidos} estudiante(s) devuelto(s) a su grado y salón anterior.`);
      setPendientes([]); loadConfig();
    } catch { setReverting(false); setAdvanceMessage('No se pudo retroceder el año.'); }
  };

  const toggleAsignacion = async (studentId, salon) => {
    const anterior = asignaciones[studentId];
    if (anterior === salon || guardando[studentId]) return;
    setAsignaciones((a) => ({ ...a, [studentId]: salon }));
    setGuardando((g) => ({ ...g, [studentId]: true }));
    try {
      await api.post('/school-year/advance/assign-classrooms', { assignments: { [studentId]: salon } });
      setGuardando((g) => ({ ...g, [studentId]: false }));
    } catch {
      setGuardando((g) => ({ ...g, [studentId]: false }));
      setAsignaciones((a) => { const n = { ...a }; if (anterior) n[studentId] = anterior; else delete n[studentId]; return n; });
      setAdvanceMessage('No se pudo asignar el salón. Intenta de nuevo.');
    }
  };

  const currentGrade = WIZARD_GRADES[wizardIndex];
  const isFirstStep = wizardIndex === 0;
  const isLastStep = wizardIndex === WIZARD_GRADES.length - 1;
  const pendientesDelPaso = pendientes.filter((p) => p.grade === `Grado ${currentGrade}º`);
  const countAsignadosPaso = (s) => pendientesDelPaso.filter((p) => asignaciones[p.studentId] === s).length;
  const countNuevos = (s) => newStudentsGrade1.filter((e) => e.classGroup === s).length;

  const agregarEstudianteNuevo = async () => {
    setAddStudentError('');
    if (!newStudentForm.name.trim() || !newStudentForm.surname.trim()) { setAddStudentError('Nombre y apellido son obligatorios.'); return; }
    setAddingStudent(true);
    try {
      await api.post('/students', {
        name: newStudentForm.name.trim(), surname: newStudentForm.surname.trim(), documentNumber: newStudentForm.documentNumber.trim(),
        grade: 'Grado 1º', classGroup: 'Salon ' + newStudentForm.classGroup, active: true,
      });
      setAddingStudent(false);
      setNewStudentsGrade1((l) => [...l, { ...newStudentForm }]);
      setNewStudentForm(emptyStudent);
    } catch (e) { setAddingStudent(false); setAddStudentError(e?.message || 'No se pudo registrar el estudiante.'); }
  };

  const siguientePaso = () => {
    if (isLastStep) {
      const sinSalon = pendientes.filter((p) => !asignaciones[p.studentId]).length;
      setAdvanceMessage(sinSalon > 0
        ? `Quedaron ${sinSalon} estudiante(s) sin salón; los verás de nuevo al entrar a esta pantalla.`
        : 'Organización de salones completada de Grado 1º a Grado 11º.');
      setPendientes([]); setWizardIndex(0); loadConfig();
    } else setWizardIndex((i) => i + 1);
  };

  const asignarRol = async (user) => {
    const roleId = selectedRoleByUser[user.id];
    if (!roleId) return;
    setAssigningUser((a) => ({ ...a, [user.id]: true }));
    try {
      await api.put(`/users/${user.id}/role`, { roleId });
      setAssigningUser((a) => ({ ...a, [user.id]: false }));
      setUsuariosSinRol((l) => l.filter((u) => u.id !== user.id));
    } catch { setAssigningUser((a) => ({ ...a, [user.id]: false })); }
  };

  const gradosSalonesConPadres = useMemo(() => {
    const set = new Set();
    for (const u of usuariosGestion) {
      if (u.roleName !== 'PARENT') continue;
      for (const h of u.hijos || []) { if (!h.grade) continue; set.add(etiquetaHijo(h)); }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [usuariosGestion]);

  const usuariosPestana = useMemo(() => {
    if (activeRoleTab === 'ADMIN') return usuariosGestion.filter((u) => u.roleName === 'ADMIN' || u.additionalAdmin);
    let lista = usuariosGestion.filter((u) => u.roleName === activeRoleTab);
    if (activeRoleTab === 'PARENT' && selectedParentGradoSalon) lista = lista.filter((u) => (u.hijos || []).some((h) => etiquetaHijo(h) === selectedParentGradoSalon));
    return lista;
  }, [usuariosGestion, activeRoleTab, selectedParentGradoSalon]);

  const countPorRol = (r) => (r === 'ADMIN' ? usuariosGestion.filter((u) => u.roleName === 'ADMIN' || u.additionalAdmin).length : usuariosGestion.filter((u) => u.roleName === r).length);

  const setRoleTab = (tab) => { setActiveRoleTab(tab); if (tab !== 'PARENT') setSelectedParentGradoSalon(null); };
  const selectFiltro = (v) => setSelectedParentGradoSalon((cur) => (cur === v ? null : v));

  const toggleAdminExtra = async (user) => {
    if (user.roleName === 'ADMIN') return;
    const nuevo = !user.additionalAdmin;
    setTogglingAdminExtra((t) => ({ ...t, [user.id]: true }));
    try {
      await api.put(`/users/${user.id}/admin-extra`, { enable: nuevo });
      setTogglingAdminExtra((t) => ({ ...t, [user.id]: false }));
      setUsuariosGestion((l) => l.map((u) => (u.id === user.id ? { ...u, additionalAdmin: nuevo } : u)));
    } catch { setTogglingAdminExtra((t) => ({ ...t, [user.id]: false })); }
  };

  const showWizard = pendientes.length > 0 || newStudentsGrade1.length > 0;

  return (
    <div className="pg-school-year-config">
      <div className="syc-container">
        <div className="page-header">
          <h2><span className="material-icons">event_repeat</span> Configuración de Año</h2>
          <p className="page-subtitle">Fin de año escolar, adelantar/retroceder año, nota mínima y usuarios sin rol.</p>
        </div>

        <div className="syc-card">
          <h3><span className="material-icons">event_busy</span> Fecha de finalización del año escolar</h3>
          <p className="syc-hint">El día que llegue esta fecha se borrará toda la información del año (notas, boletines, recuperaciones, chats, períodos). <strong>Los estudiantes, su documento de identidad y sus padres de familia enlazados se conservan siempre.</strong></p>
          <div className="syc-row">
            <div className="syc-field"><label>Fecha de fin de año</label><input type="date" value={editYearEndDate} onChange={(e) => setEditYearEndDate(e.target.value)} /></div>
            <div className="syc-field"><label>Nota mínima para aprobar (0 - 5)</label><input type="number" step="0.1" min="0" max="5" value={editMinPassingGrade} onChange={(e) => setEditMinPassingGrade(e.target.value)} /></div>
            <button className="syc-save-btn" disabled={savingConfig} onClick={saveConfig}>{savingConfig ? 'Guardando...' : 'Guardar'}</button>
          </div>
          {configMessage && <p className="syc-message">{configMessage}</p>}
          {config?.currentAcademicYear && <p className="syc-current-year">Año académico actual: <strong>{config.currentAcademicYear}</strong></p>}
        </div>

        <div className="syc-card syc-danger-card">
          <h3><span className="material-icons">delete_forever</span> Cerrar año ahora</h3>
          <p className="syc-hint">Borra de inmediato toda la información del año escolar actual (no espera a la fecha configurada arriba). Esta acción <strong>no se puede deshacer</strong>.</p>
          <button className="syc-danger-btn" onClick={openWipeConfirm}><span className="material-icons">warning</span> Cerrar año y borrar información</button>
          {wipeMessage && <p className="syc-message">{wipeMessage}</p>}
        </div>

        <div className="syc-card">
          <h3><span className="material-icons">swap_vert</span> Adelantar / retroceder año</h3>
          <p className="syc-hint">Adelantar sube un grado a todos los estudiantes activos (Grado 11º pasa a Promociones, donde sus boletines se guardan 5 años) y borra todas las notas, los boletines y consolidados generados y los porcentajes de calificaciones (Promociones se conserva). Retroceder deshace el último adelanto.</p>
          <div className="syc-row">
            <button className="syc-advance-btn" disabled={advancing} onClick={advanceYear}><span className="material-icons">arrow_upward</span>{advancing ? ' Adelantando...' : ' Adelantar año'}</button>
            <button className="syc-revert-btn" disabled={reverting} onClick={revertYear}><span className="material-icons">arrow_downward</span>{reverting ? ' Retrocediendo...' : ' Retroceder año'}</button>
          </div>
          {advanceMessage && <p className="syc-message">{advanceMessage}</p>}
        </div>

        <div className="syc-card">
          <h3><span className="material-icons">admin_panel_settings</span> Roles y permisos</h3>
          <p className="syc-hint">Todos los usuarios, agrupados por su rol. Desde Padres o Profesores puedes sumarle el rol de Administrador a alguien sin quitarle el que ya tiene. La pestaña Administradores reúne a TODOS los que hoy tienen privilegios de Admin (los que ya lo tienen de por sí, más los que se les sumó desde Padres o Profesores), con la opción de quitárselo.</p>
          <div className="syc-role-tabs">
            {[['PARENT', 'Padres'], ['TEACHER', 'Profesores'], ['ADMIN', 'Administradores']].map(([k, label]) => (
              <button key={k} type="button" className={`syc-role-tab${activeRoleTab === k ? ' active' : ''}`} onClick={() => setRoleTab(k)}>
                {label} <span className="syc-count-badge">{countPorRol(k)}</span>
              </button>
            ))}
          </div>

          {activeRoleTab === 'PARENT' && gradosSalonesConPadres.length > 0 && (
            <div className="syc-grado-salon-filtros">
              <button type="button" className={`syc-filtro-chip${selectedParentGradoSalon === null ? ' active' : ''}`} onClick={() => selectFiltro(null)}>Todos</button>
              {gradosSalonesConPadres.map((gs) => (
                <button key={gs} type="button" className={`syc-filtro-chip${selectedParentGradoSalon === gs ? ' active' : ''}`} onClick={() => selectFiltro(gs)}>
                  <span className="material-icons">meeting_room</span> {gs}
                </button>
              ))}
            </div>
          )}

          {loadingGestion && <p className="syc-hint">Cargando...</p>}
          {!loadingGestion && usuariosPestana.length === 0 && (
            <p className="syc-empty">{activeRoleTab === 'PARENT' && selectedParentGradoSalon ? `Ningún padre tiene un estudiante en ${selectedParentGradoSalon}.` : 'No hay usuarios en esta pestaña.'}</p>
          )}
          {!loadingGestion && usuariosPestana.length > 0 && (
            <div className="syc-users-list">
              {usuariosPestana.map((user) => (
                <div key={user.id} className="syc-user-row">
                  <div className="syc-user-info">
                    <strong>{user.name} {user.surname}</strong>
                    <span>{user.username} · {user.email}</span>
                    {activeRoleTab === 'ADMIN' && user.roleName !== 'ADMIN' && (
                      <span className="syc-hijo-badge syc-hijo-badge--rolorigen">Rol principal: {user.roleName === 'TEACHER' ? 'Profesor' : 'Padre de familia'}</span>
                    )}
                    {user.roleName === 'PARENT' && (
                      <div className="syc-hijos-badges">
                        {(user.hijos || []).length === 0 && <span className="syc-hijo-badge syc-hijo-badge--vacio">Sin estudiantes vinculados</span>}
                        {(user.hijos || []).map((hijo) => (
                          <span key={hijo.studentId} className={`syc-hijo-badge${!hijo.active ? ' syc-hijo-badge--inactivo' : ''}`}>
                            <span className="material-icons">school</span>
                            {hijo.name} {hijo.surname} · {hijo.grade}{hijo.classroom ? ' - ' + hijo.classroom : ''}
                            {!hijo.active && <em>(inactivo)</em>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {user.roleName === 'ADMIN' ? <span className="syc-count-badge">Administrador</span>
                    : user.additionalAdmin ? (
                      <button className="syc-danger-btn syc-role-toggle-btn" disabled={!!togglingAdminExtra[user.id]} onClick={() => toggleAdminExtra(user)}>
                        <span className="material-icons">remove_moderator</span>{togglingAdminExtra[user.id] ? ' ...' : ' Quitar rol de Admin'}
                      </button>
                    ) : (
                      <button className="syc-assign-btn syc-role-toggle-btn" disabled={!!togglingAdminExtra[user.id]} onClick={() => toggleAdminExtra(user)}>
                        <span className="material-icons">add_moderator</span>{togglingAdminExtra[user.id] ? ' ...' : ' Dar rol de Admin'}
                      </button>
                    )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="syc-card">
          <h3><span className="material-icons">person_add</span> Usuarios sin rol</h3>
          <p className="syc-hint">Cuentas creadas que todavía no tienen un rol asignado.</p>
          {loadingUsuarios && <p className="syc-hint">Cargando...</p>}
          {!loadingUsuarios && usuariosSinRol.length === 0 && <p className="syc-empty">No hay usuarios sin rol.</p>}
          {!loadingUsuarios && usuariosSinRol.length > 0 && (
            <div className="syc-users-list">
              {usuariosSinRol.map((user) => (
                <div key={user.id} className="syc-user-row">
                  <div className="syc-user-info"><strong>{user.name} {user.surname}</strong><span>{user.username} · {user.email}</span></div>
                  <select value={selectedRoleByUser[user.id] ?? ''} onChange={(e) => setSelectedRoleByUser((m) => ({ ...m, [user.id]: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">Selecciona un rol...</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button className="syc-assign-btn" disabled={!selectedRoleByUser[user.id] || !!assigningUser[user.id]} onClick={() => asignarRol(user)}>
                    {assigningUser[user.id] ? '...' : 'Asignar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showWipeConfirm && (
        <Overlay className="syc-modal-overlay" onClick={() => setShowWipeConfirm(false)}>
          <div className="syc-modal" onClick={(e) => e.stopPropagation()}>
            <h3><span className="material-icons">warning</span> Confirmar borrado del año escolar</h3>
            <p>Esta acción borrará permanentemente notas, boletines, recuperaciones, chats, porcentajes de calificaciones, objetivos de boletines y períodos del año actual. Los estudiantes, su documento de identidad, sus padres de familia y la sección Promociones se conservarán. Esta acción <strong>no se puede deshacer</strong>.</p>
            <p>Escribe <strong>BORRAR</strong> para confirmar:</p>
            <input type="text" value={wipeConfirmText} onChange={(e) => setWipeConfirmText(e.target.value)} placeholder="BORRAR" />
            <div className="syc-modal-actions">
              <button className="syc-cancel-btn" onClick={() => setShowWipeConfirm(false)}>Cancelar</button>
              <button className="syc-danger-btn" disabled={wipeConfirmText.trim().toUpperCase() !== 'BORRAR' || wiping} onClick={confirmWipe}>{wiping ? 'Borrando...' : 'Borrar definitivamente'}</button>
            </div>
          </div>
        </Overlay>
      )}

      {showWizard && (
        <Overlay className="syc-fullscreen-overlay">
          <div className="syc-fullscreen">
            <div className="syc-fullscreen-header">
              <h2><span className="material-icons">groups</span> Organizar Grado {currentGrade}º</h2>
              <div className="syc-wizard-progress">
                {WIZARD_GRADES.map((g) => <span key={g} className={`syc-wizard-dot${g === currentGrade ? ' active' : ''}${g < currentGrade ? ' done' : ''}`}>{g}</span>)}
              </div>
              {currentGrade === 1
                ? <p className="syc-hint">Grado 1º no recibe estudiantes promovidos: registra aquí a los estudiantes NUEVOS que ingresan este año y asígnalos a su salón.</p>
                : <p className="syc-hint">Pulsa A o B junto a cada estudiante: pasa al instante a ese salón. Los que no marques quedarán pendientes y volverán a aparecer aquí.</p>}
            </div>

            <div className="syc-fullscreen-body">
              {currentGrade === 1 ? (
                <>
                  {newStudentsGrade1.length === 0 ? <p className="syc-empty">Todavía no has agregado estudiantes nuevos a Grado 1º.</p> : (
                    <div className="syc-grade-group">
                      <div className="syc-grade-group-header">
                        <strong>Grado 1º — nuevos ingresos</strong>
                        <span className="syc-count-badge">A: {countNuevos('A')} · B: {countNuevos('B')}</span>
                      </div>
                      {newStudentsGrade1.map((est, i) => (
                        <div key={est.documentNumber + i} className="syc-student-row">
                          <span className="syc-student-name">{est.surname} {est.name}</span>
                          <span className="syc-count-badge">Salón {est.classGroup}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="syc-new-student-form">
                    <input type="text" placeholder="Nombre" value={newStudentForm.name} onChange={(e) => setNewStudentForm({ ...newStudentForm, name: e.target.value })} />
                    <input type="text" placeholder="Apellido" value={newStudentForm.surname} onChange={(e) => setNewStudentForm({ ...newStudentForm, surname: e.target.value })} />
                    <input type="text" placeholder="Documento de identidad" value={newStudentForm.documentNumber} onChange={(e) => setNewStudentForm({ ...newStudentForm, documentNumber: e.target.value })} />
                    <div className="syc-salon-toggle">
                      <button type="button" className={`salon-btn${newStudentForm.classGroup === 'A' ? ' active' : ''}`} onClick={() => setNewStudentForm({ ...newStudentForm, classGroup: 'A' })}>A</button>
                      <button type="button" className={`salon-btn${newStudentForm.classGroup === 'B' ? ' active' : ''}`} onClick={() => setNewStudentForm({ ...newStudentForm, classGroup: 'B' })}>B</button>
                    </div>
                    <button className="syc-save-btn" disabled={addingStudent} onClick={agregarEstudianteNuevo}><span className="material-icons">person_add</span>{addingStudent ? ' Agregando...' : ' Agregar'}</button>
                  </div>
                  {addStudentError && <p className="syc-message">{addStudentError}</p>}
                </>
              ) : pendientesDelPaso.length === 0 ? (
                <p className="syc-empty">No hay estudiantes pendientes de organizar en Grado {currentGrade}º.</p>
              ) : (
                <div className="syc-grade-group">
                  <div className="syc-grade-group-header">
                    <strong>Grado {currentGrade}º</strong>
                    <span className="syc-count-badge">A: {countAsignadosPaso('A')} · B: {countAsignadosPaso('B')}</span>
                  </div>
                  {pendientesDelPaso.map((est) => (
                    <div key={est.studentId} className="syc-student-row">
                      <span className="syc-student-name">{est.surname} {est.name}</span>
                      <div className="syc-salon-toggle">
                        <button type="button" className={`salon-btn${asignaciones[est.studentId] === 'A' ? ' active' : ''}`} onClick={() => toggleAsignacion(est.studentId, 'A')}>A</button>
                        <button type="button" className={`salon-btn${asignaciones[est.studentId] === 'B' ? ' active' : ''}`} onClick={() => toggleAsignacion(est.studentId, 'B')}>B</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="syc-fullscreen-footer">
              <button className="syc-cancel-btn" onClick={() => setPendientes([])}>Continuar después</button>
              <div className="syc-wizard-nav">
                <button className="syc-cancel-btn" disabled={isFirstStep} onClick={() => !isFirstStep && setWizardIndex((i) => i - 1)}><span className="material-icons">arrow_back</span> Anterior</button>
                <button className="syc-save-btn" onClick={siguientePaso}>
                  {savingClassrooms ? 'Guardando...' : isLastStep ? <><span className="material-icons">check</span> Finalizar</> : <>Siguiente <span className="material-icons">arrow_forward</span></>}
                </button>
              </div>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}