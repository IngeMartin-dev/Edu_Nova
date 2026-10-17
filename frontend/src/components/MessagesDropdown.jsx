import { useEffect, useRef, useState } from 'react';
import '../styles/pages/messages-dropdown.css';
import {
  formatTimeAgo, isNewlyArrived, loadDeleted, markMessageRead, markNotificationRead, saveDeleted,
} from '../services/notifications.js';

const typeStyle = (type) => {
  switch (type) {
    case 'ADMIN_MESSAGE': return { icon: 'campaign', color: '#5627e9', label: 'Administración' };
    case 'REPORT_CARD_SENT': return { icon: 'assignment', color: '#f59e0b', label: 'Boletín' };
    case 'REPORT_CARD_SIGNED': return { icon: 'verified', color: '#16a34a', label: 'Firmado' };
    default: return { icon: 'notifications', color: '#9564f0', label: 'Aviso' };
  }
};
const soft = (hex) => `color-mix(in srgb, ${hex} 14%, transparent)`;
const toTime = (iso) => { const t = new Date(iso).getTime(); return Number.isNaN(t) ? 0 : t; };

/** Bandeja unificada de notificaciones y respuestas (messages-dropdown del original). */
export default function MessagesDropdown({ isOpen, onClose, onMessageClick, notifications = [], messages = [] }) {
  const [tab, setTab] = useState('all');
  const [deleted, setDeleted] = useState(() => loadDeleted());
  const [deleting, setDeleting] = useState(() => new Set());
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) => !deleted.has(n.id));
  const filteredMessages = messages.filter((m) => !deleted.has(m.id));

  const items = [];
  for (const n of filteredNotifications) {
    const st = typeStyle(n.notificationType);
    const sender = n.user ? `${n.user.name || ''} ${n.user.surname || ''}`.trim() : '';
    items.push({
      key: `n${n.id}`, id: n.id, kind: 'notification', raw: n, title: n.title, text: n.message, sender: sender || 'Sistema',
      picture: n.user?.profilePicture || '', icon: st.icon, color: st.color, colorSoft: soft(st.color), label: st.label,
      unread: isNewlyArrived(n) || !n.isRead, ts: toTime(n.createdAt), time: formatTimeAgo(n.createdAt),
    });
  }
  for (const m of filteredMessages) {
    const color = '#d710e7';
    items.push({
      key: `m${m.id}`, id: m.id, kind: 'message', raw: m, title: `Respuesta a "${m.originalNotificationTitle}"`, text: m.replyMessage,
      sender: `${m.senderName || ''} ${m.senderSurname || ''}`.trim(), picture: '', icon: 'reply', color, colorSoft: soft(color),
      label: 'Respuesta', unread: !m.isRead, ts: toTime(m.createdAt), time: formatTimeAgo(m.createdAt),
    });
  }
  items.sort((a, b) => b.ts - a.ts);

  const unreadCount = items.filter((i) => i.unread).length;
  const totalCount = filteredNotifications.length + filteredMessages.length;
  const visible = tab === 'unread' ? items.filter((i) => i.unread) : tab === 'replies' ? items.filter((i) => i.kind === 'message') : items;

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const yesterday = today - 86400000;
  const groups = [{ label: 'Hoy', items: [] }, { label: 'Ayer', items: [] }, { label: 'Anteriores', items: [] }];
  for (const it of visible) {
    if (it.ts >= today) groups[0].items.push(it);
    else if (it.ts >= yesterday) groups[1].items.push(it);
    else groups[2].items.push(it);
  }
  const grouped = groups.filter((g) => g.items.length > 0);

  const hasContent = totalCount > 0;
  const hasUnreadItems = notifications.concat([]).some((n) => !deleted.has(n.id) && !n.isRead) || filteredMessages.some((m) => !m.isRead);

  const markAsReadAndClose = (item, type) => {
    if (type === 'message' && !item.isRead) markMessageRead(item.id);
    else if (type === 'notification' && !item.isRead) markNotificationRead(item.id);
    onMessageClick?.({ item, type, action: 'view' });
    onClose();
  };
  const markAllAsRead = () => {
    messages.filter((m) => !m.isRead).forEach((m) => markMessageRead(m.id));
    notifications.filter((n) => !n.isRead).forEach((n) => markNotificationRead(n.id));
  };
  // Quita los avisos uno por uno con animación (igual que el original).
  const deleteAll = () => {
    const all = [...filteredNotifications, ...filteredMessages];
    const isNotif = (id) => notifications.some((n) => n.id === id);
    let index = 0;
    const next = () => {
      if (index >= all.length) return;
      const it = all[index];
      setDeleting((s) => new Set(s).add(it.id));
      if (isNotif(it.id)) markNotificationRead(it.id); else markMessageRead(it.id);
      timers.current.push(setTimeout(() => {
        setDeleted((s) => { const n = new Set(s); n.add(it.id); saveDeleted(n); return n; });
        setDeleting((s) => { const n = new Set(s); n.delete(it.id); return n; });
      }, 500));
      index += 1;
      timers.current.push(setTimeout(next, 200));
    };
    next();
  };

  return (
    <div className="pg-messages-dropdown">
      <div className="messages-dropdown dropdown-open">
        <div className="dd-header">
          <div className="dd-title">
            <span className="dd-title-icon material-icons">notifications_active</span>
            <div>
              <h3>Bandeja</h3>
              <small>{unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}</small>
            </div>
          </div>
          <button className="close-btn" aria-label="Cerrar" onClick={onClose}>
            <span className="material-icons">close</span>
          </button>
        </div>

        <div className="dd-tabs" role="tablist">
          <button role="tab" className={`dd-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>
            Todo <span className="dd-count">{totalCount}</span>
          </button>
          <button role="tab" className={`dd-tab${tab === 'unread' ? ' active' : ''}`} onClick={() => setTab('unread')}>
            Sin leer <span className={`dd-count${unreadCount > 0 ? ' hot' : ''}`}>{unreadCount}</span>
          </button>
          <button role="tab" className={`dd-tab${tab === 'replies' ? ' active' : ''}`} onClick={() => setTab('replies')}>
            Respuestas <span className="dd-count">{filteredMessages.length}</span>
          </button>
        </div>

        {visible.length > 0 ? (
          <div className="combined-list">
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="dd-group-label">{group.label}</div>
                {group.items.map((it) => (
                  <div key={it.key} className={`dd-item${it.unread ? ' unread' : ''}${deleting.has(it.id) ? ' deleting' : ''}`}
                    onClick={() => markAsReadAndClose(it.raw, it.kind)}>
                    <div className="dd-avatar" style={{ background: it.color }}>
                      {it.picture ? <img src={it.picture} alt={it.sender} /> : <span className="material-icons">{it.icon}</span>}
                    </div>
                    <div className="dd-body">
                      <div className="dd-row">
                        <span className="dd-item-title">{it.title}</span>
                        <span className="dd-time">{it.time}</span>
                      </div>
                      <div className="dd-sender">
                        <span className="dd-chip" style={{ color: it.color, background: it.colorSoft }}>{it.label}</span>
                        <span className="dd-from">{it.sender}</span>
                      </div>
                      <div className="dd-text">{it.text}</div>
                    </div>
                    {it.unread && <span className="dd-dot" aria-label="Sin leer" />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="material-icons">{tab === 'unread' ? 'done_all' : 'mark_email_read'}</span>
            <p>{tab === 'unread' ? '¡Estás al día!' : 'Aquí aparecerán tus avisos'}</p>
            <small>{tab === 'unread' ? 'No tienes nada pendiente por leer.' : 'Las notificaciones y respuestas llegarán a esta bandeja.'}</small>
          </div>
        )}

        {hasContent && (
          <div className="dropdown-footer">
            <button className="mark-all-read-btn" disabled={!hasUnreadItems} onClick={markAllAsRead}>
              <span className="material-icons">done_all</span> Marcar todo como leído
            </button>
            <button className="delete-notifications-btn" onClick={deleteAll}>
              <span className="material-icons">delete_sweep</span> Limpiar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
