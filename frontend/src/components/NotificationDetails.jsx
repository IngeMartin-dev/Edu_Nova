import { useEffect, useState } from 'react';
import '../styles/pages/notification-details.css';
import { markNotificationRead } from '../services/notifications.js';
import { useAuth } from '../context/AuthContext.jsx';

const ICON = { ADMIN_MESSAGE: 'admin_panel_settings', REPORT_CARD_SENT: 'assignment', REPORT_CARD_SIGNED: 'verified', REPLY: 'reply' };
const COLOR = { ADMIN_MESSAGE: '#4523f1', REPORT_CARD_SENT: '#FF9800', REPORT_CARD_SIGNED: '#4CAF50', REPLY: '#d710e7' };
const typeIcon = (t) => ICON[t] || 'notifications';
const typeColor = (t) => COLOR[t] || '#757575';

const formatDateTime = (s) => new Date(s).toLocaleString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const getInitials = (name, surname) => {
  if (!name && !surname) return '';
  return (name ? name.charAt(0).toUpperCase() : '') + (surname ? surname.charAt(0).toUpperCase() : '');
};

/** Detalle de una notificación con formulario de respuesta (notification-details del original). */
export default function NotificationDetails({ notification, isOpen, readOnly, onClose, onReply }) {
  const { user } = useAuth();
  const [replyMessage, setReplyMessage] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => { if (!isOpen) { setReplyMessage(''); setIsReplying(false); } }, [isOpen]);

  const resetForm = () => { setReplyMessage(''); setIsReplying(false); };
  const closeModal = () => { resetForm(); onClose(); };
  const markAsRead = () => { if (notification && !notification.isRead) markNotificationRead(notification.id); };

  const sendReply = () => {
    if (!replyMessage.trim() || !notification || isReplying) return;
    setIsReplying(true);
    onReply({ originalNotificationId: notification.id, message: replyMessage.trim(), senderId: user?.id || 0 });
    setShowSuccess(true);
    setTimeout(() => { setShowSuccess(false); resetForm(); }, 2000);
  };

  const isOwn = !!notification && !!user && notification.user?.id === user.id;
  const n = notification;

  return (
    <div className="pg-notification-details">
      <div className={`success-notification${showSuccess ? ' show' : ''}`}>
        <div className="notification-content">
          <div className="checkmark-circle">
            <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
              <path className="checkmark__check" fill="none" d="M14 27l8 8 16-16" />
            </svg>
          </div>
          <h3>¡Respuesta enviada!</h3>
          <p>Tu mensaje ha sido enviado con éxito</p>
        </div>
      </div>

      {isOpen && (
        <div className="notification-details-overlay" onClick={closeModal}>
          <div className="notification-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="header-info">
                <div className="notification-icon" style={{ backgroundColor: typeColor(n?.notificationType || '') }}>
                  <span className="material-icons">{typeIcon(n?.notificationType || '')}</span>
                </div>
                <div className="header-text">
                  <h2>{n?.title || 'Notificación'}</h2>
                  <div className="meta-info">
                    {n?.user && (
                      <span className="sender">
                        {n.user.profilePicture
                          ? <img src={n.user.profilePicture} alt={`${n.user.name || ''} ${n.user.surname || ''}`} title={`${n.user.name || ''} ${n.user.surname || ''}`} className="sender-profile-picture" />
                          : <div className="sender-initials">{getInitials(n.user.name, n.user.surname)}</div>}
                        {n.user.name || ''} {n.user.surname || ''}
                      </span>
                    )}
                    <span className="date">{formatDateTime(n?.createdAt || '')}</span>
                  </div>
                </div>
              </div>
              <button className="close-button" aria-label="Cerrar" onClick={closeModal}>
                <span className="material-icons">close</span>
              </button>
            </div>

            {n && (
              <div className="modal-content">
                <div className="message-container">
                  <div className="message-text">{n.message}</div>
                  {!n.isRead && (
                    <div className="notification-status">
                      <span className="status-indicator"><span className="material-icons">circle</span> No leído</span>
                    </div>
                  )}
                </div>

                {!isOwn && !readOnly && (
                  <div className="reply-section">
                    <div className="reply-header"><h3>Responder</h3></div>
                    <div className="reply-form">
                      <textarea id="reply-textarea" name="replyMessage" value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Escriba su respuesta..." rows={3} className="reply-textarea" autoComplete="off" aria-label="Escriba su respuesta" />
                      <div className="reply-actions">
                        <button className="cancel-reply-btn" onClick={resetForm} disabled={isReplying}>Cancelar</button>
                        <button className="send-reply-btn" onClick={sendReply} disabled={!replyMessage.trim() || isReplying}>
                          <span>{isReplying ? 'Enviando...' : 'Enviar Respuesta'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {isOwn && !readOnly && (
                  <div className="own-notification-info">
                    <div className="info-message"><span className="material-icons">info</span> Esta es una notificación que usted envió</div>
                  </div>
                )}
              </div>
            )}

            <div className="modal-footer">
              {n && !n.isRead && !readOnly && (
                <button className="mark-read-btn" onClick={markAsRead}>
                  <span className="material-icons">done_all</span> Marcar como leída
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
