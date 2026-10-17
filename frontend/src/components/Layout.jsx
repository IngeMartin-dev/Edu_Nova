import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import '../styles/pages/app.css';
import { useAuth } from '../context/AuthContext.jsx';
import { api, imageUrl } from '../api/client.js';
import { useUi } from '../context/UiContext.jsx';
import MessagesDropdown from './MessagesDropdown.jsx';
import NotificationDetails from './NotificationDetails.jsx';
import {
  loadMessages, loadNotifications, refreshAll, resetNotifications, startNotificationPolling, unreadOf,
  useMessages, useNotifications,
} from '../services/notifications.js';
import { startRealtime, stopRealtime } from '../services/realtime.js';
import { generation } from '../services/generation.js';

const ROLE_NAMES = { ADMIN: 'Administrador', TEACHER: 'Profesor', DIRECTOR_DE_GRUPO: 'Director de Grupo', PARENT: 'Padre de Familia', STUDENT: 'Estudiante' };

/** Estructura principal: barra lateral, barra superior, contenido y navegación móvil (app.html del original). */
export default function Layout() {
  const { user, role, isAdmin, isDirectorOrAdmin, isParent, known } = useAuth();
  const { fail, ok } = useUi();
  const loc = useLocation();
  const nav = useNavigate();
  const isTeacherOrDirector = role === 'TEACHER' || role === 'DIRECTOR_DE_GRUPO';

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailsReadOnly, setDetailsReadOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const notifications = useNotifications();
  const messages = useMessages();
  const unreadTotal = unreadOf(notifications) + unreadOf(messages);

  const routeName = loc.pathname.split('/')[1] || 'dashboard';
  const isDashboard = loc.pathname === '/dashboard';

  // Sondeos globales (períodos, generaciones, notificaciones y respuestas).
  useEffect(() => {
    startRealtime();
    // Las generaciones de boletines solo existen para el personal (el padre de familia recibiría 403).
    const staff = ['ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO'].includes(user?.role?.name || user?.role);
    if (staff) generation.startPolling();
    startNotificationPolling();
    return () => { stopRealtime(); generation.stopPolling(); };
  }, []);

  useEffect(() => { if (user?.id) refreshAll(); else resetNotifications(); }, [user?.id]);

  // Administrador: si se alcanzó la fecha de fin de año, directo a Configuración de Año.
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/school-year/fecha-alcanzada').then((res) => {
      if (res?.alcanzada && !window.location.pathname.includes('/school-year-config')) nav('/school-year-config');
    }).catch(() => {});
  }, [isAdmin]); // eslint-disable-line

  useEffect(() => { setSidebarOpen(false); }, [loc.pathname]);

  const gradesRoute = isParent ? '/mis-notas' : '/grades';
  const boletinesRoute = isParent ? '/mis-boletines' : '/boletines';

  const displayName = user ? (user.name && user.surname ? `${user.name} ${user.surname}` : user.name || user.username || 'Usuario sin nombre') : 'Usuario sin autenticar';
  const displayUsername = user?.username || '';
  const displayRole = user?.role?.name ? (ROLE_NAMES[user.role.name] || user.role.name) : '';
  const initials = user?.name && user?.surname ? (user.name.charAt(0) + user.surname.charAt(0)).toUpperCase() : user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  const picture = user?.profilePicture ? imageUrl(user.profilePicture) : null;

  const item = (route, to, icon, label) => (
    <li className={routeName === route ? 'active' : ''}>
      <Link to={to} onClick={() => setSidebarOpen(false)}>
        <span className="material-icons">{icon}</span>
        <span className="menu-text">{label}</span>
      </Link>
    </li>
  );
  const mobile = (route, to, icon, label) => (
    <Link className={routeName === route ? 'active' : ''} to={to} onClick={() => setSidebarOpen(false)}>
      <span className="material-icons">{icon}</span>
      <span>{label}</span>
    </Link>
  );

  const onMessageClick = (event) => {
    if (event.type === 'message') {
      const m = event.item;
      setSelected({
        id: m.id, user: { id: m.senderId, name: m.senderName, surname: m.senderSurname },
        title: `Respuesta a "${m.originalNotificationTitle}"`, message: m.replyMessage, createdAt: m.createdAt, isRead: true, notificationType: 'REPLY',
      });
      setDetailsReadOnly(true);
      setShowDetails(true);
    } else if (event.type === 'notification') {
      setDetailsReadOnly(false);
      setSelected(event.item);
      setShowDetails(true);
    }
  };
  const closeDetails = () => { setShowDetails(false); setDetailsReadOnly(false); setSelected(null); };

  const handleReply = async (reply) => {
    try {
      await api.post('/notifications/reply', { originalNotificationId: reply.originalNotificationId, replyMessage: reply.message, senderId: reply.senderId });
      ok('¡Respuesta enviada exitosamente!');
      closeDetails();
      if (user?.id) { loadNotifications(user.id).catch(() => {}); loadMessages(user.id).catch(() => {}); }
    } catch { fail('Error al enviar la respuesta'); }
  };

  return (
    <div className="pg-app">
      <div>
        <div className="app-container">
          <aside className={`sidebar sidebar-animated${sidebarOpen ? ' open' : ''}`}>
            <div className="sidebar-header">
              <div className="logo-container">
                <img src="/logo-symbol.svg" alt="Logo" className="logo" />
                <h1>Edu<span>Nova</span></h1>
              </div>
            </div>
            <nav className="nav-menu">
              <ul>
                {known && item('dashboard', '/dashboard', 'dashboard', 'Panel')}
                {isAdmin && item('students', '/students', 'school', 'Estudiantes')}
                {isAdmin && item('parents', '/parents', 'family_restroom', 'Padres de Familia')}
                {isAdmin && item('teachers', '/teachers', 'person', 'Profesores')}
                {isAdmin && item('directors-group', '/directors-group', 'groups', 'Directores de Grupo')}
                {known && item('chats', '/chats', 'chat', 'Chats')}
                {isAdmin && item('subjects', '/subjects', 'menu_book', 'Materias')}
                {(isTeacherOrDirector || isParent) && item('grades', gradesRoute, 'assignment', 'Calificaciones')}
                {(isAdmin || isParent) && item('boletines', boletinesRoute, 'description', 'Boletines')}
                {isAdmin && item('boletines-generados', '/boletines-generados', 'folder_special', 'Boletines Generados')}
                {isTeacherOrDirector && item('recoveries', '/recoveries', 'school', 'Recuperaciones')}
                {isDirectorOrAdmin && item('reports', '/reports', 'assessment', 'Consolidados')}
                {isDirectorOrAdmin && item('consolidados-generados', '/consolidados-generados', 'folder_special', 'Consolidados Generados')}
                {isAdmin && item('promociones', '/promociones', 'workspace_premium', 'Promociones')}
                {isAdmin && item('periods', '/periods', 'calendar_month', 'Períodos')}
                {isAdmin && item('school-year-config', '/school-year-config', 'event_repeat', 'Configuración de Año')}
                {known && item('settings', '/settings', 'settings', 'Configuración')}
              </ul>
            </nav>
            <div className="user-profile">
              <div className="user-avatar" data-username={displayName}>
                {picture
                  ? <img src={picture} alt="Foto de perfil del usuario" title="Foto de perfil" className="user-image" />
                  : <div className="user-initials">{initials}</div>}
              </div>
              <div className="user-info">
                <h4>{displayName}</h4>
                {(displayUsername || displayRole) && (
                  <p>
                    @{displayUsername}
                    {displayUsername && displayRole && <span>• </span>}
                    {displayRole}
                  </p>
                )}
              </div>
            </div>
          </aside>
          <div className={`sidebar-backdrop${sidebarOpen ? ' show' : ''}`} onClick={() => setSidebarOpen((v) => !v)} />

          <main className="main-content">
            <header className="top-bar">
              <div className="top-bar-left">
                <button className="menu-toggle-btn" onClick={() => setSidebarOpen((v) => !v)} aria-label="Abrir menú">
                  <span className="material-icons">menu</span>
                </button>
                {!isDashboard && (
                  <div className="search-bar">
                    <span className="material-icons">search</span>
                    <input type="text" id="search-input" name="search" placeholder="Buscar..." autoComplete="off" aria-label="Buscar" />
                  </div>
                )}
              </div>
              <div className="top-bar-actions">
                <div className="message-container">
                  <button className="message-btn" onClick={() => setShowMessages((v) => !v)}>
                    <span className="material-icons">mail</span>
                    {unreadTotal > 0 && <span className="message-badge">{unreadTotal}</span>}
                  </button>
                  <MessagesDropdown isOpen={showMessages} onClose={() => setShowMessages(false)} onMessageClick={onMessageClick}
                    notifications={notifications} messages={messages} />
                </div>
              </div>
            </header>
            <div className="content-wrapper">
              <Outlet />
            </div>
          </main>
        </div>

        {!isDashboard && (
          <nav className="mobile-nav">
            {known && mobile('dashboard', '/dashboard', 'dashboard', 'Inicio')}
            {isAdmin && mobile('students', '/students', 'school', 'Estudiantes')}
            {(isTeacherOrDirector || isParent) && mobile('grades', gradesRoute, 'assignment', 'Calificaciones')}
            {(isAdmin || isParent) && mobile('boletines', boletinesRoute, 'description', 'Boletines')}
            {isDirectorOrAdmin && mobile('reports', '/reports', 'assessment', 'Reportes')}
            {known && mobile('chats', '/chats', 'chat', 'Chats')}
          </nav>
        )}

        <div className="loading-overlay hidden"><div className="spinner" /></div>

        <NotificationDetails notification={selected} isOpen={showDetails} readOnly={detailsReadOnly} onClose={closeDetails} onReply={handleReply} />
      </div>
    </div>
  );
}
