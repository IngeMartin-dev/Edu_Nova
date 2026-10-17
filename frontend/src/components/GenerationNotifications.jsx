import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/generation-notifications.css';
import { generation, setGenerationNavigate, useGenerationJobs } from '../services/generation.js';

/** Tiempo que una notificación "Completada" / "Error" permanece visible. */
const AUTO_DISMISS_MS = 6000;

const progressPct = (job) => {
  if (job.status === 'DONE') return 100;
  if (!job.total) return 0;
  return Math.min(100, Math.round((job.completed / job.total) * 100));
};
const statusIcon = (job) => (job.status === 'DONE' ? '✅' : job.status === 'ERROR' ? '⚠️' : '⏳');
const statusText = (job) => {
  if (job.status === 'DONE') return `Completado — ${job.total} boletines`;
  if (job.status === 'ERROR') return 'Error en la generación';
  return `${job.completed} / ${job.total} boletines`;
};
function elapsedText(job) {
  const start = Date.parse(job.startedAt);
  if (Number.isNaN(start)) return '';
  const end = job.finishedAt ? Date.parse(job.finishedAt) : Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return minutes > 0 ? `${minutes} min ${String(rem).padStart(2, '0')} s` : `${rem} s`;
}

// Estado a nivel de módulo: sobrevive a los cambios de pantalla (el componente se vuelve a montar en cada ruta).
const runningSeen = new Set();   // jobs que vimos en ejecución en esta sesión
const finishedShownAt = {};      // jobId -> instante en que se mostró como terminado

/** Pila global de notificaciones de generación de boletines (barra de progreso). */
export default function GenerationNotifications() {
  const allJobs = useGenerationJobs();
  const nav = useNavigate();
  const [, tick] = useState(0);

  useEffect(() => { setGenerationNavigate(nav); }, [nav]);
  // Recalcula cada segundo para retirar las ya terminadas pasado el tiempo de gracia.
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  const now = Date.now();
  const visible = allJobs.filter((job) => {
    if (job.status === 'RUNNING') { runningSeen.add(job.jobId); return true; }
    // Una generación terminada solo se avisa UNA vez: si la vimos correr (o terminó hace instantes).
    // Las generaciones viejas que el servidor aún lista no vuelven a aparecer al cambiar de pantalla.
    if (finishedShownAt[job.jobId] === undefined) {
      const fin = Date.parse(job.finishedAt);
      const fresh = runningSeen.has(job.jobId) || (!Number.isNaN(fin) && now - fin < AUTO_DISMISS_MS);
      finishedShownAt[job.jobId] = fresh ? now : -1;
    }
    const t = finishedShownAt[job.jobId];
    return t > 0 && now - t < AUTO_DISMISS_MS;
  });
  if (!visible.length) return null;

  return (
    <div className="pg-generation-notifications">
      <div className="gen-notifications-stack">
        {visible.map((job) => (
          <div key={job.jobId} className={`gen-notification${job.status === 'DONE' ? ' done' : ''}${job.status === 'ERROR' ? ' error' : ''}`}
            onClick={() => generation.openJob(job)}>
            <div className="gen-notif-header">
              <span className="gen-notif-icon">{statusIcon(job)}</span>
              <span className="gen-notif-title">Generación {job.grade} {job.classroom}</span>
            </div>
            <div className="gen-notif-progress-wrapper">
              <div className="gen-notif-progress-bar" style={{ width: `${progressPct(job)}%` }} />
            </div>
            <div className="gen-notif-text">{statusText(job)} · {elapsedText(job)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}