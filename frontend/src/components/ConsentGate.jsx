import { useState } from 'react';
import '../styles/pages/consent-gate.css';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { PRIVACY, TERMS } from '../legal/content.js';

/**
 * Bloqueo obligatorio de consentimiento legal (consent-gate del original):
 * se muestra solo cuando hay sesión y falta aceptar Términos y/o Privacidad.
 * No se cierra con clic fuera ni con Escape: aceptar o cerrar sesión.
 */
export default function ConsentGate() {
  const { user, loadMe, logout } = useAuth();
  const [tab, setTab] = useState('terms');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  if (!user || (user.termsAcceptedAt && user.privacyAcceptedAt)) return null;
  const needsTerms = !user.termsAcceptedAt;
  const needsPrivacy = !user.privacyAcceptedAt;
  const activeTab = tab === 'terms' && !needsTerms ? 'privacy' : tab === 'privacy' && !needsPrivacy ? 'terms' : tab;
  const canContinue = (!needsTerms || acceptedTerms) && (!needsPrivacy || acceptedPrivacy);

  const confirm = async () => {
    if (!canContinue || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await Promise.all([
        needsTerms && api.post('/auth/accept-legal', { type: 'terms' }),
        needsPrivacy && api.post('/auth/accept-legal', { type: 'privacy' }),
      ].filter(Boolean));
    } catch {
      setSubmitting(false);
      setErrorMessage('No pudimos registrar tu aceptación. Revisa tu conexión e intenta de nuevo.');
      return;
    }
    try { await loadMe(); setSubmitting(false); } catch {
      setSubmitting(false);
      setErrorMessage('No pudimos confirmar tu aceptación. Intenta de nuevo.');
    }
  };

  return (
    <div className="pg-consent-gate">
      <div className="consent-overlay" role="alertdialog" aria-modal="true" aria-labelledby="consent-title">
        <div className="consent-modal">
          <div className="consent-header">
            <h2 id="consent-title">Antes de continuar</h2>
            <p>Necesitamos que leas y aceptes lo siguiente para seguir usando EduNova.</p>
          </div>

          <div className="consent-tabs" role="tablist">
            {needsTerms && (
              <button type="button" role="tab" aria-selected={activeTab === 'terms'} className={`consent-tab${activeTab === 'terms' ? ' active' : ''}`} onClick={() => setTab('terms')}>
                Términos y Condiciones
              </button>
            )}
            {needsPrivacy && (
              <button type="button" role="tab" aria-selected={activeTab === 'privacy'} className={`consent-tab${activeTab === 'privacy' ? ' active' : ''}`} onClick={() => setTab('privacy')}>
                Política de Privacidad
              </button>
            )}
          </div>

          <div className="consent-body" tabIndex={0}
            dangerouslySetInnerHTML={{ __html: activeTab === 'terms' && needsTerms ? TERMS : activeTab === 'privacy' && needsPrivacy ? PRIVACY : '' }} />

          <div className="consent-checks">
            {needsTerms && (
              <label className="consent-check">
                <input type="checkbox" checked={acceptedTerms} onChange={() => setAcceptedTerms(!acceptedTerms)} />
                He leído y acepto los Términos y Condiciones
              </label>
            )}
            {needsPrivacy && (
              <label className="consent-check">
                <input type="checkbox" checked={acceptedPrivacy} onChange={() => setAcceptedPrivacy(!acceptedPrivacy)} />
                He leído y acepto la Política de Privacidad
              </label>
            )}
          </div>

          {errorMessage && <p className="consent-error">{errorMessage}</p>}

          <div className="consent-actions">
            <button type="button" className="consent-logout" onClick={() => { logout(); window.location.href = import.meta.env.BASE_URL + 'login'; }}>
              Prefiero no aceptar (cerrar sesión)
            </button>
            <button type="button" className="consent-confirm" disabled={!canContinue || submitting} onClick={confirm}>
              {submitting ? 'Guardando...' : 'Aceptar y continuar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
