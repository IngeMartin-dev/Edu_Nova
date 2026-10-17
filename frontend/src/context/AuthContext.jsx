import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, session, setLogoutHandler } from '../api/client.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => { session.clear(); setUser(null); }, []);
  useEffect(() => { setLogoutHandler(logout); }, [logout]);

  const loadMe = useCallback(async () => {
    const me = await api.get('/auth/me');
    localStorage.setItem('currentUser', JSON.stringify(me));
    setUser(me);
    return me;
  }, []);

  // Al abrir o recargar la página se restaura la sesión antes de pintar rutas.
  useEffect(() => {
    (async () => {
      if (session.token) { try { await loadMe(); } catch { session.clear(); } }
      setReady(true);
    })();
  }, [loadMe]);

  const finishLogin = useCallback(async (r) => {
    session.set(r.token, r.refreshToken);
    localStorage.setItem('role', r.role || '');
    return loadMe();
  }, [loadMe]);

  const value = useMemo(() => {
    const role = user?.role?.name || '';
    const isAdmin = role === 'ADMIN' || !!user?.additionalAdmin;
    const isTeacher = role === 'TEACHER' || role === 'DIRECTOR_DE_GRUPO';
    return {
      user, ready, role, setUser, logout, loadMe, finishLogin,
      isAdmin, isTeacher,
      isDirector: role === 'DIRECTOR_DE_GRUPO',
      isParent: role === 'PARENT',
      isDirectorOrAdmin: isAdmin || role === 'DIRECTOR_DE_GRUPO',
      known: ['ADMIN', 'TEACHER', 'DIRECTOR_DE_GRUPO', 'PARENT', 'STUDENT'].includes(role),
    };
  }, [user, ready, logout, loadMe, finishLogin]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
