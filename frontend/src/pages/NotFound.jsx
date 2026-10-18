import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/pages/not-found.css';
import { API_ORIGIN } from '../api/client.js';

/** Página 404 (y variante "sin conexión" con ?reason=connection) del original. */
export default function NotFound() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const isConnection = params.get('reason') === 'connection';
  const [, setChecking] = useState(false);
  const stop = useRef(false);
  const timer = useRef(null);

  const poll = async () => {
    if (stop.current) return;
    setChecking(true);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    let ok = false;
    try { await fetch(`${API_ORIGIN}/api/health`, { signal: ctrl.signal, cache: 'no-store' }); ok = true; } catch { ok = false; }
    clearTimeout(to);
    setChecking(false);
    if (ok) { stop.current = true; nav('/login'); } else timer.current = setTimeout(poll, 4000);
  };

  useEffect(() => {
    stop.current = false;
    if (isConnection) poll();
    return () => { stop.current = true; clearTimeout(timer.current); };
  }, [isConnection]); // eslint-disable-line

  const retry = () => { clearTimeout(timer.current); poll(); };

  return (
    <div className="pg-not-found">
      <div className={`nf-root${isConnection ? ' nf-connection' : ''}`}>
        <div className="nf-card">
          <div className="nf-accent" />
          <div className="nf-illustration" aria-hidden="true">
            {isConnection ? (
              <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="100" cy="100" r="84" fill="var(--brand-50)" />
                <path d="M50 124 a50 50 0 0 1 100 0" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" />
                <path d="M68 124 a32 32 0 0 1 64 0" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" />
                <path d="M84 124 a16 16 0 0 1 32 0" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" />
                <circle cx="100" cy="140" r="6.5" fill="var(--brand)" />
                <line x1="54" y1="72" x2="146" y2="128" stroke="var(--danger)" strokeWidth="7" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="100" cy="100" r="84" fill="var(--brand-50)" />
                <path d="M72 70 h56 a8 8 0 0 1 8 8 v44 a8 8 0 0 1 -8 8 h-56 a8 8 0 0 1 -8 -8 v-44 a8 8 0 0 1 8 -8 z" stroke="var(--brand)" strokeWidth="7" strokeLinejoin="round" />
                <line x1="78" y1="118" x2="122" y2="118" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" />
                <line x1="100" y1="86" x2="100" y2="104" stroke="var(--danger)" strokeWidth="7" strokeLinecap="round" />
                <circle cx="100" cy="112" r="3" fill="var(--danger)" />
              </svg>
            )}
          </div>
          {isConnection ? (
            <>
              <span className="nf-eyebrow">Error de conexión</span>
              <h1 className="nf-title">Sin conexión con el servidor</h1>
              <p className="nf-text">No pudimos comunicarnos con el servidor de <strong>EduNova</strong>. Verifica tu conexión a internet o que el servidor esté disponible e inténtalo de nuevo.</p>
              <div className="nf-status"><span className="nf-dot" /><span>Reconectando automáticamente…</span></div>
            </>
          ) : (
            <>
              <span className="nf-eyebrow">Error 404</span>
              <h1 className="nf-title">Página no encontrada</h1>
              <p className="nf-text">La página que buscas no existe o fue movida. Regresa al inicio para continuar usando la plataforma.</p>
            </>
          )}
          <div className="nf-actions">
            <button className="btn btn-primary" onClick={retry}><span className="material-icons">refresh</span> Reintentar</button>
            <button className="btn btn-outline" onClick={() => nav('/login')}><span className="material-icons">home</span> Ir al inicio</button>
          </div>
        </div>
        <p className="nf-footer">EduNova · Gestión Académica</p>
      </div>
    </div>
  );
}
