import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/dashboard.css';
import { api, imageUrl } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useDialog } from '../context/UiContext.jsx';
import { bus } from '../services/events.js';
import { showPush } from '../services/notifications.js';
import Overlay from '../components/Overlay.jsx';

const MAX_ACTIVITIES = 5;
const ACTIVITIES_KEY = 'recent_activities';

const GREET_MORNING = ['Buenos días', '¡Buenos días!', 'Buenos días, que tengas un excelente día', 'Arriba ese ánimo, buenos días', 'Buen día, a por otra jornada productiva', '¡Buenos días! Que este día venga cargado de buenas noticias', 'Buenos días, empecemos con energía', 'Feliz comienzo de día'];
const GREET_AFTERNOON = ['Buenas tardes', '¡Buenas tardes!', 'Buenas tardes, sigue con ese buen ritmo', 'Buenas tardes, ya vamos por la mitad del día', '¡Buenas tardes! Vamos con todo lo que falta', 'Buenas tardes, gracias por seguir aquí', 'Feliz tarde, sigamos adelante'];
const GREET_NIGHT = ['Buenas noches', '¡Buenas noches!', 'Buenas noches, gracias por tu trabajo hoy', 'Buenas noches, ya casi termina el día', 'Buenas noches, descansa cuando puedas', '¡Buenas noches! Un gusto tenerte por aquí', 'Feliz noche'];
const GREET_DAWN = ['Buenas noches', 'Hola, trasnochando por aquí', 'Buenas, qué madrugador/a', 'Hola, un gusto verte a esta hora'];

const ESCALA = [
  { letra: 'E', nombre: 'Excelente', rango: '4.6 – 5.0', color: '#16a34a' },
  { letra: 'S', nombre: 'Sobresaliente', rango: '4.0 – 4.5', color: '#5627e9' },
  { letra: 'B', nombre: 'Bueno', rango: '3.5 – 3.9', color: '#f59e0b' },
  { letra: 'A', nombre: 'Aceptable', rango: '3.0 – 3.4', color: '#ea580c' },
  { letra: 'I', nombre: 'Insuficiente', rango: '1.0 – 2.9', color: '#dc2626' },
];

const ROLE_NAMES = { ADMIN: 'Administrador', TEACHER: 'Profesor', PARENT: 'Padre de Familia', STUDENT: 'Estudiante', DIRECTOR_DE_GRUPO: 'Director de Grupo' };
const classroomLetter = (c) => { const m = (c || '').match(/([A-Za-z])$/); return m ? m[1].toUpperCase() : ''; };
const pad = (n) => String(n).padStart(2, '0');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } };

function formatActivityTime(ts) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (hours < 24) return `Hace ${hours} hr`;
  if (days === 1) return 'Ayer';
  return new Date(ts).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
}

function showSuccessAnimation() {
  const div = document.createElement('div');
  div.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px 50px; border-radius: 16px; font-size: 20px; font-weight: 600; z-index: 10000; box-shadow: 0 20px 60px rgba(16, 185, 129, 0.4); animation: successPulse 0.8s ease-out; min-width: 300px; text-align: center;`;
  div.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
      <div class="checkmark-container" style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); display: flex; align-items: center; justify-content: center; animation: checkmarkBounce 0.6s ease-out 0.3s both;">
        <svg class="checkmark" width="32" height="32" viewBox="0 0 52 52" style="animation: checkmarkStroke 0.6s ease-out 0.5s both;">
          <path class="checkmark__check" fill="none" d="m9 16 11 11 25-25" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div style="font-size: 18px; font-weight: 600;">¡Notificación Enviada!</div>
      <div style="font-size: 14px; opacity: 0.9;">Todos los destinatarios recibieron el mensaje</div>
    </div>`;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes successPulse { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3) rotate(-10deg); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1) rotate(2deg); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(0deg); } }
    @keyframes checkmarkBounce { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
    @keyframes checkmarkStroke { 0% { stroke-dasharray: 166; stroke-dashoffset: 166; } 100% { stroke-dasharray: 166; stroke-dashoffset: 0; } }`;
  document.head.appendChild(style);
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.animation = 'successPulse 0.4s ease-out reverse';
    setTimeout(() => { div.remove(); style.remove(); }, 400);
  }, 3000);
}

/** Panel principal: saludo, cronómetro, estadísticas, accesos rápidos por rol y actividad (dashboard del original). */
export default function Dashboard() {
  const { user, role: roleRaw, isAdmin } = useAuth();
  const nav = useNavigate();
  const dialog = useDialog();

  const roleName = String(user?.role?.name || user?.role || '').toUpperCase();
  const isParent = roleName === 'PARENT';
  const isDirector = roleName === 'DIRECTOR_DE_GRUPO';
  const isTeacherRole = roleName === 'TEACHER' || isDirector;
  const isTeacherUser = isTeacherRole;

  // Conteos
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalGrades, setTotalGrades] = useState(0);
  const [totalSubjects, setTotalSubjects] = useState(8);
  const [totalReports] = useState(45);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [reportCardsLoaded, setReportCardsLoaded] = useState(false);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [homeroomAssignment, setHomeroomAssignment] = useState(null);

  // Modales
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showAddGradeModal, setShowAddGradeModal] = useState(false);
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [showViewReportsModal, setShowViewReportsModal] = useState(false);
  const [showSendNotificationModal, setShowSendNotificationModal] = useState(false);
  const [showCountdownConfigModal, setShowCountdownConfigModal] = useState(false);
  const emptyStudent = { name: '', surname: '', documentNumber: '', grade: 'Grado 1º', classGroup: 'Salon A' };
  const [newStudent, setNewStudent] = useState(emptyStudent);
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const emptyNotif = { title: '', message: '', recipientType: 'ALL' };
  const [newNotification, setNewNotification] = useState(emptyNotif);
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  // Aviso propio del panel
  const [notif, setNotif] = useState({ show: false, type: null, message: '' });
  const notifTimer = useRef(null);
  const hideNotification = () => { setNotif((n) => ({ ...n, show: false })); setTimeout(() => setNotif({ show: false, type: null, message: '' }), 300); };
  const showNotification = (type, message, ms) => {
    setNotif({ show: true, type, message });
    clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(hideNotification, ms);
  };
  const showSuccessNotification = (m) => showNotification('success', m, 3000);
  const showErrorNotification = (m) => showNotification('error', m, 4000);

  // Actividad reciente
  const [recentActivities, setRecentActivities] = useState(() => { try { return JSON.parse(lsGet(ACTIVITIES_KEY) || '[]'); } catch { return []; } });
  const addActivity = useCallback((icon, description) => {
    setRecentActivities((cur) => {
      const next = [{ icon, description, timestamp: Date.now() }, ...cur].slice(0, MAX_ACTIVITIES);
      lsSet(ACTIVITIES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Cronómetro
  const [cd, setCd] = useState({ show: false, name: '', targetDate: '', daysInput: 0, endDate: '', d: '00', h: '00', m: '00', s: '00' });
  const flags = useRef({ h12: false, finished: false, d7: false });
  const cdInterval = useRef(null);

  const updateCountdown = useCallback((name, targetDate) => {
    if (!targetDate) return;
    const distance = new Date(targetDate).getTime() - Date.now();
    if (distance < 0) {
      setCd((c) => ({ ...c, d: '00', h: '00', m: '00', s: '00' }));
      if (!flags.current.finished) {
        flags.current.finished = true;
        lsSet('countdownNotificationFinished', 'true');
        showPush(name, '¡El tiempo ha terminado!');
        addActivity('check_circle', `Tiempo terminado: ${name}`);
      }
      clearInterval(cdInterval.current);
      return;
    }
    const days = Math.floor(distance / 86400000);
    const hours = Math.floor((distance % 86400000) / 3600000);
    const minutes = Math.floor((distance % 3600000) / 60000);
    const seconds = Math.floor((distance % 60000) / 1000);
    setCd((c) => ({ ...c, d: pad(days), h: pad(hours), m: pad(minutes), s: pad(seconds) }));
    if (distance <= 7 * 86400000 && !flags.current.d7) {
      flags.current.d7 = true;
      lsSet('countdownNotification7d', 'true');
      showPush(name, `Faltan 7 días o menos (${days} día${days !== 1 ? 's' : ''})`);
      addActivity('schedule', `Recordatorio ${name}: Faltan 7 días o menos`);
    }
    if (distance <= 12 * 3600000 && !flags.current.h12) {
      flags.current.h12 = true;
      lsSet('countdownNotification12h', 'true');
      const timeText = days > 0 ? `${days} día(s) y ${hours} hora(s)` : hours > 0 ? `${hours} hora(s) y ${minutes} minuto(s)` : `${minutes} minuto(s)`;
      showPush(name, `Faltan ${timeText}`);
      addActivity('schedule', `Recordatorio ${name}: Faltan ${timeText}`);
    }
  }, [addActivity]);

  const startCountdown = useCallback((name, targetDate) => {
    clearInterval(cdInterval.current);
    updateCountdown(name, targetDate);
    cdInterval.current = setInterval(() => updateCountdown(name, targetDate), 1000);
  }, [updateCountdown]);

  useEffect(() => {
    const saved = lsGet('countdownConfig');
    if (saved) {
      const config = JSON.parse(saved);
      const name = config.name || '';
      const targetDate = config.targetDate || '';
      flags.current = { h12: lsGet('countdownNotification12h') === 'true', finished: lsGet('countdownNotificationFinished') === 'true', d7: lsGet('countdownNotification7d') === 'true' };
      if (name && targetDate) {
        const endDate = new Date(targetDate).toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        setCd((c) => ({ ...c, show: true, name, targetDate, endDate }));
        startCountdown(name, targetDate);
      } else setCd((c) => ({ ...c, name, targetDate }));
    }
    return () => clearInterval(cdInterval.current);
  }, [startCountdown]);

  const saveCountdownConfig = () => {
    if (!cd.name) { showErrorNotification('Por favor ingrese un título'); return; }
    let target;
    if (cd.targetDate) target = new Date(cd.targetDate);
    else if (cd.daysInput && cd.daysInput > 0) { target = new Date(); target.setDate(target.getDate() + Number(cd.daysInput)); }
    else { showErrorNotification('Por favor ingrese una fecha o días'); return; }

    flags.current = { h12: false, finished: false, d7: false };
    ['countdownNotification12h', 'countdownNotificationFinished', 'countdownNotification7d'].forEach(lsDel);
    const iso = target.toISOString();
    lsSet('countdownConfig', JSON.stringify({ name: cd.name, targetDate: iso }));
    const endDate = target.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    setCd((c) => ({ ...c, show: true, targetDate: iso, endDate }));
    setShowCountdownConfigModal(false);
    startCountdown(cd.name, iso);
    showSuccessNotification('Cronómetro configurado correctamente');

    const diff = target.getTime() - Date.now();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const timeRemaining = days > 0 ? `${days} día${days > 1 ? 's' : ''}, ${hours} hora${hours > 1 ? 's' : ''}`
      : hours > 0 ? `${hours} hora${hours > 1 ? 's' : ''}, ${minutes} minuto${minutes > 1 ? 's' : ''}` : `${minutes} minuto${minutes > 1 ? 's' : ''}`;
    const dateStr = target.toLocaleString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    showPush(`⏰ ${cd.name}`, `Fecha: ${dateStr}. Tiempo: ${timeRemaining}`);
    addActivity('timer', `Cronómetro configurado: ${cd.name} - ${dateStr}`);
  };

  // Saludo animado desde el centro
  const [greetingLetters, setGreetingLetters] = useState([]);
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current || !user) return;
    greeted.current = true;
    const userName = user?.name ? user.name.split(' ')[0] : '';
    const hour = new Date().getHours();
    const frases = hour >= 5 && hour < 12 ? GREET_MORNING : hour >= 12 && hour < 19 ? GREET_AFTERNOON : hour >= 19 ? GREET_NIGHT : GREET_DAWN;
    const base = frases[Math.floor(Math.random() * frases.length)];
    const text = userName ? `${base}, ${userName}` : base;
    const chars = text.split('');
    const middle = Math.floor(chars.length / 2);
    const letters = [];
    let delay = 0;
    for (let i = 0; i <= middle; i++) {
      setTimeout(() => {
        if (chars[middle - i]) letters[middle - i] = chars[middle - i];
        if (chars[middle + i] && i > 0) letters[middle + i] = chars[middle + i];
        setGreetingLetters(Array.from(letters, (l) => l ?? ''));
      }, delay);
      delay += 30;
    }
  }, [user]);

  // Carga de datos
  const loadStudentCount = useCallback(async () => {
    if ((user?.role?.name || user?.role) === 'PARENT') { setTotalStudents(0); setStudentsLoaded(true); return; }
    try { setTotalStudents((await api.get('/students')).length); } catch { setTotalStudents(0); }
    setStudentsLoaded(true);
  }, [user]);
  const loadReportCardCount = useCallback(async () => {
    try { setTotalGrades((await api.get(isTeacherUser ? '/grades/count/teacher' : '/grades/count')).count || 0); } catch { setTotalGrades(0); }
    setReportCardsLoaded(true);
  }, [isTeacherUser]);

  useEffect(() => { loadStudentCount(); }, [loadStudentCount]);
  // Se refresca el conteo cuando el editor de notas avisa de cambios.
  useEffect(() => { setReportCardsLoaded(false); loadReportCardCount(); return bus.on('grades:changed', () => { setReportCardsLoaded(false); loadReportCardCount(); }); }, [loadReportCardCount]);

  useEffect(() => {
    if (!user?.id) return;
    setTeacherSubjects([]); setHomeroomAssignment(null);
    if (roleName === 'DIRECTOR_DE_GRUPO') api.get(`/homeroom-assignments/by-user/${user.id}`).then(setHomeroomAssignment).catch(() => setHomeroomAssignment(null));
    if (roleName === 'TEACHER' || roleName === 'DIRECTOR_DE_GRUPO') {
      api.get(`/subjects/teacher/${user.id}`).then((s) => setTeacherSubjects(s.filter((x) => x.name && x.name.trim()).map((x) => x.name.trim()))).catch(() => setTeacherSubjects([]));
    }
    if (roleName === 'ADMIN' || user.additionalAdmin) {
      api.get('/school-year/fecha-alcanzada').then((r) => { if (r.alcanzada && window.location.pathname !== '/school-year-config') nav('/school-year-config'); }).catch(() => {});
    }
  }, [user?.id]); // eslint-disable-line

  const initials = user?.name && user?.surname ? (user.name.charAt(0) + user.surname.charAt(0)).toUpperCase() : user?.name ? user.name.charAt(0).toUpperCase() : '';
  const displayName = user ? (`${user.name || ''} ${user.surname || ''}`.trim() || user.username || 'Usuario sin nombre') : 'Usuario sin autenticar';
  const displayRole = user?.role?.name ? (ROLE_NAMES[user.role.name] || user.role.name) : '';
  const picture = user?.profilePicture ? imageUrl(user.profilePicture) : null;
  const homeroomLabel = homeroomAssignment ? `Director ${homeroomAssignment.grade || ''}${classroomLetter(homeroomAssignment.classroom) ? ` ${classroomLetter(homeroomAssignment.classroom)}` : ''}`.trim() : '';

  const onImageError = (e) => {
    const img = e.target;
    if (!img.src.includes('/uploads/profile-pictures/')) return;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent) {
      parent.querySelector('.user-initials-fallback')?.remove();
      const d = document.createElement('div');
      d.className = 'profile-initials user-initials-fallback';
      d.textContent = initials;
      parent.appendChild(d);
    }
  };

  const roleTip = isAdmin
    ? { icon: 'admin_panel_settings', title: 'Panel de administración', text: 'Gestiona estudiantes, profesores, períodos, boletines y consolidados desde los accesos de abajo.' }
    : isTeacherRole ? { icon: 'edit_note', title: 'Tu espacio docente', text: 'Registra calificaciones, gestiona recuperaciones y comunícate con los padres de familia.' }
    : isParent ? { icon: 'family_restroom', title: 'Seguimiento académico', text: 'Consulta las notas y los boletines de tus hijos y escribe a sus profesores cuando lo necesites.' }
    : { icon: 'waving_hand', title: 'Bienvenido', text: 'Usa los accesos para moverte por la plataforma.' };

  const quickLinks = (() => {
    if (isAdmin) return [
      { icon: 'person_add', label: 'Agregar estudiante', desc: 'Registro rápido', action: 'addStudent', color: '#5627e9' },
      { icon: 'campaign', label: 'Enviar información', desc: 'Avisos a la comunidad', action: 'sendNotification', color: '#d710e7' },
      { icon: 'schedule', label: 'Cronómetro', desc: 'Cuenta regresiva', action: 'countdown', color: '#a35ef4' },
      { icon: 'school', label: 'Estudiantes', desc: 'Listado y matrícula', route: '/students', color: '#5627e9' },
      { icon: 'groups', label: 'Profesores', desc: 'Cuentas y materias', route: '/teachers', color: '#0d9488' },
      { icon: 'family_restroom', label: 'Padres de familia', desc: 'Cuentas y vínculos', route: '/parents', color: '#f59e0b' },
      { icon: 'menu_book', label: 'Materias', desc: 'Áreas y asignaturas', route: '/subjects', color: '#9564f0' },
      { icon: 'event', label: 'Períodos', desc: 'Abrir y cerrar períodos', route: '/periods', color: '#ec4899' },
      { icon: 'assignment', label: 'Generar boletines', desc: 'Por grado y salón', route: '/boletines', color: '#16a34a' },
      { icon: 'folder_open', label: 'Boletines generados', desc: 'Consulta y descarga', route: '/boletines-generados', color: '#15803d' },
      { icon: 'assessment', label: 'Consolidados', desc: 'Resumen por salón', route: '/consolidados-generados', color: '#ea580c' },
      { icon: 'workspace_premium', label: 'Promociones', desc: 'Egresados Grado 11º', route: '/promociones', color: '#a16207' },
      { icon: 'supervisor_account', label: 'Directores de grupo', desc: 'Asignación por salón', route: '/directors-group', color: '#7c3aed' },
      { icon: 'event_repeat', label: 'Año escolar', desc: 'Cierre y adelantar año', route: '/school-year-config', color: '#dc2626' },
      { icon: 'chat', label: 'Mensajes', desc: 'Chats con la comunidad', route: '/chats', color: '#b904c5' },
      { icon: 'settings', label: 'Ajustes', desc: 'Perfil y seguridad', route: '/settings', color: '#6c648b' },
    ];
    if (isTeacherRole) {
      const links = [
        { icon: 'grade', label: 'Calificaciones', desc: 'Registrar y editar notas', route: '/grades', color: '#5627e9' },
        { icon: 'published_with_changes', label: 'Recuperaciones', desc: 'Planes y notas de recuperación', route: '/recoveries', color: '#16a34a' },
      ];
      if (isDirector) links.push(
        { icon: 'assessment', label: 'Consolidado', desc: 'Resumen de tu salón', route: '/reports', color: '#ea580c' },
        { icon: 'folder_open', label: 'Consolidados generados', desc: 'Consulta y descarga', route: '/consolidados-generados', color: '#15803d' },
      );
      links.push(
        { icon: 'chat', label: 'Mensajes', desc: 'Habla con padres y colegas', route: '/chats', color: '#b904c5' },
        { icon: 'settings', label: 'Ajustes', desc: 'Perfil y seguridad', route: '/settings', color: '#6c648b' },
      );
      return links;
    }
    if (isParent) return [
      { icon: 'grade', label: 'Mis notas', desc: 'Calificaciones de tus hijos', route: '/mis-notas', color: '#5627e9' },
      { icon: 'assignment', label: 'Mis boletines', desc: 'Descarga y consulta', route: '/mis-boletines', color: '#16a34a' },
      { icon: 'bar_chart', label: 'Ver reportes', desc: 'Resumen por período', route: '/mis-boletines', color: '#ea580c' },
      { icon: 'chat', label: 'Mensajes', desc: 'Escribe a los profesores', route: '/chats', color: '#b904c5' },
      { icon: 'settings', label: 'Mi perfil', desc: 'Datos y seguridad', route: '/settings', color: '#6c648b' },
    ];
    return [
      { icon: 'chat', label: 'Mensajes', desc: 'Chats', route: '/chats', color: '#b904c5' },
      { icon: 'settings', label: 'Ajustes', desc: 'Perfil y seguridad', route: '/settings', color: '#6c648b' },
    ];
  })();

  const onQuickLink = (l) => {
    if (l.route) { nav(l.route); return; }
    if (l.action === 'addStudent') { setNewStudent(emptyStudent); setIsSavingStudent(false); setShowAddStudentModal(true); }
    if (l.action === 'sendNotification') { setNewNotification(emptyNotif); setIsSendingNotification(false); setShowSendNotificationModal(true); }
    if (l.action === 'countdown') setShowCountdownConfigModal(true);
  };

  const addStudent = async (e) => {
    e?.preventDefault();
    if (!newStudent.name || !newStudent.surname) { dialog.alert('Por favor complete los campos obligatorios (nombres y apellidos)', 'Campos obligatorios'); return; }
    setIsSavingStudent(true);
    const data = { name: newStudent.name.trim(), surname: newStudent.surname.trim(), grade: newStudent.grade, classGroup: newStudent.classGroup, documentNumber: newStudent.documentNumber?.trim() || null };
    try {
      await api.post('/students', data);
      setShowAddStudentModal(false); setNewStudent(emptyStudent);
      showSuccessNotification(`El estudiante "${data.name} ${data.surname}" fue agregado correctamente`);
      const gradeInfo = (data.grade ? `Grado ${data.grade}` : '') + (data.classGroup ? ` - Grupo ${data.classGroup}` : '');
      showPush('👨‍🎓 Nuevo estudiante registrado', `${data.name} ${data.surname}${gradeInfo ? ` - ${gradeInfo}` : ''}`);
      addActivity('person_add', `Nuevo estudiante: ${data.name} ${data.surname}${gradeInfo ? ` (${gradeInfo})` : ''}`);
      loadStudentCount();
    } catch {
      showErrorNotification('Error al agregar el estudiante. Verifique que el servidor esté ejecutándose.');
      setIsSavingStudent(false);
    }
  };

  const sendNotification = async (e) => {
    e?.preventDefault();
    if (!newNotification.title || !newNotification.message) { dialog.alert('Por favor complete el título y mensaje de la notificación', 'Dato faltante'); return; }
    setIsSendingNotification(true);
    try {
      await api.post('/notifications/send', { title: newNotification.title, message: newNotification.message, type: 'ADMIN_MESSAGE', recipientType: newNotification.recipientType });
      setShowSendNotificationModal(false); setNewNotification(emptyNotif);
      showSuccessAnimation();
    } catch {
      dialog.alert('Error al enviar las notificaciones. Inténtelo de nuevo.', 'Error');
    }
    setIsSendingNotification(false);
  };

  const recipientLabel = { PARENTS: 'Padres de familia', TEACHERS: 'Profesores', ADMINISTRATORS: 'Administradores' }[newNotification.recipientType] || 'Toda la comunidad';
  const generateReport = () => dialog.alert('Funcionalidad de generación de reportes en desarrollo...', 'En desarrollo');
  const a11y = (fn) => ({ role: 'button', tabIndex: 0, onClick: fn, onKeyDown: (e) => { if (e.key === 'Enter') fn(); if (e.key === ' ') { fn(); e.preventDefault(); } } });

  return (
    <div className="pg-dashboard">
      <div className="dashboard-content">
        {notif.show && (
          <Overlay className="notification-overlay" onClick={hideNotification}>
            <div className={`notification-content${notif.type === 'success' ? ' notification-success' : ''}${notif.type === 'error' ? ' notification-error' : ''}`} onClick={(e) => e.stopPropagation()}>
              <div className="notification-icon">
                {notif.type === 'success' && <svg className="checkmark" viewBox="0 0 52 52"><path className="checkmark__check" fill="none" d="m14.1 27.2l7.1 7.2 16.7-16.8" /></svg>}
                {notif.type === 'error' && <svg className="error-mark" viewBox="0 0 52 52"><path className="error-mark__x" fill="none" d="M16 16l20 20M36 16L16 36" /></svg>}
              </div>
              <div className="notification-body">
                <div className="notification-title">{notif.type === 'success' ? '¡Cambio efectivo!' : '¡Error!'}</div>
                <div className="notification-message">{notif.message}</div>
              </div>
              <button className="notification-close" onClick={hideNotification}>✕</button>
            </div>
          </Overlay>
        )}

        {/* Perfil */}
        <div className="user-profile-section">
          <div className="profile-greeting">
            <h1 className="greeting-text">
              {greetingLetters.map((l, i) => <span key={i} className="greeting-letter">{l}</span>)}
            </h1>
          </div>
          <div className="profile-card">
            <div className="profile-main-content">
              <div className="profile-avatar">
                {picture
                  ? <img src={picture} alt={initials} title={initials} className="profile-image" onError={onImageError} />
                  : <div className="profile-initials">{initials}</div>}
              </div>
              <div className="profile-info">
                <h2>{displayName}</h2>
                {user?.username && <p className="profile-name">@{user.username}</p>}
                <p className="profile-role">{displayRole}</p>
                {(isTeacherUser || homeroomAssignment) && (teacherSubjects.length > 0 || homeroomAssignment) && (
                  <p className="profile-subjects">
                    {teacherSubjects.map((s, i) => <span key={i} className="subject-badge-small">{s}</span>)}
                    {homeroomLabel && <span className="subject-badge-small director-badge-dashboard">{homeroomLabel}</span>}
                  </p>
                )}
              </div>

              {cd.show && (
                <div className="countdown-timer-card">
                  <div className="countdown-header">
                    <h3>{cd.name}</h3>
                    {isAdmin && (
                      <button className="countdown-config-btn" aria-label="Configurar cuenta regresiva" onClick={() => setShowCountdownConfigModal(true)}>
                        <span className="material-icons">edit</span>
                      </button>
                    )}
                  </div>
                  <div className="countdown-display">
                    <div className="countdown-unit"><span className="countdown-value">{cd.d}</span><span className="countdown-label">Días</span></div>
                    <div className="countdown-separator">:</div>
                    <div className="countdown-unit"><span className="countdown-value">{cd.h}</span><span className="countdown-label">Horas</span></div>
                    <div className="countdown-separator">:</div>
                    <div className="countdown-unit"><span className="countdown-value">{cd.m}</span><span className="countdown-label">Min</span></div>
                    <div className="countdown-separator">:</div>
                    <div className="countdown-unit"><span className="countdown-value">{cd.s}</span><span className="countdown-label">Seg</span></div>
                  </div>
                  {cd.endDate && <div className="countdown-end-date"><span className="material-icons">event</span>{cd.endDate}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mensaje de bienvenida según rol */}
        <div className="role-banner">
          <div className="role-banner-icon"><span className="material-icons">{roleTip.icon}</span></div>
          <div className="role-banner-text"><h3>{roleTip.title}</h3><p>{roleTip.text}</p></div>
        </div>

        {!isParent && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon"><span className="material-icons">school</span></div>
              <div className="stat-info">
                <h3>{studentsLoaded ? <span className="stat-number">{totalStudents}</span> : <><span className="mini-spinner" /><span className="stat-number loading">---</span></>}</h3>
                <p>Estudiantes</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><span className="material-icons">assignment</span></div>
              <div className="stat-info">
                <h3>{reportCardsLoaded ? <span className="stat-number">{totalGrades}</span> : <><span className="mini-spinner" /><span className="stat-number loading">---</span></>}</h3>
                <p>Calificaciones</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><span className="material-icons">menu_book</span></div>
              <div className="stat-info"><h3>{totalSubjects}</h3><p>Materias</p></div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><span className="material-icons">assessment</span></div>
              <div className="stat-info"><h3>{totalReports}</h3><p>Consolidado</p></div>
            </div>
          </div>
        )}

        {/* Accesos rápidos */}
        <div className="quick-actions">
          <h2>{isParent ? 'Tus accesos' : 'Accesos rápidos'}</h2>
          <div className="quick-grid">
            {quickLinks.map((link) => (
              <button key={link.label} className="quick-card" style={{ '--qc': link.color }} onClick={() => onQuickLink(link)}>
                <span className="quick-icon"><span className="material-icons">{link.icon}</span></span>
                <span className="quick-text"><strong>{link.label}</strong><small>{link.desc}</small></span>
                <span className="material-icons quick-arrow">arrow_forward</span>
              </button>
            ))}
          </div>
        </div>

        {isParent && (
          <div className="scale-card">
            <h2>Escala valorativa</h2>
            <p className="scale-sub">Así se leen las notas y los boletines de tus hijos.</p>
            <div className="scale-row">
              {ESCALA.map((e) => (
                <div key={e.letra} className="scale-item" style={{ '--sc': e.color }}>
                  <span className="scale-letter">{e.letra}</span>
                  <strong>{e.nombre}</strong>
                  <small>{e.rango}</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actividad reciente */}
        <div className="recent-activity">
          <h2>Actividad Reciente</h2>
          <div className="activity-list">
            {recentActivities.length > 0 ? recentActivities.map((a) => (
              <div key={a.timestamp} className="activity-item">
                <div className="activity-icon"><span className="material-icons">{a.icon}</span></div>
                <div className="activity-content"><p>{a.description}</p><small>{formatActivityTime(a.timestamp)}</small></div>
              </div>
            )) : (
              <div className="empty-activity">
                <span className="material-icons">history</span>
                <p>Aún no hay actividad reciente</p>
                <small>Las acciones que realices aparecerán aquí</small>
              </div>
            )}
          </div>
        </div>

        {/* Modal: agregar estudiante */}
        {showAddStudentModal && (
          <Overlay className="modal-overlay" onClick={() => setShowAddStudentModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h3>Agregar Nuevo Estudiante</h3><button className="close-button" onClick={() => setShowAddStudentModal(false)}>✕</button></div>
              <div className="modal-body">
                <form onSubmit={addStudent}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="studentName">Nombres: *</label>
                      <input type="text" id="studentName" name="name" value={newStudent.name} onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })} autoComplete="given-name" required placeholder="Ingrese los nombres" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="studentSurname">Apellidos: *</label>
                      <input type="text" id="studentSurname" name="surname" value={newStudent.surname} onChange={(e) => setNewStudent({ ...newStudent, surname: e.target.value })} autoComplete="family-name" required placeholder="Ingrese los apellidos" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="studentGrade">Grado:</label>
                      <select id="studentGrade" name="grade" value={newStudent.grade} onChange={(e) => setNewStudent({ ...newStudent, grade: e.target.value })} autoComplete="off">
                        {Array.from({ length: 11 }, (_, i) => <option key={i} value={`Grado ${i + 1}º`}>{`Grado ${i + 1}º`}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="studentClassroom">Salón:</label>
                      <select id="studentClassroom" name="classGroup" value={newStudent.classGroup} onChange={(e) => setNewStudent({ ...newStudent, classGroup: e.target.value })} autoComplete="off">
                        <option value="Salon A">Salon A</option>
                        <option value="Salon B">Salon B</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="studentDocument">Documento de Identidad:</label>
                    <input type="text" id="studentDocument" name="documentNumber" value={newStudent.documentNumber} onChange={(e) => setNewStudent({ ...newStudent, documentNumber: e.target.value })} autoComplete="off" placeholder="Ingrese el documento de identidad" />
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="cancel-button" onClick={() => setShowAddStudentModal(false)}>Cancelar</button>
                    <button type="submit" className="save-button" disabled={!newStudent.name || !newStudent.surname || isSavingStudent}>
                      <span>{isSavingStudent ? 'Guardando...' : '💾 Guardar Estudiante'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Overlay>
        )}

        {/* Modal: enviar notificación */}
        {showSendNotificationModal && (
          <Overlay className="modal-overlay" onClick={() => setShowSendNotificationModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h3>Enviar Notificación</h3><button className="close-button" onClick={() => setShowSendNotificationModal(false)}>✕</button></div>
              <div className="modal-body">
                <form onSubmit={sendNotification}>
                  <div className="form-group">
                    <label htmlFor="notificationTitle">Título: *</label>
                    <input type="text" id="notificationTitle" name="title" value={newNotification.title} onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })} autoComplete="off" required placeholder="Ingrese el título de la notificación" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="notificationMessage">Mensaje: *</label>
                    <textarea id="notificationMessage" name="message" value={newNotification.message} onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })} autoComplete="off" required rows={4} placeholder="Escriba el mensaje de la notificación" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="recipientType">Dirigido a:</label>
                    <select id="recipientType" name="recipientType" value={newNotification.recipientType} onChange={(e) => setNewNotification({ ...newNotification, recipientType: e.target.value })} autoComplete="off">
                      <option value="PARENTS">Padres de Familia</option>
                      <option value="TEACHERS">Profesores</option>
                      <option value="ADMINISTRATORS">Administradores</option>
                      <option value="ALL">Todos</option>
                    </select>
                  </div>
                  <div className="notification-preview">
                    <h4>Vista previa <small>(así la verá quien la reciba)</small></h4>
                    <div className="np-modal">
                      <div className="np-header">
                        <div className="np-icon"><span className="material-icons">admin_panel_settings</span></div>
                        <div className="np-header-text">
                          <h2>{newNotification.title || 'Título de la notificación'}</h2>
                          <div className="np-meta">
                            <span className="np-sender">
                              {picture ? <img className="np-avatar" src={picture} alt={initials} /> : <span className="np-initials">{initials}</span>}
                              {displayName}
                            </span>
                            <span className="np-date">Ahora</span>
                          </div>
                        </div>
                      </div>
                      <div className="np-body">
                        <div className="np-message">{newNotification.message || 'Aquí aparecerá el mensaje de la notificación.'}</div>
                        <div className="np-status"><span className="material-icons">circle</span> No leído</div>
                        <div className="np-recipient"><span className="material-icons">send</span> Para: <strong>{recipientLabel}</strong></div>
                      </div>
                    </div>
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="cancel-button" onClick={() => setShowSendNotificationModal(false)}>Cancelar</button>
                    <button type="submit" className="save-button" disabled={!newNotification.title || !newNotification.message || isSendingNotification}>
                      <span>{isSendingNotification ? 'Enviando...' : '📧 Enviar Notificación'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </Overlay>
        )}

        {/* Modal: gestionar grados */}
        {showAddGradeModal && (
          <Overlay className="modal-overlay" onClick={() => setShowAddGradeModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h3>Gestionar Grados</h3><button className="close-button" onClick={() => setShowAddGradeModal(false)}>✕</button></div>
              <div className="modal-body">
                <div className="modal-description"><p>Aquí puede administrar los grados del sistema. Por el momento, esta funcionalidad está en desarrollo.</p></div>
                <div className="current-grades">
                  <h4>Grados Actuales:</h4>
                  <div className="grades-list">{Array.from({ length: 11 }, (_, i) => <div key={i} className="grade-item">{`Grado ${i + 1}º`}</div>)}</div>
                </div>
                <div className="modal-actions"><button className="primary-button" onClick={() => setShowAddGradeModal(false)}>Cerrar</button></div>
              </div>
            </div>
          </Overlay>
        )}

        {/* Modal: administrar materias */}
        {showAddSubjectModal && (
          <Overlay className="modal-overlay" onClick={() => setShowAddSubjectModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h3>Administrar Materias</h3><button className="close-button" onClick={() => setShowAddSubjectModal(false)}>✕</button></div>
              <div className="modal-body">
                <div className="modal-description"><p>Funcionalidad para administrar materias. En desarrollo...</p></div>
                <div className="current-subjects">
                  <h4>Materias Actuales:</h4>
                  <div className="subjects-list">
                    {['Matemáticas', 'Español', 'Ciencias Naturales', 'Historia', 'Educación Física', 'Artes', 'Inglés', 'Educación Religiosa'].map((s) => <div key={s} className="subject-item">{s}</div>)}
                  </div>
                </div>
                <div className="modal-actions"><button className="primary-button" onClick={() => setShowAddSubjectModal(false)}>Cerrar</button></div>
              </div>
            </div>
          </Overlay>
        )}

        {/* Modal: reportes */}
        {showViewReportsModal && (
          <Overlay className="modal-overlay" onClick={() => setShowViewReportsModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h3>Reportes del Sistema</h3><button className="close-button" onClick={() => setShowViewReportsModal(false)}>✕</button></div>
              <div className="modal-body">
                <div className="reports-section">
                  <h4>📊 Reportes Disponibles</h4>
                  <div className="reports-grid">
                    {[
                      ['📋', 'Boletines de Calificaciones', 'Generar boletines individuales por estudiante', 'Generar boletines de calificaciones'],
                      ['👥', 'Listas de Estudiantes', 'Listar estudiantes por grado y salón', 'Generar listas de estudiantes'],
                      ['📈', 'Estadísticas Generales', 'Resumen general del sistema', 'Generar estadísticas generales'],
                      ['🏆', 'Rendimiento Académico', 'Análisis de calificaciones por materia', 'Generar reporte de rendimiento académico'],
                    ].map(([icon, title, desc, aria]) => (
                      <div key={title} className="report-card a11y-clickable" aria-label={aria} {...a11y(generateReport)}>
                        <div className="report-icon">{icon}</div>
                        <div className="report-info"><h5>{title}</h5><p>{desc}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="modal-actions"><button className="cancel-button" onClick={() => setShowViewReportsModal(false)}>Cerrar</button></div>
              </div>
            </div>
          </Overlay>
        )}

        {/* Modal: cronómetro */}
        {showCountdownConfigModal && (
          <Overlay className="modal-overlay" onClick={() => setShowCountdownConfigModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header"><h3>Configurar Cronómetro</h3><button className="close-button" onClick={() => setShowCountdownConfigModal(false)}>✕</button></div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="countdownName">Título del Cronómetro</label>
                  <input type="text" id="countdownName" name="countdownName" value={cd.name} onChange={(e) => setCd({ ...cd, name: e.target.value })} placeholder="Ej: Examen Final" autoComplete="off" />
                </div>
                <div className="form-group">
                  <label htmlFor="countdownTargetDate">Fecha de Finalización</label>
                  <input type="datetime-local" id="countdownTargetDate" name="countdownTargetDate" value={cd.targetDate && !cd.targetDate.endsWith('Z') ? cd.targetDate : ''} onChange={(e) => setCd({ ...cd, targetDate: e.target.value })} placeholder="Seleccionar fecha" autoComplete="off" />
                </div>
                <div className="form-group">
                  <label htmlFor="countdownDaysInput">O días restantes (opcional)</label>
                  <input type="number" id="countdownDaysInput" name="countdownDaysInput" value={cd.daysInput || ''} onChange={(e) => setCd({ ...cd, daysInput: Number(e.target.value) })} placeholder="Ej: 30" min="1" autoComplete="off" />
                </div>
                <div className="modal-actions">
                  <button className="cancel-button" onClick={() => setShowCountdownConfigModal(false)}>Cancelar</button>
                  <button className="primary-button" onClick={saveCountdownConfig}>Guardar</button>
                </div>
              </div>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}