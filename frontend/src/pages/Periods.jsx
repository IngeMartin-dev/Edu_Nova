import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { bus } from '../services/events.js';
import { notifyPeriodsChanged } from '../services/realtime.js';
import '../styles/pages/periods.css';
import Overlay from '../components/Overlay.jsx';

const uniqueByNumber = (list) => list.filter((p, index, self) => index === self.findIndex((t) => t.periodNumber === p.periodNumber));

const formatDateForInput = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getStatusText = (isUnlocked) => (isUnlocked ? 'Desbloqueado' : 'Bloqueado');

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return 'No establecido';
  return new Date(dateStr).toLocaleString('es-CO');
};

export default function Periods() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [editingPeriod, setEditingPeriod] = useState(null);
  const [unlockDateTemp, setUnlockDateTemp] = useState('');
  const [lockDateTemp, setLockDateTemp] = useState('');
  const [, setIsAutomaticTemp] = useState(false);
  const successTimer = useRef(null);

  const flashSuccess = (msg) => {
    setSuccessMessage(msg);
    clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMessage(''), 3000);
  };

  const loadPeriods = async () => {
    setLoading(true);
    try {
      const data = await api.get('/periods');
      console.log('Periodos recibidos:', data);
      const unique = uniqueByNumber(data);
      console.log('Periodos únicos:', unique);
      if (unique.length === 0) {
        await initializePeriods();
      } else {
        setPeriods(unique);
        setLoading(false);
      }
    } catch (err) {
      console.error('Error loading periods:', err);
      setErrorMessage('Error al cargar los períodos');
      setLoading(false);
    }
  };

  const initializePeriods = async () => {
    try {
      await api.post('/periods/initialize', {});
      await loadPeriods();
    } catch (err) {
      console.error('Error initializing periods:', err);
    }
  };

  useEffect(() => {
    loadPeriods();
    // Actualizaciones globales en tiempo real
    const off = bus.on('periods:changed', (list) => {
      if (Array.isArray(list) && list.length > 0) setPeriods(uniqueByNumber(list));
    });
    return () => { off(); clearTimeout(successTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePeriod = async (periodNumber, currentStatus) => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const newStatus = !currentStatus;
    try {
      await api.put(`/periods/${periodNumber}/unlock`, { unlocked: newStatus });
      setPeriods((ps) => ps.map((p) => (p.periodNumber === periodNumber ? { ...p, isUnlocked: newStatus, isAutomatic: false } : p)));
      setSaving(false);
      flashSuccess(newStatus
        ? `Período ${periodNumber} desbloqueado correctamente`
        : `Período ${periodNumber} bloqueado correctamente`);
      notifyPeriodsChanged();
    } catch (err) {
      console.error('Error updating period:', err);
      setSaving(false);
      setErrorMessage('Error al actualizar el período');
    }
  };

  const openScheduleModal = (period) => {
    setEditingPeriod(period);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const currentDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setUnlockDateTemp(period.unlockDate ? formatDateForInput(period.unlockDate) : currentDateTime);
    setLockDateTemp(period.lockDate ? formatDateForInput(period.lockDate) : currentDateTime);
    setIsAutomaticTemp(period.isAutomatic || false);
  };

  const closeScheduleModal = () => {
    setEditingPeriod(null);
    setUnlockDateTemp('');
    setLockDateTemp('');
    setIsAutomaticTemp(false);
  };

  const saveSchedule = async () => {
    const period = editingPeriod;
    if (!period) return;
    setSaving(true);
    let unlockDateStr = null;
    let lockDateStr = null;
    // datetime-local (YYYY-MM-DDTHH:MM)
    if (unlockDateTemp) unlockDateStr = unlockDateTemp.includes(':') ? unlockDateTemp + ':00' : unlockDateTemp + ':00:00';
    if (lockDateTemp) lockDateStr = lockDateTemp.includes(':') ? lockDateTemp + ':00' : lockDateTemp + ':00:00';
    try {
      const response = await api.put(`/periods/${period.periodNumber}/schedule`, { unlockDate: unlockDateStr, lockDate: lockDateStr });
      setPeriods((ps) => ps.map((p) => (p.periodNumber === period.periodNumber ? { ...p, ...response } : p)));
      setSaving(false);
      closeScheduleModal();
      flashSuccess('Programación guardada correctamente');
      notifyPeriodsChanged();
    } catch (err) {
      console.error('Error saving schedule:', err);
      setSaving(false);
      setErrorMessage('Error al guardar la programación');
    }
  };

  const isAdmin = () => {
    const roleName = (user?.role?.name || user?.role || '').toString().toUpperCase();
    // Cuenta también el rol "extra" de Admin sumado desde Configuración de Año.
    return roleName === 'ADMIN' || !!user?.additionalAdmin;
  };

  const goBack = () => navigate('/dashboard');

  return (
    <div className="pg-periods">
      <div className="periods-container">
        <div className="header">
          <button className="back-btn" aria-label="Volver" onClick={goBack}>
            <span className="material-icons">arrow_back</span>
          </button>
          <h1>Gestión de Períodos</h1>
        </div>

        {loading ? (
          <div className="loading">
            <span className="material-icons">hourglass_empty</span>
            <p>Cargando períodos...</p>
          </div>
        ) : (
          <>
            <div className="info-box">
              <span className="material-icons">info</span>
              <p>Aquí puedes bloquear o desbloquear los períodos académicos. También puedes programar fechas automáticas para el bloqueo y desbloqueo de cada período.</p>
            </div>

            {successMessage && (
              <div className="success-message">
                <span className="material-icons">check_circle</span>
                {successMessage}
              </div>
            )}

            {errorMessage && (
              <div className="error-message">
                <span className="material-icons">error</span>
                {errorMessage}
              </div>
            )}

            <div className="periods-grid">
              {periods.map((period) => (
                <div key={period.id ?? period.periodNumber} className={`period-card${!period.isUnlocked ? ' locked' : ''}${period.isUnlocked ? ' unlocked' : ''}`}>
                  <div className="period-header">
                    <span className="period-number">Período {period.periodNumber}</span>
                    <span className="status-icon">
                      <span className="material-icons">{period.isUnlocked ? 'lock_open' : 'lock'}</span>
                    </span>
                  </div>

                  <div className="period-status">
                    <span className={`status-badge${period.isUnlocked ? ' active' : ''}`}>
                      {getStatusText(period.isUnlocked)}
                    </span>
                    {period.isAutomatic && <span className="status-badge automatic">Automático</span>}
                  </div>

                  <div className="period-info">
                    <div className="info-row">
                      <span className="label">
                        <span className="material-icons">lock_open</span>
                        Desbloqueo
                      </span>
                      <span className="value">{formatDisplayDate(period.unlockDate)}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">
                        <span className="material-icons">lock</span>
                        Bloqueo
                      </span>
                      <span className="value">{formatDisplayDate(period.lockDate)}</span>
                    </div>
                  </div>

                  <div className="period-actions">
                    <button className="btn-toggle" onClick={() => togglePeriod(period.periodNumber, period.isUnlocked)} disabled={saving}>
                      <span className="material-icons">{period.isUnlocked ? 'lock' : 'lock_open'}</span>
                      {period.isUnlocked ? 'Bloquear' : 'Desbloquear'}
                    </button>
                    <button className="btn-schedule" onClick={() => openScheduleModal(period)}>
                      <span className="material-icons">schedule</span>
                      Programar
                    </button>
                  </div>

                  <div className="period-description">
                    <p>{period.description || 'Período académico ' + period.periodNumber}</p>
                  </div>
                </div>
              ))}
            </div>

            {!isAdmin() && (
              <div className="admin-notice">
                <span className="material-icons">warning</span>
                <p>Solo los administradores pueden modificar los períodos.</p>
              </div>
            )}
          </>
        )}

        {editingPeriod && (
          <Overlay className="modal-overlay" onClick={closeScheduleModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Programar Período {editingPeriod?.periodNumber}</h2>
                <button className="close-btn" aria-label="Cerrar" onClick={closeScheduleModal}>
                  <span className="material-icons">close</span>
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label>
                    <span className="material-icons">lock_open</span>
                    Fecha y hora de desbloqueo
                  </label>
                  <input type="datetime-local" id="unlockDate" name="unlockDate" autoComplete="off"
                    title="Seleccionar fecha y hora de desbloqueo" value={unlockDateTemp}
                    onChange={(e) => setUnlockDateTemp(e.target.value)} className="form-input" placeholder="Seleccionar fecha y hora" />
                </div>

                <div className="form-group">
                  <label htmlFor="lockDate">
                    <span className="material-icons">lock</span>
                    Fecha y hora de bloqueo
                  </label>
                  <input type="datetime-local" id="lockDate" name="lockDate" autoComplete="off"
                    title="Seleccionar fecha y hora de bloqueo" value={lockDateTemp}
                    onChange={(e) => setLockDateTemp(e.target.value)} className="form-input" placeholder="Seleccionar fecha y hora" />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-cancel" onClick={closeScheduleModal}>
                  <span className="material-icons">close</span>
                  Cancelar
                </button>
                <button className="btn-save" onClick={saveSchedule} disabled={saving}>
                  {saving ? <span className="material-icons">hourglass_empty</span> : <span className="material-icons">save</span>}
                  Guardar
                </button>
              </div>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}