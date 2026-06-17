import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function BotConfig() {
  const [tab, setTab] = useState('general');

  return (
    <div>
      <div className="page-head rise">
        <div>
          <div className="crumb">configuración del bot</div>
          <h1>Mi bot</h1>
        </div>
      </div>

      <div className="tabs rise rise-1">
        {[
          ['general', 'General'],
          ['servicios', 'Servicios'],
          ['horarios', 'Horarios'],
          ['faqs', 'Preguntas frecuentes'],
          ['ia', 'Inteligencia artificial'],
          ['avisos', 'Avisos'],
        ].map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="rise rise-2">
        {tab === 'general' && <GeneralTab />}
        {tab === 'servicios' && <ServicesTab />}
        {tab === 'horarios' && <HoursTab />}
        {tab === 'faqs' && <FaqsTab />}
        {tab === 'ia' && <AiTab />}
        {tab === 'avisos' && <NotificationsTab />}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const { tenant } = useAuth();
  const { save, saving, saved, error } = useSaver();
  const [form, setForm] = useState({
    owner_phone: tenant?.owner_phone || '',
    notify_owner: !!tenant?.notify_owner,
    reminders_enabled: !!tenant?.reminders_enabled,
    daily_digest: !!tenant?.daily_digest,
    digest_hour: tenant?.digest_hour ?? 8,
  });

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>Avisos automáticos</h3>
      <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 0 }}>
        Funcionan por WhatsApp, así que requieren tener tu número conectado con Meta.
        {!tenant?.wa_connected && ' (Todavía no conectaste WhatsApp — podés dejarlos configurados igual.)'}
      </p>
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="ok-box">Avisos guardados ✓</div>}

      <div className="switch-row">
        <div>
          <div className="switch-label">Avisarme cada vez que el bot reserve un turno</div>
          <div className="switch-desc">Te llega un WhatsApp con el cliente, el día y el servicio.</div>
        </div>
        <div
          className={`switch${form.notify_owner ? ' on' : ''}`}
          onClick={() => setForm({ ...form, notify_owner: !form.notify_owner })}
        />
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label className="label">Tu número de WhatsApp (con código de país, sin +)</label>
        <input
          className="input mono"
          placeholder="Ej: 5491122334455"
          value={form.owner_phone}
          onChange={(e) => setForm({ ...form, owner_phone: e.target.value.replace(/[^\d]/g, '') })}
        />
      </div>

      <div className="switch-row">
        <div>
          <div className="switch-label">Recordatorio automático a los clientes</div>
          <div className="switch-desc">
            El día anterior al turno, el bot le manda un recordatorio por WhatsApp con botones para
            confirmar o cancelar. Si cancela, el lugar se libera solo en tu agenda.
          </div>
        </div>
        <div
          className={`switch${form.reminders_enabled ? ' on' : ''}`}
          onClick={() => setForm({ ...form, reminders_enabled: !form.reminders_enabled })}
        />
      </div>

      <div className="switch-row">
        <div>
          <div className="switch-label">Resumen de agenda cada mañana</div>
          <div className="switch-desc">
            Todos los días te llega un WhatsApp con los turnos de la jornada (y quiénes confirmaron).
          </div>
        </div>
        <div
          className={`switch${form.daily_digest ? ' on' : ''}`}
          onClick={() => setForm({ ...form, daily_digest: !form.daily_digest })}
        />
      </div>
      {form.daily_digest && (
        <div className="field" style={{ marginTop: 14, maxWidth: 220 }}>
          <label className="label">Hora del resumen</label>
          <select
            className="select"
            value={form.digest_hour}
            onChange={(e) => setForm({ ...form, digest_hour: Number(e.target.value) })}
          >
            {[6, 7, 8, 9, 10, 11].map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>
      )}

      <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={saving} onClick={() => save(form)}>
        {saving ? 'Guardando…' : 'Guardar avisos'}
      </button>
    </div>
  );
}

function useSaver() {
  const { refreshTenant } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const save = async (body) => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api('/tenant', { method: 'PUT', body });
      await refreshTenant();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return { save, saving, saved, error };
}

function GeneralTab() {
  const { tenant } = useAuth();
  const { save, saving, saved, error } = useSaver();
  const [form, setForm] = useState({
    business_name: tenant?.business_name || '',
    description: tenant?.description || '',
    address: tenant?.address || '',
    welcome_message: tenant?.welcome_message || '',
    fallback_message: tenant?.fallback_message || '',
    slot_interval_min: tenant?.slot_interval_min || 30,
    bot_enabled: !!tenant?.bot_enabled,
  });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="ok-box">Cambios guardados ✓</div>}

      <div className="switch-row" style={{ marginBottom: 14 }}>
        <div>
          <div className="switch-label">Bot activo</div>
          <div className="switch-desc">Si lo apagás, el bot deja de responder mensajes (los turnos siguen en tu agenda).</div>
        </div>
        <div
          className={`switch${form.bot_enabled ? ' on' : ''}`}
          onClick={() => setForm({ ...form, bot_enabled: !form.bot_enabled })}
        />
      </div>

      <div className="field">
        <label className="label">Nombre del negocio</label>
        <input className="input" value={form.business_name} onChange={set('business_name')} />
      </div>
      <div className="field">
        <label className="label">Descripción corta</label>
        <textarea
          className="textarea"
          placeholder="Ej: Peluquería unisex en el centro. Cortes, color y peinados."
          value={form.description}
          onChange={set('description')}
        />
      </div>
      <div className="field">
        <label className="label">Dirección</label>
        <input className="input" placeholder="Ej: Av. Siempreviva 742, Springfield" value={form.address} onChange={set('address')} />
      </div>
      <div className="field">
        <label className="label">Mensaje de bienvenida</label>
        <textarea
          className="textarea"
          placeholder="¡Hola! 👋 Soy el asistente de…  (si lo dejás vacío usamos uno automático)"
          value={form.welcome_message}
          onChange={set('welcome_message')}
        />
      </div>
      <div className="field">
        <label className="label">Mensaje cuando no entiende</label>
        <textarea
          className="textarea"
          placeholder="No entendí tu mensaje. Escribí *menu* para ver opciones…"
          value={form.fallback_message}
          onChange={set('fallback_message')}
        />
      </div>
      <div className="field" style={{ maxWidth: 220 }}>
        <label className="label">Intervalo de turnos (minutos)</label>
        <select className="select" value={form.slot_interval_min} onChange={(e) => setForm({ ...form, slot_interval_min: Number(e.target.value) })}>
          {[15, 20, 30, 45, 60, 90, 120].map((n) => (
            <option key={n} value={n}>{n} min</option>
          ))}
        </select>
      </div>
      <button className="btn btn-primary" disabled={saving} onClick={() => save(form)}>
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  );
}

function ServicesTab() {
  const [services, setServices] = useState(null);
  const [form, setForm] = useState({ name: '', duration_min: 30, price: '' });
  const [error, setError] = useState('');

  const load = () => api('/services').then((d) => setServices(d.services)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/services', {
        method: 'POST',
        body: { name: form.name, duration_min: Number(form.duration_min) || 30, price: Number(form.price) || 0 },
      });
      setForm({ name: '', duration_min: 30, price: '' });
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const toggle = async (s) => {
    await api(`/services/${s.id}`, { method: 'PUT', body: { active: !s.active } });
    load();
  };

  const remove = async (s) => {
    if (!confirm(`¿Eliminar "${s.name}"?`)) return;
    await api(`/services/${s.id}`, { method: 'DELETE' });
    load();
  };

  if (!services) return <div className="spinner" />;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 16, marginBottom: 14 }}>Agregar servicio</h3>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="label">Nombre</label>
            <input className="input" placeholder="Ej: Corte de pelo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">Duración (min)</label>
            <input className="input" type="number" min="5" step="5" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} />
          </div>
          <div>
            <label className="label">Precio ($)</label>
            <input className="input" type="number" min="0" placeholder="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <button className="btn btn-primary">Agregar</button>
        </form>
      </div>

      <div className="card">
        {services.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💈</div>
            Agregá los servicios que tus clientes pueden reservar por WhatsApp.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Duración</th>
                <th>Precio</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.45 }}>
                  <td><strong>{s.name}</strong></td>
                  <td className="mono">{s.duration_min} min</td>
                  <td className="mono">{s.price ? `$${s.price}` : '—'}</td>
                  <td>
                    <span className={`tag ${s.active ? 'tag-mint' : 'tag-dim'}`} style={{ cursor: 'pointer' }} onClick={() => toggle(s)}>
                      {s.active ? 'visible' : 'oculto'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(s)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function HoursTab() {
  const [hours, setHours] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/working-hours').then((d) => setHours(d.hours)).catch((e) => setError(e.message));
  }, []);

  if (!hours) return <div className="spinner" />;

  const byDay = Object.fromEntries(hours.map((h) => [h.weekday, h]));

  const update = (weekday, patch) => {
    setHours(hours.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
  };

  const save = async () => {
    setError('');
    try {
      await api('/working-hours', { method: 'PUT', body: { hours } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>Horarios de atención</h3>
      <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 0 }}>
        El bot solo ofrece turnos dentro de estos horarios.
      </p>
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="ok-box">Horarios guardados ✓</div>}
      {DAY_ORDER.map((d) => {
        const h = byDay[d] || { weekday: d, open_time: '09:00', close_time: '18:00', enabled: 0 };
        return (
          <div key={d} className={`hours-row${h.enabled ? '' : ' off'}`}>
            <span className="day">{DAY_NAMES[d]}</span>
            <input
              className="input"
              type="time"
              disabled={!h.enabled}
              value={h.open_time}
              onChange={(e) => update(d, { open_time: e.target.value })}
            />
            <input
              className="input"
              type="time"
              disabled={!h.enabled}
              value={h.close_time}
              onChange={(e) => update(d, { close_time: e.target.value })}
            />
            <div className={`switch${h.enabled ? ' on' : ''}`} onClick={() => update(d, { enabled: h.enabled ? 0 : 1 })} />
          </div>
        );
      })}
      <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={save}>
        Guardar horarios
      </button>
    </div>
  );
}

function FaqsTab() {
  const [faqs, setFaqs] = useState(null);
  const [form, setForm] = useState({ question: '', keywords: '', answer: '' });
  const [error, setError] = useState('');

  const load = () => api('/faqs').then((d) => setFaqs(d.faqs)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/faqs', { method: 'POST', body: form });
      setForm({ question: '', keywords: '', answer: '' });
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const remove = async (f) => {
    if (!confirm('¿Eliminar esta pregunta?')) return;
    await api(`/faqs/${f.id}`, { method: 'DELETE' });
    load();
  };

  if (!faqs) return <div className="spinner" />;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 16, marginBottom: 6 }}>Agregar pregunta frecuente</h3>
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 0 }}>
          Cuando el mensaje del cliente contenga alguna de las palabras clave, el bot responde automáticamente.
        </p>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={add}>
          <div className="field">
            <label className="label">Pregunta (para tu referencia)</label>
            <input className="input" placeholder="¿Aceptan tarjeta?" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} required />
          </div>
          <div className="field">
            <label className="label">Palabras clave (separadas por coma)</label>
            <input className="input" placeholder="tarjeta, mercado pago, debito, credito" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} required />
          </div>
          <div className="field">
            <label className="label">Respuesta del bot</label>
            <textarea className="textarea" placeholder="¡Sí! Aceptamos todas las tarjetas y Mercado Pago. 💳" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} required />
          </div>
          <button className="btn btn-primary">Agregar</button>
        </form>
      </div>

      <div className="card">
        {faqs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💬</div>
            Cargá respuestas para las preguntas típicas de tus clientes.
          </div>
        ) : (
          faqs.map((f) => (
            <div className="list-row" key={f.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <strong>{f.question}</strong>
                <div style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 3 }}>{f.answer}</div>
                <div className="mono" style={{ color: 'var(--ink-faint)', fontSize: 11, marginTop: 5 }}>
                  claves: {f.keywords}
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => remove(f)}>Eliminar</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AiTab() {
  const { tenant } = useAuth();
  const { save, saving, saved, error } = useSaver();
  const [form, setForm] = useState({
    ai_enabled: !!tenant?.ai_enabled,
    anthropic_api_key: '',
    ai_instructions: tenant?.ai_instructions || '',
  });

  const submit = () => {
    const body = { ai_enabled: form.ai_enabled, ai_instructions: form.ai_instructions };
    if (form.anthropic_api_key.trim()) body.anthropic_api_key = form.anthropic_api_key.trim();
    save(body);
  };

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>Respuestas con IA (Claude)</h3>
      <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 0 }}>
        Con la IA activada, cuando un cliente pregunte algo fuera del menú o de tus preguntas frecuentes, el
        bot responde usando Claude con el contexto de tu negocio (servicios, horarios, FAQs). Necesitás una
        API key de <a href="https://platform.claude.com" target="_blank" rel="noreferrer">platform.claude.com</a>.
      </p>
      {error && <div className="error-box">{error}</div>}
      {saved && <div className="ok-box">Configuración guardada ✓</div>}

      <div className="switch-row">
        <div>
          <div className="switch-label">IA activada</div>
          <div className="switch-desc">
            {tenant?.has_anthropic_key ? 'Hay una API key guardada.' : 'Todavía no guardaste una API key.'}
          </div>
        </div>
        <div className={`switch${form.ai_enabled ? ' on' : ''}`} onClick={() => setForm({ ...form, ai_enabled: !form.ai_enabled })} />
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <label className="label">API key de Anthropic</label>
        <input
          className="input mono"
          type="password"
          placeholder={tenant?.has_anthropic_key ? '••••••••  (dejá vacío para no cambiarla)' : 'sk-ant-…'}
          value={form.anthropic_api_key}
          onChange={(e) => setForm({ ...form, anthropic_api_key: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="label">Instrucciones extra para la IA (opcional)</label>
        <textarea
          className="textarea"
          placeholder="Ej: Tratá a los clientes de vos. Si preguntan por promociones, mencioná el 10% de descuento los martes."
          value={form.ai_instructions}
          onChange={(e) => setForm({ ...form, ai_instructions: e.target.value })}
        />
      </div>
      <button className="btn btn-primary" disabled={saving} onClick={submit}>
        {saving ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </div>
  );
}
