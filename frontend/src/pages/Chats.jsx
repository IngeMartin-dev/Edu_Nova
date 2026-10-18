import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/pages/chats.css';
import { api, imageUrl } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

// Pack de stickers integrado (emoji grandes): no depende de ningún servicio externo.
const STICKER_PACK = [
  '😀', '😂', '😍', '🥳', '😎', '🤔', '😴', '😭', '😡', '🥺',
  '👍', '👏', '🙌', '🙏', '💪', '✌️', '🤝', '👋', '🤞', '👌',
  '❤️', '🔥', '⭐', '🎉', '✅', '❌', '💯', '📚', '🎓', '🏆',
];

// Buscador de GIFs (Tenor): requiere una API key propia (VITE_TENOR_API_KEY). Sin ella queda
// deshabilitado y solo se puede adjuntar un GIF ya descargado con el clip.
const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY || '';

const formatTimeAgo = (createdAt) => {
  const now = new Date();
  const created = new Date(createdAt);
  const mins = Math.floor((now - created) / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 7) return `${d}d`;
  return created.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};
const formatMessageTime = (c) => new Date(c).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const getMessageDate = (c) => {
  const date = new Date(c);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};
const getInitials = (name, surname) => ((name?.charAt(0) || '') + (surname?.charAt(0) || '')).toUpperCase();
const imgUrl = (p) => (!p ? '' : /^https?:/i.test(p) ? p : imageUrl(p));

/** Chat entre usuarios: lista de contactos, conversación, stickers, GIF y adjuntos (chats del original). */
export default function Chats() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? 0;

  const [chats, setChats] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearchTerm, setGifSearchTerm] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const messagesRef = useRef(null);
  const fileRef = useRef(null);
  const selectedRef = useRef(null);
  const lastTs = useRef(null);
  const pollMsgs = useRef(null);
  selectedRef.current = selectedChat;

  const scrollToBottom = () => setTimeout(() => { const c = messagesRef.current; if (c) c.scrollTop = c.scrollHeight; }, 50);
  const toDisplay = (m) => ({ ...m, isFromMe: m.senderId === currentUserId });

  const loadContacts = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const contacts = await api.get('/chats/contacts', { currentUserId });
      const list = contacts.map((c) => ({ ...c, lastMessageTime: c.lastMessageAt ? formatTimeAgo(c.lastMessageAt) : '', isOnline: false }));
      setChats(list);
      setSelectedChat((sel) => (sel ? list.find((c) => c.id === sel.id) || sel : sel));
    } catch { /* se reintenta */ }
    setIsLoading(false);
  };

  useEffect(() => {
    loadContacts();
    // Refresca la lista de contactos (últimos mensajes / no leídos) cada 4 s.
    const h = setInterval(() => loadContacts(true), 4000);
    return () => { clearInterval(h); clearInterval(pollMsgs.current); };
  }, []); // eslint-disable-line

  const filteredChats = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return !term ? chats : chats.filter((c) => `${c.name} ${c.surname}`.toLowerCase().includes(term));
  }, [chats, searchTerm]);

  const pollNewMessages = async () => {
    const sel = selectedRef.current;
    if (!sel || !lastTs.current) return;
    const idAlPedir = sel.id;
    let nuevos;
    try { nuevos = await api.get(`/chats/conversation/${sel.id}/nuevos`, { currentUserId, since: lastTs.current }); } catch { return; }
    if (!nuevos.length) return;
    if (!selectedRef.current || selectedRef.current.id !== idAlPedir) return; // cambió de chat: se descarta
    let added = [];
    setMessages((cur) => {
      const ids = new Set(cur.map((m) => m.id));
      added = nuevos.filter((m) => !ids.has(m.id));
      return added.length ? [...cur, ...added.map(toDisplay)] : cur;
    });
    // setMessages es asíncrono: se recalcula con la misma lógica para los efectos posteriores
    lastTs.current = nuevos[nuevos.length - 1].createdAt;
    scrollToBottom();
    if (nuevos.some((m) => m.senderId !== currentUserId)) api.put(`/chats/conversation/${idAlPedir}/leido`, {}, { currentUserId }).catch(() => {});
  };

  const loadConversation = async (chat) => {
    try {
      const list = await api.get(`/chats/conversation/${chat.id}`, { currentUserId });
      setMessages(list.map(toDisplay));
      if (list.length) lastTs.current = list[list.length - 1].createdAt;
      scrollToBottom();
    } catch { /* sin conversación */ }
  };

  const selectChat = (chat) => {
    setSelectedChat(chat);
    selectedRef.current = chat;
    setMessages([]);
    // Mientras esté en null, pollNewMessages no hace nada (evita duplicar mensajes al cambiar de chat).
    lastTs.current = null;
    setShowStickerPicker(false);
    setShowGifPicker(false);
    loadConversation(chat);
    clearInterval(pollMsgs.current);
    // Chat "casi instantáneo": revisa mensajes nuevos cada segundo mientras la conversación está abierta.
    pollMsgs.current = setInterval(pollNewMessages, 1000);
    api.put(`/chats/conversation/${chat.id}/leido`, {}, { currentUserId }).then(() => {
      setChats((l) => l.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c)));
    }).catch(() => {});
  };

  const closeChat = () => { setSelectedChat(null); selectedRef.current = null; setMessages([]); clearInterval(pollMsgs.current); };

  const afterSend = (msg, preview) => {
    setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, toDisplay(msg)]));
    lastTs.current = msg.createdAt;
    setSelectedChat((s) => (s ? { ...s, lastMessage: preview, lastMessageTime: 'Ahora' } : s));
    setChats((l) => l.map((c) => (c.id === selectedRef.current?.id ? { ...c, lastMessage: preview, lastMessageTime: 'Ahora' } : c)));
    scrollToBottom();
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;
    const texto = newMessage.trim();
    setNewMessage('');
    try {
      const msg = await api.post('/chats/messages', { senderId: currentUserId, receiverId: selectedChat.id, content: texto, type: 'TEXT' });
      afterSend(msg, texto);
    } catch { setNewMessage(texto); }
  };

  const onFileSelected = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !selectedChat) return;
    const tipo = file.type.startsWith('image/') ? 'IMAGE' : 'FILE';
    setUploading(true);
    const fd = new FormData();
    fd.append('senderId', String(currentUserId));
    fd.append('receiverId', String(selectedChat.id));
    fd.append('type', tipo);
    fd.append('file', file);
    try {
      const msg = await api.post('/chats/messages/adjunto', fd);
      afterSend(msg, tipo === 'IMAGE' ? '📷 Foto' : `📎 ${file.name}`);
    } catch { /* sin adjunto */ }
    setUploading(false);
    input.value = '';
  };

  const sendSticker = async (emoji) => {
    if (!selectedChat) return;
    setShowStickerPicker(false);
    try { afterSend(await api.post('/chats/messages', { senderId: currentUserId, receiverId: selectedChat.id, content: emoji, type: 'STICKER' }), 'Sticker'); } catch { /* sin envío */ }
  };

  const searchGifs = async () => {
    if (!TENOR_API_KEY || !gifSearchTerm.trim()) return;
    setGifLoading(true);
    try {
      const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(gifSearchTerm.trim())}&key=${TENOR_API_KEY}&limit=12&media_filter=gif`);
      const data = await res.json();
      setGifResults((data.results || []).map((r) => ({ id: r.id, preview: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url, url: r.media_formats?.gif?.url })));
    } catch { /* sin resultados */ }
    setGifLoading(false);
  };
  const sendGif = async (url) => {
    if (!selectedChat) return;
    setShowGifPicker(false);
    try { afterSend(await api.post('/chats/messages', { senderId: currentUserId, receiverId: selectedChat.id, content: url, type: 'GIF' }), 'GIF'); } catch { /* sin envío */ }
  };

  const shouldShowDateDivider = (i) => i === 0 || new Date(messages[i - 1].createdAt).toDateString() !== new Date(messages[i].createdAt).toDateString();

  const avatar = (c) => (c.profilePicture
    ? <img src={imgUrl(c.profilePicture)} alt={`${c.name} ${c.surname || ''}`} className="avatar-image" />
    : <div className="avatar-initials">{getInitials(c.name, c.surname)}</div>);

  return (
    <div className="pg-chats">
      <div className={`chats-page${selectedChat ? ' chat-open' : ''}`}>
        {/* Panel izquierdo: lista de conversaciones */}
        <div className="chats-sidebar">
          <div className="sidebar-header">
            <h2><span className="material-icons">chat</span> Chats</h2>
          </div>

          <div className="search-container">
            <div className="search-bar">
              <span className="material-icons">search</span>
              <input type="text" placeholder="Buscar profesor, director o administrador..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>

          {isLoading && (
            <div className="loading-container">
              <div className="loading-spinner" />
              <p>Cargando chats...</p>
            </div>
          )}

          {!isLoading && filteredChats.length > 0 && (
            <div className="chats-list">
              {filteredChats.map((chat) => (
                <div key={chat.id} className={`chat-item${selectedChat?.id === chat.id ? ' active' : ''}${chat.unreadCount > 0 ? ' unread' : ''}`} onClick={() => selectChat(chat)}>
                  <div className="chat-avatar">{avatar(chat)}</div>
                  <div className="chat-info">
                    <div className="chat-header-row">
                      <h3 className="chat-name">{chat.name} {chat.surname}</h3>
                      <span className="chat-time">{chat.lastMessageTime}</span>
                    </div>
                    <div className="chat-preview">
                      <p className="last-message">{chat.lastMessage || 'Sin mensajes todavía'}</p>
                      {chat.unreadCount > 0 && <span className="unread-badge">{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && filteredChats.length === 0 && (
            <div className="no-chats">
              <span className="material-icons">chat_bubble_outline</span>
              <h4>No hay contactos</h4>
              <p>Aquí aparecen profesores, directores de grupo y administradores</p>
            </div>
          )}
        </div>

        {/* Panel derecho: conversación */}
        <div className="conversation-panel">
          {!selectedChat && (
            <div className="no-chat-selected">
              <span className="material-icons">forum</span>
              <h3>EduNova Chat</h3>
              <p>Selecciona una conversación para ver los mensajes</p>
            </div>
          )}

          {selectedChat && (
            <>
              <div className="conversation-header">
                <button className="icon-btn back-btn" aria-label="Volver" onClick={closeChat}>
                  <span className="material-icons">arrow_back</span>
                </button>
                <div className="chat-avatar">{avatar(selectedChat)}</div>
                <div className="conversation-user-info">
                  <h3>{selectedChat.name} {selectedChat.surname}</h3>
                </div>
              </div>

              <div className="messages-area" ref={messagesRef}>
                {messages.map((message, i) => (
                  <Fragment key={message.id}>
                    {shouldShowDateDivider(i) && <div className="message-date-divider"><span>{getMessageDate(message.createdAt)}</span></div>}
                    <div className={`message-bubble ${message.isFromMe ? 'sent' : 'received'}`}>
                      {!message.isFromMe && <div className="message-sender">{message.senderName}</div>}
                      {message.type === 'TEXT' && <p className="message-text">{message.content}</p>}
                      {message.type === 'STICKER' && <div className="message-sticker">{message.content}</div>}
                      {message.type === 'GIF' && <img className="message-gif" src={message.content} alt="GIF" loading="lazy" />}
                      {message.type === 'IMAGE' && (
                        <a href={imgUrl(message.fileUrl)} target="_blank" rel="noopener noreferrer">
                          <img className="message-image" src={imgUrl(message.fileUrl)} alt="Imagen adjunta" loading="lazy" />
                        </a>
                      )}
                      {message.type === 'FILE' && (
                        <a className="message-file" href={imgUrl(message.fileUrl)} target="_blank" rel="noopener noreferrer">
                          <span className="material-icons">description</span>
                          <span className="message-file-name">{message.fileName}</span>
                          <span className="material-icons">download</span>
                        </a>
                      )}
                      <div className="message-time">
                        {formatMessageTime(message.createdAt)}
                        {message.isFromMe && <span className={`material-icons read-check${message.read ? ' read' : ''}`}>done_all</span>}
                      </div>
                    </div>
                  </Fragment>
                ))}
                {messages.length === 0 && (
                  <div className="no-chats">
                    <span className="material-icons">chat</span>
                    <h4>Inicia la conversación</h4>
                    <p>Envía un mensaje para comenzar</p>
                  </div>
                )}
              </div>

              {showStickerPicker && (
                <div className="picker-panel sticker-picker">
                  {STICKER_PACK.map((emoji) => <button key={emoji} className="sticker-option" onClick={() => sendSticker(emoji)}>{emoji}</button>)}
                </div>
              )}

              {showGifPicker && (
                <div className="picker-panel gif-picker">
                  {!TENOR_API_KEY ? (
                    <p className="gif-picker-hint">
                      El buscador de GIFs necesita una API key de Tenor configurada (<code>VITE_TENOR_API_KEY</code>).
                      Mientras tanto, puedes adjuntar un GIF ya descargado con el botón de clip 📎.
                    </p>
                  ) : (
                    <>
                      <div className="gif-search-bar">
                        <input type="text" placeholder="Buscar GIF..." value={gifSearchTerm} onChange={(e) => setGifSearchTerm(e.target.value)} onKeyUp={(e) => e.key === 'Enter' && searchGifs()} />
                        <button className="icon-btn" aria-label="Buscar GIF" onClick={searchGifs}><span className="material-icons">search</span></button>
                      </div>
                      {gifLoading && <div className="loading-spinner small" />}
                      <div className="gif-results">
                        {gifResults.map((gif) => <img key={gif.id} className="gif-thumb" src={gif.preview} onClick={() => sendGif(gif.url)} alt="GIF" />)}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="message-input-area">
                <input ref={fileRef} type="file" hidden onChange={onFileSelected} />
                <button className="icon-btn" title="Adjuntar archivo o imagen" aria-label="Adjuntar archivo o imagen" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <span className="material-icons">attach_file</span>
                </button>
                <button className="icon-btn" title="Sticker" aria-label="Elegir sticker" onClick={() => { setShowStickerPicker((v) => !v); setShowGifPicker(false); }}>
                  <span className="material-icons">mood</span>
                </button>
                <button className="icon-btn" title="GIF" aria-label="Elegir GIF" onClick={() => { setShowGifPicker((v) => !v); setShowStickerPicker(false); }}>
                  <span className="material-icons">gif</span>
                </button>
                <input type="text" className="message-input" placeholder="Escribe un mensaje..." autoComplete="off" value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)} onKeyUp={(e) => e.key === 'Enter' && sendMessage()} aria-label="Escribir mensaje" />
                <button className="send-btn" disabled={!newMessage.trim()} onClick={sendMessage} title="Enviar">
                  <span className="material-icons">send</span>
                </button>
              </div>
              {uploading && <div className="uploading-hint">Enviando adjunto...</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
