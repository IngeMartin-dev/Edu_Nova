import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, session, setLogoutHandler, tabStore, publishLastSession } from '../api/client.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => { session.clear(); setUser(null); }, []);
  useEffect(() => { setLogoutHandler(logout); }, [logout]);

  const loadMe = useCallback(async () => {
    const me = await api.get('/auth/me');
    tabStore.setItem('currentUser', JSON.stringify(me));
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
    tabStore.setItem('role', r.role || '');
    const me = await loadMe();
    publishLastSession();   // esta cuenta pasa a ser la "última usada" para las pestañas nuevas
    return me;
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
