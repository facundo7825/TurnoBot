import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function Simulator() {
  const { tenant } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typing]);

  const send = async (text) => {
    text = (text || '').trim();
    if (!text || typing) return;
    setInput('');
    setMessages((m) => [...m, { dir: 'in', text }]);
    setTyping(true);
    try {
      const data = await api('/simulator/message', { method: 'POST', body: { text } });
      for (const reply of data.replies) {
        await new Promise((r) => setTimeout(r, 350));
        setMessages((m) => [...m, { dir: 'out', text: reply.text, options: reply.options }]);
      }
      if (!data.replies.length) {
        setMessages((m) => [...m, { dir: 'out', text: '(el bot está pausado — activalo en "Mi bot")' }]);
      }
    } catch (err) {
      setMessages((m) => [...m, { dir: 'out', text: `⚠️ Error: ${err.message}` }]);
    } finally {
      setTyping(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    send(input);
  };

  const reset = async () => {
    await api('/simulator/reset', { method: 'POST', body: {} });
    setMessages([]);
  };

  return (
    <div>
      <div className="page-head rise">
        <div>
          <div className="crumb">probá tu bot</div>
          <h1>Simulador</h1>
        </div>
        <button className="btn btn-ghost" onClick={reset}>↺ Reiniciar conversación</button>
      </div>

      <p className="rise rise-1" style={{ color: 'var(--ink-dim)', fontSize: 14, maxWidth: 560, marginTop: -10 }}>
        Esto es exactamente lo que va a vivir un cliente que le escriba a tu WhatsApp. Las reservas que hagas
        acá se guardan en tu agenda (podés cancelarlas después). Empezá con un <strong>hola</strong>.
      </p>

      <div className="sim-wrap rise rise-2">
        <div className="phone">
          <div className="phone-head">
            <div className="phone-avatar">🤖</div>
            <div>
              <div className="phone-name">{tenant?.business_name || 'Tu negocio'}</div>
              <div className="phone-status">bot en línea</div>
            </div>
          </div>
          <div className="phone-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="empty" style={{ margin: 'auto' }}>
                <div className="empty-icon">💬</div>
                <div style={{ marginBottom: 14 }}>Escribí "hola" para empezar</div>
                <button className="btn btn-primary btn-sm" onClick={() => send('hola')}>
                  👋 Decir hola
                </button>
              </div>
            )}
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              return (
                <React.Fragment key={i}>
                  <div className={`bubble ${m.dir === 'in' ? 'out' : 'in'}`}>{m.text}</div>
                  {m.dir === 'out' && m.options?.length > 0 && isLast && !typing && (
                    <div className="chips">
                      {m.options.map((o) => (
                        <button key={o.id} className="chip" onClick={() => send(o.id)} title={o.description || ''}>
                          {o.title}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {typing && <div className="typing">el bot está escribiendo…</div>}
          </div>
          <form className="phone-input" onSubmit={submit}>
            <input
              className="input"
              placeholder="Escribí un mensaje…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary" disabled={typing || !input.trim()}>➤</button>
          </form>
        </div>
      </div>
    </div>
  );
}
