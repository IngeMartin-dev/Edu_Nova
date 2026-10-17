import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import '../styles/pages/dialog.css';
import '../styles/toast.css';

const Ctx = createContext(null);
/** Avisos (toast), diálogos (alert / confirm / input) y tema claro/oscuro. */
export const useUi = () => useContext(Ctx);
/** Equivalente al DialogService del original: dialog.alert / dialog.confirm / dialog.input. */
export const useDialog = () => {
  const { alert, confirm, input } = useContext(Ctx);
  return { alert, confirm, input };
};

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [theme, setThemeState] = useState(() => { try { return localStorage.getItem('theme') || 'light'; } catch { return 'light'; } });
  const resolver = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch { /* sin almacenamiento */ }
  }, [theme]);

  const toast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const ok = useCallback((m) => toast(m, 'success'), [toast]);
  const fail = useCallback((e) => toast(typeof e === 'string' ? e : e?.message || 'Ocurrió un error', 'error'), [toast]);

  const open = useCallback((d) => new Promise((resolve) => {
    resolver.current = resolve;
    setInputValue(d.defaultValue || '');
    setDlg(d);
  }), []);
  const alert = useCallback((message, title = 'Aviso') => open({ mode: 'alert', message, title, confirmText: 'Aceptar' }).then(() => undefined), [open]);
  const confirm = useCallback((message, opts = {}) => {
    // Admite la firma del original: confirm(msg, 'Título', {confirmText, cancelText, danger}) y confirm(msg, {title,...})
    const o = typeof opts === 'string' ? { title: opts } : opts;
    return open({ mode: 'confirm', message, title: o.title || 'Confirmar', confirmText: o.confirmText || 'Aceptar', cancelText: o.cancelText || 'Cancelar', danger: !!o.danger });
  }, [open]);
  const input = useCallback((message, title = 'Ingresa un valor', placeholder = '', defaultValue = '') =>
    open({ mode: 'input', message, title, placeholder, defaultValue, confirmText: 'Aceptar', cancelText: 'Cancelar' }), [open]);

  const respond = (v) => { const r = resolver.current; setDlg(null); r?.(v); };

  return (
    <Ctx.Provider value={{ toast, ok, fail, alert, confirm, input, theme, setTheme: setThemeState }}>
      {children}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>)}</div>
      {dlg && (
        <div className="pg-dialog">
          <div className="app-dialog-overlay" onClick={() => (dlg.mode === 'confirm' ? null : respond(dlg.mode === 'input' ? inputValue : true))}>
            <div className={`app-dialog-box${dlg.danger ? ' danger' : ''}`} onClick={(e) => e.stopPropagation()}>
              <div className="app-dialog-icon"><span className="material-icons">{dlg.danger ? 'warning' : dlg.mode === 'confirm' ? 'help_outline' : dlg.mode === 'input' ? 'edit' : 'info'}</span></div>
              <h3 className="app-dialog-title">{dlg.title}</h3>
              <p className="app-dialog-message">{dlg.message}</p>
              {dlg.mode === 'input' && (
                <input className="app-dialog-input" autoFocus placeholder={dlg.placeholder} value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && respond(inputValue)} />
              )}
              <div className="app-dialog-actions">
                {dlg.mode !== 'alert' && <button className="app-dialog-btn cancel" onClick={() => respond(dlg.mode === 'input' ? null : false)}>{dlg.cancelText}</button>}
                <button className={`app-dialog-btn confirm${dlg.danger ? ' danger' : ''}`} onClick={() => respond(dlg.mode === 'input' ? inputValue : true)}>{dlg.confirmText}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
