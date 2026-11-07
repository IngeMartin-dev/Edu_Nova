import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { bus } from '../services/events.js';
import '../styles/pages/no-active-period.css';

/**
 * Pantallas de profesores (Notas, Recuperaciones): si todos los períodos están cerrados no se muestra
 * el período 1 por defecto, sino un aviso. Se actualiza en tiempo real al abrir/cerrar períodos.
 */
export default function NeedsActivePeriod({ children }) {
  const [state, setState] = useState('loading');   // loading | active | none
  useEffect(() => {
    let alive = true;
    const apply = (list) => { if (alive && Array.isArray(list)) setState(list.some((p) => p.isUnlocked) ? 'active' : 'none'); };
    api.get('/periods').then(apply).catch(() => { if (alive) setState((s) => (s === 'loading' ? 'active' : s)); });
    const off = bus.on('periods:changed', apply);
    return () => { alive = false; off(); };
  }, []);

  if (state === 'loading') return null;
  if (state === 'active') return children;
  return (
    <div className="pg-no-active-period">
      <div className="no-active-card" role="status">
        <span className="material-icons" aria-hidden="true">lock_clock</span>
        <h2>No hay períodos activos</h2>
        <p>Por favor espere o comuníquese con un administrador.</p>
      </div>
    </div>
  );
}
