/**
 * Sesión por pestaña.
 *  - Cada pestaña guarda su sesión (token, refreshToken, role, currentUser) en sessionStorage: así se puede
 *    entrar con otra cuenta en otra pestaña sin que la primera cambie de usuario.
 *  - localStorage guarda solo la "última sesión usada": una pestaña nueva arranca con ella, para no
 *    tener que iniciar sesión cada vez.
 */
const KEYS = ['token', 'refreshToken', 'role', 'currentUser'];

const ss = () => { try { return window.sessionStorage; } catch { return null; } };
const ls = () => { try { return window.localStorage; } catch { return null; } };
const read = (st, k) => { try { return st ? st.getItem(k) : null; } catch { return null; } };
const write = (st, k, v) => { try { if (st) st.setItem(k, v); } catch { /* sin almacenamiento */ } };
const del = (st, k) => { try { if (st) st.removeItem(k); } catch { /* sin almacenamiento */ } };

/** Una pestaña nueva (sin sesión propia) hereda la última cuenta usada. */
(function bootstrap() {
  if (read(ss(), 'token') || !read(ls(), 'token')) return;
  KEYS.forEach((k) => { const v = read(ls(), k); if (v !== null) write(ss(), k, v); });
})();

/** ¿Esta pestaña está usando la misma sesión que quedó guardada como "última"? */
const isLastSession = () => {
  const mine = read(ss(), 'refreshToken');
  return !!mine && mine === read(ls(), 'refreshToken');
};

export const tabStore = {
  getItem: (k) => read(ss(), k),
  setItem(k, v) {
    const mirror = isLastSession();   // se calcula antes de cambiar nada
    write(ss(), k, v);
    if (mirror) write(ls(), k, v);    // renovaciones/cambios de la misma sesión se reflejan en la "última"
  },
  removeItem(k) {
    const mirror = isLastSession();
    del(ss(), k);
    if (mirror) del(ls(), k);
  },
};

/** Marca la sesión de esta pestaña como la última usada (se llama al iniciar sesión). */
export function publishLastSession() {
  KEYS.forEach((k) => { const v = read(ss(), k); if (v !== null) write(ls(), k, v); });
}

/** Cierra la sesión de esta pestaña; la "última" solo se borra si era esta misma cuenta. */
export function clearTabSession() {
  const mirror = isLastSession();
  KEYS.forEach((k) => { del(ss(), k); if (mirror) del(ls(), k); });
}

/**
 * Si otra pestaña con la MISMA cuenta renovó la sesión (el servidor invalida el refreshToken anterior),
 * devuelve los datos vigentes guardados como "última sesión" para reintentar; si no, null.
 */
export function alternateSession() {
  const lr = read(ls(), 'refreshToken');
  if (!lr || lr === read(ss(), 'refreshToken')) return null;
  try {
    const a = JSON.parse(read(ls(), 'currentUser') || 'null');
    const b = JSON.parse(read(ss(), 'currentUser') || 'null');
    if (!a || !b || a.id !== b.id) return null;
  } catch { return null; }
  return { token: read(ls(), 'token'), refreshToken: lr };
}
