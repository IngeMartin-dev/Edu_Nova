import { useState } from 'react';

export const Icon = ({ name, ...p }) => <span className="material-icons" {...p}>{name}</span>;
export const Loading = () => <div className="loading"><span className="spinner" /></div>;
export const Empty = ({ icon = 'inbox', children }) => (
  <div className="empty"><Icon name={icon} />{children}</div>
);

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function Field({ label, children, className = '' }) {
  return <div className={`field ${className}`}><label>{label}</label>{children}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" className={`tab${value === t.value ? ' active' : ''}`} onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  );
}

/** Hook para formularios simples: const [f, set, setAll] = useForm({...}) */
export function useForm(initial) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  return [f, set, setF];
}

export const fullName = (u) => [u?.name, u?.surname].filter(Boolean).join(' ') || u?.username || '';
export const initials = (u) => ((u?.name?.[0] || u?.username?.[0] || '?') + (u?.surname?.[0] || '')).toUpperCase();
export const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return isNaN(x) ? String(d) : x.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};
