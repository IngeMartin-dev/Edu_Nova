import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import '../styles/pages/login.css';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { registerPushToken } from '../services/firebasePush.js';

const MIN_LOADING_MS = 1500; // el spinner se muestra al menos este tiempo

/** Inicio de sesión con verificación en dos pasos por correo (login del original). */
export default function Login() {
  const { user, finishLogin } = useAuth();
  const nav = useNavigate();
  const alreadyLogged = useRef(!!user); // solo redirige directo si ya había sesión al abrir

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [buttonState, setButtonState] = useState('default');
  const [buttonText, setButtonText] = useState('Iniciar Sesión');
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorHiding, setErrorHiding] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorEmailHint, setTwoFactorEmailHint] = useState('');
  const pendingUserId = useRef(null);
  const loadingStart = useRef(0);
  const timers = useRef([]);
  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (alreadyLogged.current && user) return <Navigate to="/dashboard" replace />;

  const flashError = (message, keepButton) => {
    setErrorMessage(message);
    setErrorVisible(true);
    setErrorHiding(false);
    later(() => {
      setErrorHiding(true);
      later(() => { setErrorVisible(false); if (!keepButton) { setButtonState('default'); setButtonText(twoFactorStepRef.current ? 'Verificar código' : 'Iniciar Sesión'); } }, 500);
    }, 5000);
  };
  const twoFactorStepRef = useRef(false);
  twoFactorStepRef.current = twoFactorStep;

  const remaining = () => Math.max(0, MIN_LOADING_MS - (Date.now() - loadingStart.current));

  const goToDashboardAfterLogin = (me) => {
    if (me?.id) registerPushToken(me.id);
    later(() => {
      setIsLoading(false);
      setButtonState('success');
      setButtonText('Bienvenido');
      later(() => {
        setIsFadingOut(true);
        later(() => nav('/dashboard', { replace: true }), 500);
      }, 1000);
    }, remaining());
  };

  const showLoginError = (message) => {
    later(() => {
      setIsLoading(false);
      setButtonState('error');
      setButtonText('Incorrecto');
      flashError(message);
    }, remaining());
  };

  const onLogin = async () => {
    setErrorMessage(''); setErrorVisible(false); setErrorHiding(false);
    setButtonState('default'); setButtonText('Iniciar Sesión');
    setIsLoading(true);
    loadingStart.current = Date.now();

    if (!username || !password) {
      setErrorMessage('Por favor ingrese usuario y contraseña');
      setErrorVisible(true); setErrorHiding(false); setIsLoading(false);
      later(() => { setErrorHiding(true); later(() => setErrorVisible(false), 500); }, 5000);
      return;
    }
    try {
      const r = await api.login('/auth/login', { username, password });
      if (r.twoFactorRequired) {
        // Aún no hay sesión: se pide el código de verificación.
        pendingUserId.current = r.userId ?? null;
        setTwoFactorEmailHint(r.emailHint || 'tu correo registrado');
        setTwoFactorStep(true);
        setIsLoading(false); setButtonState('default'); setButtonText('Verificar código');
        return;
      }
      goToDashboardAfterLogin(await finishLogin(r));
    } catch (e) {
      showLoginError(e.message || 'Error al iniciar sesión');
    }
  };

  const onVerifyTwoFactor = async () => {
    if (!pendingUserId.current || !twoFactorCode.trim()) {
      setErrorMessage('Ingresa el código que llegó a tu correo');
      setErrorVisible(true); setErrorHiding(false);
      return;
    }
    setErrorVisible(false);
    setIsLoading(true);
    loadingStart.current = Date.now();
    try {
      const r = await api.login('/auth/verify-2fa', { userId: pendingUserId.current, code: twoFactorCode.trim() });
      goToDashboardAfterLogin(await finishLogin(r));
    } catch (e) {
      showLoginError(e.message || 'Código incorrecto o vencido');
    }
  };

  const cancelTwoFactor = () => {
    setTwoFactorStep(false); setTwoFactorCode(''); pendingUserId.current = null; setButtonText('Iniciar Sesión');
  };

  const stateClass = `${buttonState === 'success' ? ' success' : ''}${buttonState === 'error' ? ' error' : ''}`;
  const btnBody = isLoading ? <span className="loading-spinner" /> : <span>{buttonText}</span>;

  return (
    <div className="pg-login">
      <div className={`login-container${isFadingOut ? ' fade-out' : ''}`}>
        {/* Panel de marca */}
        <div className="left-panel">
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <span className="orb orb-3" />
          <div className="logo-container">
            <div className="logo-badge"><img src={`${import.meta.env.BASE_URL}logo-symbol.svg`} alt="Logo EduNova" className="school-logo" /></div>
            <h1>Edu<span>Nova</span></h1>
            <p>Gestión académica clara, rápida y segura.</p>
            <ul className="feature-chips">
              <li><span className="material-icons">grading</span>Notas por período</li>
              <li><span className="material-icons">description</span>Boletines en PDF</li>
              <li><span className="material-icons">assessment</span>Consolidados</li>
              <li><span className="material-icons">forum</span>Chat con acudientes</li>
            </ul>
          </div>
          <p className="brand-foot">Notas · Boletines · Consolidados</p>
        </div>

        {/* Formulario */}
        <div className="right-panel">
          <div className="login-form-container">
            <div className="form-header">
              {!twoFactorStep ? (
                <>
                  <h2>Iniciar Sesión</h2>
                  <p>Ingresa tu usuario y contraseña para acceder a la app</p>
                </>
              ) : (
                <>
                  <h2>Verificación en dos pasos</h2>
                  <p>Enviamos un código de 6 dígitos a {twoFactorEmailHint}</p>
                  <p className="spam-hint">
                    <span className="material-icons">info</span>
                    Si no lo ves en unos minutos, revisa tu carpeta de spam o correo no deseado.
                  </p>
                </>
              )}
            </div>

            {!twoFactorStep ? (
              <form className="login-form" onSubmit={(e) => e.preventDefault()}>
                <div className="form-group">
                  <label htmlFor="username">Usuario</label>
                  <div className="input-group">
                    <span className="material-icons input-icon">person</span>
                    <input type="text" id="username" value={username} onChange={(e) => setUsername(e.target.value)} name="username"
                      placeholder="Ingrese su usuario" autoComplete="username" required className="form-input"
                      onKeyDown={(e) => e.key === 'Enter' && onLogin()} />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="password">Contraseña</label>
                  <div className="input-group">
                    <span className="material-icons input-icon">lock</span>
                    <input type={passwordVisible ? 'text' : 'password'} id="password" value={password} onChange={(e) => setPassword(e.target.value)} name="password"
                      placeholder="Ingrese su contraseña" autoComplete="current-password" required className="form-input"
                      onKeyDown={(e) => e.key === 'Enter' && onLogin()} />
                    <button type="button" className="password-toggle" onClick={() => setPasswordVisible(!passwordVisible)}
                      title={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                      <span className="material-icons">{passwordVisible ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>

                <button type="button" className={`login-btn${stateClass}`} disabled={isLoading} onClick={onLogin}>{btnBody}</button>
              </form>
            ) : (
              <form className="login-form" onSubmit={(e) => e.preventDefault()}>
                <div className="form-group">
                  <label htmlFor="twofa-code">Código de verificación</label>
                  <div className="input-group">
                    <span className="material-icons input-icon">password</span>
                    <input type="text" id="twofa-code" inputMode="numeric" maxLength={6} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)}
                      name="twoFactorCode" placeholder="123456" autoComplete="one-time-code" required className="form-input"
                      onKeyDown={(e) => e.key === 'Enter' && onVerifyTwoFactor()} />
                  </div>
                </div>
                <button type="button" className={`login-btn${stateClass}`} disabled={isLoading} onClick={onVerifyTwoFactor}>{btnBody}</button>
                <button type="button" className="secondary-link-btn" onClick={cancelTwoFactor}>Volver a intentar con otra cuenta</button>
              </form>
            )}

            <div className={`error-message${errorVisible ? ' visible' : ''}${errorHiding ? ' hide' : ''}`}>{errorMessage}</div>

            <div className="footer-text"><p>&copy; {new Date().getFullYear()} EduNova</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
