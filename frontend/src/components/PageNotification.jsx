import { useCallback, useEffect, useRef, useState } from 'react';

/** Aviso central con check/cruz animado, usado por varias pantallas del original (notification-overlay). */
export function usePageNotification(successTitle = '¡Exito!') {
  const [n, setN] = useState({ show: false, type: null, message: '' });
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const hide = useCallback(() => setN((s) => ({ ...s, show: false })), []);
  const open = useCallback((type, message, ms) => {
    setN({ show: true, type, message });
    clearTimeout(t.current);
    t.current = setTimeout(() => setN((s) => ({ ...s, show: false })), ms);
  }, []);
  const success = useCallback((m) => open('success', m, 3000), [open]);
  const error = useCallback((m) => open('error', m, 4000), [open]);
  const node = n.show ? (
    <div className="notification-overlay" onClick={hide}>
      <div className={`notification-content${n.type === 'success' ? ' notification-success' : ''}${n.type === 'error' ? ' notification-error' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="notification-icon">
          {n.type === 'success' && <svg className="checkmark" viewBox="0 0 52 52"><path className="checkmark__check" fill="none" d="m14.1 27.2l7.1 7.2 16.7-16.8" /></svg>}
          {n.type === 'error' && <svg className="error-mark" viewBox="0 0 52 52"><path className="error-mark__x" fill="none" d="M16 16l20 20M36 16L16 36" /></svg>}
        </div>
        <div className="notification-body">
          <div className="notification-title">{n.type === 'success' ? successTitle : '¡Error!'}</div>
          <div className="notification-message">{n.message}</div>
        </div>
        <button className="notification-close" onClick={hide}>✕</button>
      </div>
    </div>
  ) : null;
  return { success, error, hide, node };
}
