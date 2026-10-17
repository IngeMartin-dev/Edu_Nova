import '../styles/pages/not-found.css';
import '../styles/pages/connection-lost.css';
import { connection, useConnection } from '../services/connection.js';

/** Pantalla "Sin conexión con el servidor" a pantalla completa (connection-lost del original). */
export default function ConnectionLost() {
  const { checking } = useConnection();
  return (
    <div className="pg-not-found pg-connection-lost">
      <div className="nf-root nf-connection" role="alert" aria-live="assertive">
        <div className="nf-card">
          <div className="nf-accent" />
          <div className="nf-illustration" aria-hidden="true">
            <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="84" fill="var(--brand-50)" />
              <path d="M50 124 a50 50 0 0 1 100 0" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" />
              <path d="M68 124 a32 32 0 0 1 64 0" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" />
              <path d="M84 124 a16 16 0 0 1 32 0" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" />
              <circle cx="100" cy="140" r="6.5" fill="var(--brand)" />
              <line x1="54" y1="72" x2="146" y2="128" stroke="var(--danger)" strokeWidth="7" strokeLinecap="round" />
            </svg>
          </div>
          <span className="nf-eyebrow">Error de conexión</span>
          <h1 className="nf-title">Sin conexión con el servidor</h1>
          <p className="nf-text">
            No pudimos comunicarnos con el servidor de <strong>EduNova</strong>.
            Verifica tu conexión a internet o que el servidor esté disponible.
            Cuando se restablezca volverás automáticamente a donde estabas.
          </p>
          <div className="nf-status">
            <span className="nf-dot" />
            <span>{checking ? 'Comprobando…' : 'Reconectando automáticamente…'}</span>
          </div>
          <div className="nf-actions">
            <button className="btn btn-primary" onClick={() => connection.checkNow()}>
              <span className="material-icons">refresh</span> Reintentar
            </button>
          </div>
        </div>
        <p className="nf-footer">EduNova · Gestión Académica</p>
      </div>
    </div>
  );
}
