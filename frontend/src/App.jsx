import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import ConsentGate from './components/ConsentGate.jsx';
import ConnectionLost from './components/ConnectionLost.jsx';
import GenerationNotifications from './components/GenerationNotifications.jsx';
import { setRestoreHandler, useConnection } from './services/connection.js';
import { useEffect } from 'react';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { Loading } from './components/ui.jsx';

// Cada pantalla se carga cuando se visita (code splitting).
const page = (f) => lazy(f);
const Students = page(() => import('./pages/Students.jsx'));
const Teachers = page(() => import('./pages/Teachers.jsx'));
const Parents = page(() => import('./pages/Parents.jsx'));
const Subjects = page(() => import('./pages/Subjects.jsx'));
const Periods = page(() => import('./pages/Periods.jsx'));
const DirectorsGroup = page(() => import('./pages/DirectorsGroup.jsx'));
const Settings = page(() => import('./pages/Settings.jsx'));
const Chats = page(() => import('./pages/Chats.jsx'));
const Grades = page(() => import('./pages/Grades.jsx'));
const MisNotas = page(() => import('./pages/MisNotas.jsx'));
const Boletines = page(() => import('./pages/Boletines.jsx'));
const Generados = page(() => import('./pages/BoletinesGenerados.jsx'));
const ConsolidadosGenerados = page(() => import('./pages/ConsolidadosGenerados.jsx'));
const MisBoletines = page(() => import('./pages/MisBoletines.jsx'));
const Recoveries = page(() => import('./pages/Recoveries.jsx'));
const Reports = page(() => import('./pages/Reports.jsx'));
const Promociones = page(() => import('./pages/Promociones.jsx'));
const SchoolYear = page(() => import('./pages/SchoolYear.jsx'));
const NotFound = page(() => import('./pages/NotFound.jsx'));

const ADMIN = ['ADMIN'];
const TEACHER = ['TEACHER', 'DIRECTOR_DE_GRUPO'];
const DIR_ADMIN = ['ADMIN', 'DIRECTOR_DE_GRUPO'];
const PARENT = ['PARENT'];
const ANY = ['ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO', 'PARENT', 'STUDENT'];

function Guard({ roles, children }) {
  const { user, role } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const extraAdmin = user.additionalAdmin && roles.includes('ADMIN');
  if (!roles.includes(role) && !extraAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { ready, user } = useAuth();
  const { offline } = useConnection();
  const nav = useNavigate();
  const loc = useLocation();
  // Al reconectar se recarga la vista actual sin cambiar la URL.
  useEffect(() => {
    setRestoreHandler(() => { const u = loc.pathname + loc.search; nav('/not-found', { replace: true }); setTimeout(() => nav(u, { replace: true }), 0); });
  }, [loc, nav]);
  if (!ready) return <Loading />;
  const r = (path, roles, el) => <Route path={path} element={<Guard roles={roles}>{el}</Guard>} />;
  return (
    <>
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/not-found" element={<NotFound />} />
        <Route path="/login" element={<Login />} />
        <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
          {r('/dashboard', ANY, <Dashboard />)}
          {r('/students', ADMIN, <Students />)}
          {r('/teachers', ADMIN, <Teachers />)}
          {r('/parents', ADMIN, <Parents />)}
          {r('/subjects', ADMIN, <Subjects />)}
          {r('/periods', ADMIN, <Periods />)}
          {r('/directors-group', ADMIN, <DirectorsGroup />)}
          {r('/chats', ANY, <Chats />)}
          {r('/settings', ANY, <Settings />)}
          {r('/grades', TEACHER, <Grades />)}
          {r('/mis-notas', PARENT, <MisNotas />)}
          {r('/boletines', ADMIN, <Boletines />)}
          {r('/mis-boletines', PARENT, <MisBoletines />)}
          {r('/boletines-generados', ADMIN, <Generados />)}
          {r('/recoveries', TEACHER, <Recoveries />)}
          {r('/reports', DIR_ADMIN, <Reports />)}
          {r('/consolidados-generados', DIR_ADMIN, <ConsolidadosGenerados />)}
          {r('/promociones', ADMIN, <Promociones />)}
          {r('/school-year-config', ADMIN, <SchoolYear />)}
        </Route>
        <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    <GenerationNotifications />
    <ConsentGate />
    {offline && <ConnectionLost />}
    </>
  );
}
