import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/settings.css';
import { api, imageUrl } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDialog, useUi } from '../context/UiContext.jsx';
import Overlay from '../components/Overlay.jsx';
import { COOKIES, PRIVACY, REFUND, TERMS } from '../legal/content.js';

const FAQ_ITEMS = [
  { question: '¿Cómo veo las calificaciones de mi hijo(a)?', answer: 'Ingresa a la sección "Calificaciones" desde el menú principal. Allí verás las notas por materia y periodo tal como las registraron los profesores.' },
  { question: '¿Cómo descargo el boletín de calificaciones?', answer: 'En la sección de Boletines/Consolidados, selecciona el periodo y el estudiante, y usa el botón de descarga para obtener el PDF en tamaño carta.' },
  { question: '¿Olvidé mi contraseña, qué hago?', answer: 'Desde la pantalla de inicio de sesión selecciona "¿Olvidaste tu contraseña?". Si no tienes esa opción disponible, contacta a soporte para que un administrador te ayude a restablecerla.' },
  { question: '¿Cómo cambio mi contraseña?', answer: 'Ve a Ajustes > Seguridad > Cambiar Contraseña, ingresa tu contraseña actual y la nueva contraseña dos veces para confirmarla.' },
  { question: '¿Cómo hablo con el profesor o el director de grupo de mi hijo(a)?', answer: 'Usa la sección de Chat/Mensajes: allí encontrarás a los profesores del grado correspondiente y a los administradores del colegio para escribirles directamente.' },
  { question: '¿Por qué no veo algunas materias en el boletín?', answer: 'El boletín muestra las materias asignadas al grado del estudiante para el periodo activo. Si crees que falta alguna, contacta a soporte o al director de grupo.' },
  { question: '¿Puedo usar la aplicación desde el celular?', answer: 'Sí, la plataforma es responsiva y puedes usarla desde el navegador de tu celular sin instalar nada adicional.' },
  { question: '¿Cómo cierro sesión en otro dispositivo que ya no uso?', answer: 'Ve a Ajustes > Seguridad > Sesiones Activas. Allí puedes ver todos los dispositivos donde tu cuenta tiene sesión iniciada y cerrar la que quieras.' },
];

const lsBool = (k, d = true) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

/** Modal con la estructura del original (logout-modal). */
function Modal({ show, onClose, title, legal, children, actions }) {
  return (
    <Overlay className={`logout-modal-overlay${show ? ' show' : ''}`} onClick={onClose}>
      <div className={`logout-modal${legal ? ' legal-modal' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3></div>
        {children}
        {actions}
      </div>
    </Overlay>
  );
}
const Btn = ({ cls, icon, onClick, disabled, children }) => (
  <button className={cls} onClick={onClick} disabled={disabled}><span className="material-icons">{icon}</span>{children}</button>
);
const ErrorLine = ({ text, icon }) => (text ? <p className="error-message">{icon && <span className="material-icons">error_outline</span>}{text}</p> : null);

/** Configuración: perfil, apariencia, notificaciones, seguridad (2FA, sesiones), privacidad, ayuda y legales. */
export default function Settings() {
  const { user, setUser, loadMe, logout: doLogout } = useAuth();
  const { theme, setTheme } = useUi();
  const dialog = useDialog();
  const nav = useNavigate();
  const currentYear = new Date().getFullYear();

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimer = useRef(null);
  const [showLogout, setShowLogout] = useState(false);

  const [push, setPush] = useState(() => lsBool('pushNotifications'));
  const [email, setEmail] = useState(() => lsBool('emailNotifications'));
  const [messagesOn, setMessagesOn] = useState(() => lsBool('messageNotifications'));
  const language = (() => { try { return localStorage.getItem('language') || 'es'; } catch { return 'es'; } })();

  // Contraseña
  const [showPwd, setShowPwd] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [pwdError, setPwdError] = useState(null);
  const [pwdOk, setPwdOk] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  // Ayuda y legales
  const [showFaq, setShowFaq] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [showSupport, setShowSupport] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showCookies, setShowCookies] = useState(false);
  const [showRefund, setShowRefund] = useState(false);

  // 2FA
  const [tfEnabled, setTfEnabled] = useState(!!user?.twoFactorEnabled);
  const [showTfEnable, setShowTfEnable] = useState(false);
  const [showTfDisable, setShowTfDisable] = useState(false);
  const [tfCode, setTfCode] = useState('');
  const [tfPassword, setTfPassword] = useState('');
  const [tfHint, setTfHint] = useState('');
  const [tfError, setTfError] = useState(null);
  const [tfBusy, setTfBusy] = useState(false);

  // Sesiones
  const [showSessions, setShowSessions] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [revoking, setRevoking] = useState(null);

  // Edición de perfil
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSurname, setEditSurname] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [updating, setUpdating] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [formHiding, setFormHiding] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => { loadMe().then((u) => setTfEnabled(!!u?.twoFactorEnabled)).catch(() => {}); return () => clearTimeout(successTimer.current); }, []); // eslint-disable-line

  const showSuccessNotification = () => {
    setShowSuccess(true);
    clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setShowSuccess(false), 4000);
  };

  const initials = user?.name && user?.surname ? (user.name.charAt(0) + user.surname.charAt(0)).toUpperCase() : 'U';
  const picture = user?.profilePicture ? imageUrl(user.profilePicture) : null;
  const onImageError = (e) => {
    const img = e.target;
    if (!img.src.includes('/uploads/profile-pictures/')) return;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent) {
      parent.querySelector('.user-initials-fallback')?.remove();
      const d = document.createElement('div');
      d.className = 'user-initials user-initials-fallback';
      d.textContent = initials;
      parent.appendChild(d);
    }
  };

  // ---- Contraseña ----
  const openPwd = () => { setShowPwd(true); setCurPwd(''); setNewPwd(''); setConfPwd(''); setPwdError(null); setPwdOk(false); };
  const changePassword = async () => {
    if (!curPwd || !newPwd || !confPwd) { setPwdError('Por favor completa todos los campos'); return; }
    if (newPwd !== confPwd) { setPwdError('Las contraseñas no coinciden'); return; }
    if (newPwd.length < 6) { setPwdError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (!user?.id) { setPwdError('No se pudo identificar al usuario actual'); return; }
    setChangingPwd(true); setPwdError(null); setPwdOk(false);
    try {
      await api.put(`/users/${user.id}/password`, { currentPassword: curPwd, newPassword: newPwd });
      setPwdOk(true); setCurPwd(''); setNewPwd(''); setConfPwd('');
      setTimeout(() => { setChangingPwd(false); setShowPwd(false); }, 1500);
    } catch (e) {
      setChangingPwd(false);
      setPwdError(e.status === 401 ? 'La contraseña actual es incorrecta' : e.status === 0 ? 'No se pudo conectar con el servidor' : e.message || 'Error al cambiar la contraseña');
    }
  };

  // ---- Privacidad ----
  const triggerDownload = (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mis-datos-edunova-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const downloadMyData = async () => {
    setDownloading(true);
    const settings = { push, email, messages: messagesOn };
    try {
      const full = await api.get('/export/my-data');
      triggerDownload({ ...full, notificationSettings: settings, language });
    } catch {
      triggerDownload({ profile: user, notificationSettings: settings, language, exportDate: new Date().toISOString(), warning: 'No se pudo obtener la exportación completa del servidor; este archivo solo contiene el perfil.' });
    }
    setDownloading(false);
  };

  // ---- 2FA ----
  const onToggleTwoFactor = async () => {
    if (tfEnabled) { setTfError(null); setTfPassword(''); setShowTfDisable(true); return; }
    setTfError(null); setTfBusy(true);
    try {
      const res = await api.post('/auth/2fa/enable', {});
      setTfHint(res.emailHint || 'tu correo registrado'); setTfCode(''); setShowTfEnable(true);
    } catch (e) { setTfEnabled(false); dialog.alert(e.message || 'No se pudo enviar el código', 'Error'); }
    setTfBusy(false);
  };
  const confirmEnableTwoFactor = async () => {
    if (!tfCode.trim()) { setTfError('Ingresa el código que llegó a tu correo'); return; }
    setTfBusy(true); setTfError(null);
    try { await api.post('/auth/2fa/enable/confirm', { code: tfCode.trim() }); setTfEnabled(true); setShowTfEnable(false); loadMe().catch(() => {}); }
    catch (e) { setTfError(e.message || 'Código incorrecto o vencido'); }
    setTfBusy(false);
  };
  const confirmDisableTwoFactor = async () => {
    if (!tfPassword) { setTfError('Ingresa tu contraseña actual'); return; }
    setTfBusy(true); setTfError(null);
    try { await api.post('/auth/2fa/disable', { password: tfPassword }); setTfEnabled(false); setShowTfDisable(false); loadMe().catch(() => {}); }
    catch (e) { setTfError(e.message || 'Contraseña incorrecta'); }
    setTfBusy(false);
  };

  // ---- Sesiones ----
  const loadSessions = async () => {
    setLoadingSessions(true); setSessionsError(null);
    try {
      const mine = localStorage.getItem('refreshToken') || '';
      setSessions((await api.get('/auth/sessions', mine ? { currentRefreshToken: mine } : undefined)) || []);
    } catch { setSessionsError('No se pudieron cargar las sesiones activas. Intenta de nuevo.'); }
    setLoadingSessions(false);
  };
  const openSessions = () => { setShowSessions(true); loadSessions(); };
  const revokeSession = async (id, isCurrent) => {
    if (isCurrent) {
      const ok = await dialog.confirm('Esta es tu sesión actual. Si la cierras, se cerrará tu sesión en este dispositivo. ¿Deseas continuar?', 'Cerrar sesión actual');
      if (!ok) return;
    }
    setRevoking(id);
    try {
      await api.del(`/auth/sessions/${id}`);
      setRevoking(null);
      if (isCurrent) { setShowSessions(false); setShowLogout(true); return; }
      setSessions((l) => l.filter((s) => s.id !== id));
    } catch { setRevoking(null); setSessionsError('No se pudo cerrar esa sesión. Intenta de nuevo.'); }
  };

  // ---- Ayuda ----
  const contactSupport = () => {
    const subject = encodeURIComponent('Contacto desde EduNova');
    const body = encodeURIComponent(`\n\n---\nUsuario: ${user?.name || 'No identificado'}\nEmail: ${user?.email || 'No registrado'}`);
    window.open(`mailto:soporte@edunova.edu.co?subject=${subject}&body=${body}`);
  };
  const sendFeedback = async () => {
    const feedback = await dialog.input('¿Tienes comentarios o sugerencias? Cuéntanos:', 'Comentarios', 'Escribe aquí tus comentarios...');
    if (!feedback || !feedback.trim()) return;
    try { await api.post('/feedback', { message: feedback.trim() }); await dialog.alert('¡Gracias por tus comentarios! Los hemos recibido.', 'Comentarios enviados'); }
    catch { await dialog.alert('No pudimos enviar tu comentario en este momento. Por favor intenta de nuevo más tarde.', 'Error'); }
  };
  const acceptLegal = async (type, close) => { try { await api.post('/auth/accept-legal', { type }); } catch { /* no se bloquea al usuario */ } close(); };

  // ---- Foto de perfil ----
  const onFileSelected = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file || null);
    if (!file) { setPreviewUrl(null); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewUrl(ev.target?.result);
    reader.onerror = () => { dialog.alert('Error al leer el archivo. Por favor intenta con otra imagen.', 'Error de archivo'); setSelectedFile(null); };
    reader.readAsDataURL(file);
  };
  const clearPreview = () => { setPreviewUrl(null); setSelectedFile(null); const f = document.getElementById('profile-picture'); if (f) f.value = ''; };
  const uploadProfilePicture = async () => {
    if (!selectedFile) { dialog.alert('Por favor selecciona una imagen primero', 'Sin imagen'); return; }
    if (!user) { dialog.alert('No se pudo obtener la información del usuario', 'Error'); return; }
    const fd = new FormData();
    fd.append('file', selectedFile);
    try {
      const r = await api.post(`/users/${user.id}/profile-picture`, fd);
      if (r?.profilePicture) setUser({ ...user, profilePicture: r.profilePicture });
      loadMe().catch(() => {});
      clearPreview();
      showSuccessNotification();
    } catch (e) {
      let msg = 'Error al subir la imagen. ';
      if (e.status === 0) msg += 'No se puede conectar con el servidor. Verifica que el servidor esté ejecutándose.';
      else if (e.status === 404) msg += 'El endpoint de la API no existe.';
      else if (e.status === 401) msg += 'No tienes permisos para realizar esta acción (revisa si tu sesión sigue activa).';
      else if (e.message) msg += e.message;
      else msg += `Código de error: ${e.status}`;
      dialog.alert(`${msg} Por favor intenta de nuevo.`, 'Error al subir');
    }
  };

  // ---- Edición de perfil ----
  const startEdit = () => { if (!user) return; setEditName(user.name || ''); setEditSurname(user.surname || ''); setEditEmail(user.email || ''); setEditing(true); setProfileError(null); };
  const cancelEdit = () => {
    setFormHiding(true);
    setTimeout(() => { setEditing(false); setFormHiding(false); setEditName(''); setEditSurname(''); setEditEmail(''); setProfileError(null); }, 250);
  };
  const saveProfile = async () => {
    if (!user?.id) { setProfileError('No se pudo obtener la información del usuario'); return; }
    const name = editName.trim();
    if (!name) { setProfileError('El nombre es obligatorio'); return; }
    setUpdating(true); setProfileError(null);
    try {
      const updated = await api.put(`/users/${user.id}`, { name, surname: editSurname.trim(), email: editEmail, username: user.username, enable: user.enable, profilePicture: user.profilePicture });
      setFormHiding(true);
      setTimeout(() => {
        const next = { ...user, name: updated.name, surname: updated.surname, email: updated.email, profilePicture: user.profilePicture };
        setUser(next);
        try { localStorage.setItem('currentUser', JSON.stringify(next)); } catch { /* sin almacenamiento */ }
        setEditing(false); setFormHiding(false); setUpdating(false);
        showSuccessNotification();
      }, 250);
    } catch (e) {
      setUpdating(false);
      setProfileError(e.message && e.status !== 0 ? e.message : e.status === 0 ? 'Error al actualizar el perfil. No se puede conectar con el servidor.' : `Error al actualizar el perfil. Código de error: ${e.status}`);
    }
  };

  const confirmLogout = () => { setShowLogout(false); doLogout(); nav('/login'); };
  const a11y = (fn) => ({ role: 'button', tabIndex: 0, onClick: fn, onKeyDown: (e) => { if (e.key === 'Enter') fn(); if (e.key === ' ') { fn(); e.preventDefault(); } } });
  const row = (icon, title, text, fn, aria) => (
    <div className="setting-item clickable" aria-label={aria} {...a11y(fn)}>
      <div className="setting-info">
        <span className="material-icons setting-icon">{icon}</span>
        <div className="setting-text"><h3>{title}</h3><p>{text}</p></div>
      </div>
      <span className="material-icons chevron">chevron_right</span>
    </div>
  );
  const toggle = (icon, title, text, input) => (
    <div className="setting-item">
      <div className="setting-info">
        <span className="material-icons setting-icon">{icon}</span>
        <div className="setting-text"><h3>{title}</h3><p>{text}</p></div>
      </div>
      <label className="switch">{input}<span className="slider round" /></label>
    </div>
  );
  const closeBtn = (label, fn) => <div className="modal-actions"><Btn cls="cancel-btn" icon="close" onClick={fn}>{label}</Btn></div>;
  const displayName = user?.name && user?.surname ? `${user.name} ${user.surname}` : user?.name || user?.username || 'Usuario sin nombre';

  return (
    <div className="pg-settings">
      <div className={`success-notification${showSuccess ? ' show' : ''}`}>
        <div className="notification-content">
          <div className="checkmark-circle">
            <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52"><path className="checkmark__check" fill="none" d="M14 27l8 8 16-16" /></svg>
          </div>
          <h3>¡Perfil actualizado!</h3>
          <p>Tu información ha sido cambiada con éxito</p>
        </div>
      </div>

      <Modal show={showLogout} onClose={() => setShowLogout(false)} title="Confirmar Cierre de Sesión"
        actions={<div className="modal-actions"><Btn cls="cancel-btn" icon="close" onClick={() => setShowLogout(false)}>Cancelar</Btn><Btn cls="confirm-btn" icon="check" onClick={confirmLogout}>Confirmar</Btn></div>}>
        <div className="modal-body"><p>¿Estás seguro de que quieres cerrar sesión?</p></div>
      </Modal>

      <Modal show={showPwd} onClose={() => setShowPwd(false)} title="Cambiar Contraseña"
        actions={!pwdOk && (
          <div className="modal-actions">
            <Btn cls="cancel-btn" icon="close" onClick={() => setShowPwd(false)}>Cancelar</Btn>
            <button className="confirm-btn" onClick={changePassword} disabled={changingPwd}>
              {changingPwd ? <><span className="material-icons">hourglass_empty</span>Cambiando...</> : <><span className="material-icons">check</span>Cambiar</>}
            </button>
          </div>
        )}>
        <div className="modal-body">
          {pwdOk ? (
            <div className="password-success"><span className="material-icons success-icon">check_circle</span><p>¡Contraseña actualizada correctamente!</p></div>
          ) : (
            <>
              <div className="form-group"><label htmlFor="current-password">Contraseña Actual</label><input type="password" id="current-password" name="currentPassword" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} placeholder="Ingresa tu contraseña actual" autoComplete="current-password" /></div>
              <div className="form-group"><label htmlFor="new-password">Nueva Contraseña</label><input type="password" id="new-password" name="newPassword" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Ingresa la nueva contraseña" autoComplete="new-password" /></div>
              <div className="form-group"><label htmlFor="confirm-password">Confirmar Contraseña</label><input type="password" id="confirm-password" name="confirmPassword" value={confPwd} onChange={(e) => setConfPwd(e.target.value)} placeholder="Confirma la nueva contraseña" autoComplete="new-password" /></div>
              <ErrorLine text={pwdError} />
            </>
          )}
        </div>
      </Modal>

      <Modal show={showFaq} onClose={() => setShowFaq(false)} title="Preguntas Frecuentes" actions={closeBtn('Cerrar', () => setShowFaq(false))}>
        <div className="modal-body">
          <ul className="faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <li key={i} className={`faq-item${openFaq === i ? ' faq-open' : ''}`}>
                <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{item.question}</span><span className="material-icons faq-chevron">expand_more</span>
                </button>
                {openFaq === i && <p className="faq-answer">{item.answer}</p>}
              </li>
            ))}
          </ul>
          <p className="faq-footer">¿No encontraste lo que buscabas? Usa "Contactar Soporte" para escribirnos directamente.</p>
        </div>
      </Modal>

      <Modal show={showSupport} onClose={() => setShowSupport(false)} title="Contactar Soporte"
        actions={<div className="modal-actions"><Btn cls="cancel-btn" icon="close" onClick={() => setShowSupport(false)}>Cerrar</Btn><Btn cls="confirm-btn" icon="mail" onClick={contactSupport}>Escribir Correo</Btn></div>}>
        <div className="modal-body">
          <p>Nuestro equipo de soporte técnico está disponible para ayudarte con cualquier problema en la plataforma.</p>
          <ul className="support-info-list">
            <li><span className="material-icons">email</span><div><strong>Correo</strong><p>soporte@edunova.edu.co</p></div></li>
            <li><span className="material-icons">call</span><div><strong>Teléfono</strong><p>(605) 653 9572</p></div></li>
            <li><span className="material-icons">location_on</span><div><strong>Dirección</strong><p>Cra 81C #22-124, San Fernando, Cartagena de Indias, Bolívar</p></div></li>
            <li><span className="material-icons">schedule</span><div><strong>Horario de atención</strong><p>Lunes a viernes, 7:00 a.m. – 3:00 p.m.</p></div></li>
          </ul>
        </div>
      </Modal>

      <Modal show={showTfEnable} onClose={() => { setShowTfEnable(false); setTfEnabled(false); }} title="Activar Autenticación de Dos Factores"
        actions={(
          <div className="modal-actions">
            <Btn cls="cancel-btn" icon="close" onClick={() => { setShowTfEnable(false); setTfEnabled(false); }}>Cancelar</Btn>
            <button className="confirm-btn" disabled={tfBusy} onClick={confirmEnableTwoFactor}>
              <span className={`material-icons${tfBusy ? ' spin' : ''}`}>{tfBusy ? 'autorenew' : 'check'}</span>Activar
            </button>
          </div>
        )}>
        <div className="modal-body">
          <p>Enviamos un código de 6 dígitos a <strong>{tfHint}</strong>. Ingrésalo para activar esta protección extra en tu cuenta.</p>
          <p className="spam-hint"><span className="material-icons">info</span>Si no lo ves en unos minutos, revisa tu carpeta de spam o correo no deseado.</p>
          <div className="form-group">
            <label htmlFor="enable-2fa-code">Código de verificación</label>
            <input type="text" id="enable-2fa-code" inputMode="numeric" maxLength={6} value={tfCode} onChange={(e) => setTfCode(e.target.value)} name="enable2faCode" placeholder="123456" autoComplete="one-time-code" />
          </div>
          <ErrorLine text={tfError} icon />
        </div>
      </Modal>

      <Modal show={showTfDisable} onClose={() => { setShowTfDisable(false); setTfEnabled(true); }} title="Desactivar Autenticación de Dos Factores"
        actions={(
          <div className="modal-actions">
            <Btn cls="cancel-btn" icon="close" onClick={() => { setShowTfDisable(false); setTfEnabled(true); }}>Cancelar</Btn>
            <button className="confirm-btn" disabled={tfBusy} onClick={confirmDisableTwoFactor}>
              <span className={`material-icons${tfBusy ? ' spin' : ''}`}>{tfBusy ? 'autorenew' : 'check'}</span>Desactivar
            </button>
          </div>
        )}>
        <div className="modal-body">
          <p>Por seguridad, confirma tu contraseña actual para desactivar esta protección.</p>
          <div className="form-group">
            <label htmlFor="disable-2fa-password">Contraseña actual</label>
            <input type="password" id="disable-2fa-password" value={tfPassword} onChange={(e) => setTfPassword(e.target.value)} name="disable2faPassword" placeholder="Tu contraseña" autoComplete="current-password" />
          </div>
          <ErrorLine text={tfError} icon />
        </div>
      </Modal>

      <Modal show={showSessions} onClose={() => setShowSessions(false)} title="Sesiones Activas" actions={closeBtn('Cerrar', () => setShowSessions(false))}>
        <div className="modal-body">
          {loadingSessions ? (
            <div className="sessions-loading"><span className="material-icons spin">autorenew</span><p>Cargando tus sesiones...</p></div>
          ) : sessionsError ? (
            <p className="error-message">{sessionsError}</p>
          ) : sessions.length === 0 ? (
            <p>No se encontraron sesiones activas.</p>
          ) : (
            <ul className="sessions-list">
              {sessions.map((s) => (
                <li key={s.id} className={`session-item${s.current ? ' session-current' : ''}`}>
                  <span className="material-icons session-icon">devices</span>
                  <div className="session-info">
                    <strong>{s.device}</strong>
                    {s.current && <span className="session-badge">Este dispositivo</span>}
                    <p className="session-meta">{s.ipAddress || 'IP no disponible'} · última actividad: {new Date(s.lastUsedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</p>
                  </div>
                  <button className="session-revoke-btn" disabled={revoking === s.id} onClick={() => revokeSession(s.id, s.current)} title="Cerrar esta sesión">
                    <span className={`material-icons${revoking === s.id ? ' spin' : ''}`}>{revoking === s.id ? 'autorenew' : 'logout'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal show={showTerms} onClose={() => setShowTerms(false)} title="Términos y Condiciones" legal
        actions={<div className="modal-actions"><Btn cls="confirm-btn" icon="check" onClick={() => acceptLegal('terms', () => setShowTerms(false))}>Aceptar y Cerrar</Btn></div>}>
        <div className="modal-body legal-content"><div dangerouslySetInnerHTML={{ __html: TERMS }} /><p className="last-update">Última actualización: Febrero {currentYear}</p></div>
      </Modal>
      <Modal show={showPrivacy} onClose={() => setShowPrivacy(false)} title="Política de Privacidad" legal
        actions={<div className="modal-actions"><Btn cls="confirm-btn" icon="check" onClick={() => acceptLegal('privacy', () => setShowPrivacy(false))}>Entendido y Cerrar</Btn></div>}>
        <div className="modal-body legal-content"><div dangerouslySetInnerHTML={{ __html: PRIVACY }} /><p className="last-update">Última actualización: Febrero {currentYear}</p></div>
      </Modal>
      <Modal show={showCookies} onClose={() => setShowCookies(false)} title="Política de Cookies" legal
        actions={<div className="modal-actions"><Btn cls="confirm-btn" icon="check" onClick={() => setShowCookies(false)}>Cerrar</Btn></div>}>
        <div className="modal-body legal-content"><div dangerouslySetInnerHTML={{ __html: COOKIES }} /><p className="last-update">Última actualización: {currentYear}</p></div>
      </Modal>
      <Modal show={showRefund} onClose={() => setShowRefund(false)} title="Política de Reembolsos" legal
        actions={<div className="modal-actions"><Btn cls="confirm-btn" icon="check" onClick={() => setShowRefund(false)}>Cerrar</Btn></div>}>
        <div className="modal-body legal-content"><div dangerouslySetInnerHTML={{ __html: REFUND }} /><p className="last-update">Última actualización: {currentYear}</p></div>
      </Modal>

      <div className="settings-container">
        <h1>Configuración</h1>

        <div className="settings-section">
          <h2>Perfil de Usuario</h2>

          <div className="profile-section">
            <div className="current-avatar">
              {previewUrl && <img src={previewUrl} alt="Vista previa" className="avatar-preview" onError={onImageError} />}
              {!previewUrl && picture && <img src={picture} alt="Avatar" onError={onImageError} />}
              {!previewUrl && !picture && <div className="user-initials">{initials}</div>}
              {previewUrl && <div className="preview-badge"><span className="material-icons">check_circle</span></div>}
              {!previewUrl && picture && <div className="profile-badge"><span className="material-icons">photo_camera</span></div>}
            </div>

            <div className="profile-info-container">
              <div className="profile-info">
                <h3>{displayName}</h3>
                <p>{user?.email || 'Sin email'}</p>
              </div>

              {editing && (
                <div className={`inline-edit-form${formHiding ? ' hiding' : ''}`}>
                  <div className="edit-fields-inline">
                    <input type="text" id="edit-name" name="editName" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" className="input-inline" />
                    <input type="text" id="edit-surname" name="editSurname" value={editSurname} onChange={(e) => setEditSurname(e.target.value)} placeholder="Apellido" className="input-inline" />
                    <input type="email" id="edit-email" name="editEmail" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Correo" className="input-inline" />
                    <div className="btn-row">
                      <button className="btn-inline save" onClick={saveProfile} disabled={updating} title="Guardar" aria-label="Guardar perfil"><span className="material-icons">check</span></button>
                      <button className="btn-inline cancel" onClick={cancelEdit} disabled={updating} title="Cancelar" aria-label="Cancelar edición de perfil"><span className="material-icons">close</span></button>
                    </div>
                  </div>
                  <ErrorLine text={profileError} icon />
                </div>
              )}
            </div>
          </div>

          <div className="upload-section">
            <div className="action-buttons-row">
              <label htmlFor="profile-picture" className="action-button upload-button">
                <span className="material-icons">cloud_upload</span><span className="button-text">Subir Foto de Perfil</span>
              </label>
              <input type="file" id="profile-picture" name="profilePicture" accept="image/*" onChange={onFileSelected} className="file-input" />
              <button className="action-button edit-button" onClick={startEdit}>
                <span className="material-icons">edit</span><span className="button-text">Cambiar Nombre</span>
              </button>
            </div>

            {selectedFile && (
              <div className="upload-preview">
                <img src={previewUrl || ''} alt="Vista previa" className="preview-thumbnail" />
                <div className="upload-info"><span className="material-icons">image</span><span>{selectedFile.name}</span></div>
                <div className="upload-actions">
                  <button onClick={uploadProfilePicture} className="confirm-btn"><span className="material-icons">check</span><span>Confirmar</span></button>
                  <button onClick={clearPreview} className="cancel-btn"><span className="material-icons">close</span><span>Cancelar</span></button>
                </div>
              </div>
            )}
          </div>

          <div className="settings-section">
            <h2>Apariencia</h2>
            <div className="settings-options">
              {toggle('dark_mode', 'Modo Oscuro', 'Activa el estilo Tech / Cyberpunk de la plataforma',
                <input type="checkbox" id="dark-mode" name="darkMode" checked={theme === 'dark'} onChange={(e) => setTheme(e.target.checked ? 'dark' : 'light')} title="Modo oscuro" />)}
            </div>
          </div>

          <div className="settings-section">
            <h2>Notificaciones</h2>
            <div className="settings-options">
              {toggle('notifications', 'Notificaciones Push', 'Recibe notificaciones en tiempo real',
                <input type="checkbox" id="push-notifications" name="pushNotifications" checked={push} onChange={(e) => { setPush(e.target.checked); lsSet('pushNotifications', e.target.checked); }} title="Notificaciones push" />)}
              {toggle('email', 'Notificaciones por Email', 'Recibe actualizaciones por correo electrónico',
                <input type="checkbox" id="email-notifications" name="emailNotifications" checked={email} onChange={(e) => { setEmail(e.target.checked); lsSet('emailNotifications', e.target.checked); }} title="Notificaciones por email" />)}
              {toggle('message', 'Mensajes', 'Notificaciones de nuevos mensajes',
                <input type="checkbox" id="message-notifications" name="messageNotifications" checked={messagesOn} onChange={(e) => { setMessagesOn(e.target.checked); lsSet('messageNotifications', e.target.checked); }} title="Notificaciones de mensajes" />)}
            </div>
          </div>

          <div className="settings-section">
            <h2>Seguridad</h2>
            <div className="settings-options">
              {row('lock', 'Cambiar Contraseña', 'Actualiza tu contraseña de acceso', openPwd, 'Cambiar contraseña')}
              {toggle('security', 'Autenticación de Dos Factores', 'Añade una capa extra de seguridad',
                <input type="checkbox" id="two-factor-auth" name="twoFactorAuth" title="Autenticación de dos factores" checked={tfEnabled} disabled={tfBusy} onChange={onToggleTwoFactor} />)}
              {row('devices', 'Sesiones Activas', 'Gestiona tus dispositivos conectados', openSessions, 'Ver sesiones activas')}
            </div>
          </div>

          <div className="settings-section">
            <h2>Privacidad</h2>
            <div className="settings-options">
              {toggle('visibility', 'Perfil Público', 'Permite que otros usuarios te encuentren',
                <input type="checkbox" id="public-profile" name="publicProfile" defaultChecked title="Perfil público" />)}
              <div className={`setting-item clickable${downloading ? ' disabled' : ''}`} aria-label="Descargar mis datos" {...a11y(() => !downloading && downloadMyData())}>
                <div className="setting-info">
                  <span className="material-icons setting-icon">{downloading ? 'hourglass_empty' : 'download'}</span>
                  <div className="setting-text"><h3>Descargar mis Datos</h3><p>{downloading ? 'Preparando tu exportación completa...' : 'Exporta una copia completa de tu información'}</p></div>
                </div>
                <span className="material-icons chevron">chevron_right</span>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h2>Ayuda</h2>
            <div className="settings-options">
              {row('help', 'Preguntas Frecuentes', 'Respuestas a dudas comunes', () => { setOpenFaq(null); setShowFaq(true); }, 'Ver preguntas frecuentes')}
              {row('support_agent', 'Contactar Soporte', 'Obtén ayuda del equipo técnico', () => setShowSupport(true), 'Contactar soporte')}
              {row('feedback', 'Enviar Comentarios', 'Ayúdanos a mejorar la aplicación', sendFeedback, 'Enviar comentarios')}
            </div>
          </div>

          <div className="settings-section">
            <h2>Acerca de</h2>
            <div className="about-card">
              <div className="about-card-header">
                <img src="/logo-symbol.svg" alt="Logo de EduNova" className="about-logo" />
                <div className="about-header-text"><h3>EduNova</h3><span className="about-version-badge">Versión 1.0.0</span></div>
              </div>
              <p className="about-description">Plataforma de gestión académica de EduNova: calificaciones, boletines, reportes y comunicación entre estudiantes, docentes y familias.</p>
              <div className="about-contact">
                <span className="material-icons about-contact-icon">mail</span>
                <div className="about-contact-text"><span className="about-contact-label">Contacto de soporte</span><a href="mailto:soporte@edunova.edu.co">soporte@edunova.edu.co</a></div>
              </div>
            </div>

            <div className="settings-options">
              {row('description', 'Términos y Condiciones', 'Lee nuestros términos de uso', () => setShowTerms(true), 'Ver Términos y Condiciones')}
              {row('privacy_tip', 'Política de Privacidad', 'Cómo protegemos tus datos', () => setShowPrivacy(true), 'Ver Política de Privacidad')}
              {row('cookie', 'Política de Cookies', 'Qué guardamos en tu navegador', () => setShowCookies(true), 'Ver Política de Cookies')}
              {row('receipt_long', 'Política de Reembolsos', 'Condiciones sobre pagos y reembolsos', () => setShowRefund(true), 'Ver Política de Reembolsos')}
            </div>
          </div>

          <div className="settings-section">
            <h2>Acciones de Cuenta</h2>
            <div className="account-actions">
              <button className="logout-btn" onClick={() => setShowLogout(true)}><span className="material-icons">logout</span><span>Cerrar Sesión</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}