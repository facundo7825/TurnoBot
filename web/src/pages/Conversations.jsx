import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

function parseUtc(sqlite) {
  // SQLite datetime('now') => 'YYYY-MM-DD HH:MM:SS' en UTC
  return new Date(sqlite.replace(' ', 'T') + 'Z');
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - parseUtc(iso).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

export default function Conversations() {
  const [conversations, setConversations] = useState(null);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const bodyRef = useRef(null);

  const loadList = () =>
    api('/conversations')
      .then((d) => {
        setConversations(d.conversations);
        return d.conversations;
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadList().then((list) => {
      if (list?.length) setSelected(list[0].customer_id);
    });
  }, []);

  const toggleBot = async () => {
    if (!thread) return;
    const paused = !thread.customer.bot_paused;
    await api(`/conversations/${thread.customer.id}/bot`, { method: 'POST', body: { paused } });
    setThread({ ...thread, customer: { ...thread.customer, bot_paused: paused ? 1 : 0 } });
    loadList();
  };

  useEffect(() => {
    if (!selected) return;
    setThread(null);
    api(`/conversations/${selected}/messages`)
      .then(setThread)
      .catch((e) => setError(e.message));
  }, [selected]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread]);

  if (error) return <div className="error-box">{error}</div>;
  if (!conversations) return <div className="spinner" />;

  return (
    <div>
      <div className="page-head rise">
        <div>
          <div className="crumb">inbox</div>
          <h1>Conversaciones</h1>
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="card empty rise rise-1">
          <div className="empty-icon">◳</div>
          Todavía no hay conversaciones. Cuando tus clientes le escriban al bot (o uses el simulador), van a
          aparecer acá.
        </div>
      ) : (
        <div className="inbox rise rise-1">
          <div className="inbox-list">
            {conversations.map((c) => (
              <div
                key={c.customer_id}
                className={`conv-item${selected === c.customer_id ? ' active' : ''}`}
                onClick={() => setSelected(c.customer_id)}
              >
                <div className="conv-name">
                  <span>
                    {c.name || c.phone}
                    {c.bot_paused ? ' 🙋' : ''}
                  </span>
                  <span className="mono" style={{ color: 'var(--ink-faint)', fontSize: 11, fontWeight: 400 }}>
                    {timeAgo(c.last_message_at)}
                  </span>
                </div>
                <div className="conv-last">{c.last_message}</div>
              </div>
            ))}
          </div>
          <div className="thread">
            {!thread ? (
              <div className="spinner" />
            ) : (
              <>
                <div className="thread-head">
                  <div>
                    <strong>{thread.customer.name || 'Cliente'}</strong>
                    <span className="mono" style={{ color: 'var(--ink-faint)', fontSize: 12, marginLeft: 10 }}>
                      {thread.customer.phone}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`tag ${thread.customer.bot_paused ? 'tag-amber' : 'tag-mint'}`}>
                      {thread.customer.bot_paused ? '🙋 atención humana' : '🤖 bot activo'}
                    </span>
                    <button className={`btn btn-sm ${thread.customer.bot_paused ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleBot}>
                      {thread.customer.bot_paused ? 'Reactivar bot' : 'Pausar bot'}
                    </button>
                  </div>
                </div>
                {thread.customer.bot_paused ? (
                  <div
                    style={{
                      padding: '8px 20px',
                      fontSize: 12.5,
                      color: 'var(--amber)',
                      background: 'var(--amber-soft)',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    El bot no responde en esta conversación: el cliente pidió hablar con una persona. Respondele
                    desde tu WhatsApp y reactivá el bot cuando termines.
                  </div>
                ) : null}
                <div className="thread-body" ref={bodyRef}>
                  {thread.messages.map((m) => (
                    <div key={m.id} className={`bubble ${m.direction}`}>
                      {m.body}
                      <span className="bubble-meta">
                        {m.direction === 'out' ? '🤖 bot · ' : ''}
                        {m.created_at
                          ? parseUtc(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
