import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api.js';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // semana arranca lunes
  date.setDate(date.getDate() + diff);
  return date;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function Agenda() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [modal, setModal] = useState(null); // {mode:'new', date} | {mode:'view', appt}
  const [error, setError] = useState('');

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = ymd(days[0]);
  const to = ymd(days[6]);
  const todayYmd = ymd(new Date());

  const load = useCallback(() => {
    api(`/appointments?from=${from}&to=${to}`)
      .then((d) => setAppointments(d.appointments))
      .catch((e) => setError(e.message));
  }, [from, to]);

  useEffect(load, [load]);
  useEffect(() => {
    api('/services').then((d) => setServices(d.services)).catch(() => {});
  }, []);

  const monthLabel = days[0].toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="page-head rise">
        <div>
          <div className="crumb">agenda semanal</div>
          <h1>Agenda</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'new', date: todayYmd })}>
          + Nuevo turno
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="agenda-toolbar rise rise-1">
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Anterior</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoy</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>Siguiente →</button>
        <span className="week-label">{monthLabel}</span>
      </div>

      <div className="agenda-grid rise rise-2">
        {days.map((d) => {
          const key = ymd(d);
          const dayAppts = appointments.filter((a) => a.date === key);
          return (
            <div key={key} className={`day-col${key === todayYmd ? ' today' : ''}`}>
              <div className="day-head">
                <div className="day-name">{DAY_NAMES[d.getDay()].slice(0, 3)}</div>
                <div className="day-num">{d.getDate()}</div>
              </div>
              {dayAppts.map((a) => (
                <div
                  key={a.id}
                  className={`appt ${a.status === 'cancelled' ? 'cancelled' : ''} ${a.status === 'completed' ? 'completed' : ''}`}
                  onClick={() => setModal({ mode: 'view', appt: a })}
                >
                  <div className="appt-time">
                    {a.time}
                    {a.confirmed_by_customer ? ' ✓' : ''}
                  </div>
                  <div className="appt-name">{a.display_name || a.customer_name || 'Cliente'}</div>
                  <div className="appt-service">{a.service_name || ''}{a.created_via === 'bot' ? ' · 🤖' : ''}</div>
                </div>
              ))}
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', marginTop: 6, opacity: 0.6 }}
                onClick={() => setModal({ mode: 'new', date: key })}
              >
                +
              </button>
            </div>
          );
        })}
      </div>

      {modal?.mode === 'new' && (
        <NewApptModal
          date={modal.date}
          services={services}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal?.mode === 'view' && (
        <ViewApptModal
          appt={modal.appt}
          onClose={() => setModal(null)}
          onChanged={() => {
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewApptModal({ date, services, onClose, onSaved }) {
  const [form, setForm] = useState({
    date,
    time: '10:00',
    service_id: services[0]?.id || '',
    customer_name: '',
    notes: '',
  });
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const duration = services.find((s) => s.id === Number(form.service_id))?.duration_min || 30;

  useEffect(() => {
    api(`/slots?date=${form.date}&duration=${duration}`)
      .then((d) => setSlots(d.slots))
      .catch(() => setSlots([]));
  }, [form.date, duration]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/appointments', {
        method: 'POST',
        body: { ...form, service_id: form.service_id || null },
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nuevo turno</h2>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label className="label">Cliente</label>
            <input
              className="input"
              value={form.customer_name}
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              placeholder="Nombre del cliente"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label className="label">Servicio</label>
            <select
              className="select"
              value={form.service_id}
              onChange={(e) => setForm({ ...form, service_id: e.target.value })}
            >
              <option value="">— Sin servicio —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.duration_min} min)</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div>
              <label className="label">Hora</label>
              <input className="input" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required />
            </div>
          </div>
          {slots.length > 0 && (
            <div className="field">
              <label className="label">Horarios libres</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {slots.slice(0, 16).map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`btn btn-sm ${form.time === s ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setForm({ ...form, time: s })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <label className="label">Notas</label>
            <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar turno'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ViewApptModal({ appt, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await api(`/appointments/${appt.id}`, { method: 'PATCH', body: { status } });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const [y, m, d] = appt.date.split('-');

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{appt.display_name || appt.customer_name || 'Cliente'}</h2>
        <div className="list-row">
          <span style={{ color: 'var(--ink-faint)' }}>Fecha</span>
          <span className="mono">{d}/{m}/{y} · {appt.time} hs</span>
        </div>
        <div className="list-row">
          <span style={{ color: 'var(--ink-faint)' }}>Servicio</span>
          <span>{appt.service_name || '—'}</span>
        </div>
        <div className="list-row">
          <span style={{ color: 'var(--ink-faint)' }}>Origen</span>
          <span>{appt.created_via === 'bot' ? '🤖 Reservado por el bot' : '✍️ Carga manual'}</span>
        </div>
        <div className="list-row">
          <span style={{ color: 'var(--ink-faint)' }}>Estado</span>
          <span className={`tag ${appt.status === 'confirmed' ? 'tag-mint' : appt.status === 'cancelled' ? 'tag-red' : 'tag-dim'}`}>
            {appt.status === 'confirmed' ? 'confirmado' : appt.status === 'cancelled' ? 'cancelado' : 'completado'}
          </span>
        </div>
        {appt.status === 'confirmed' && (
          <div className="list-row">
            <span style={{ color: 'var(--ink-faint)' }}>Asistencia</span>
            <span className={`tag ${appt.confirmed_by_customer ? 'tag-mint' : 'tag-dim'}`}>
              {appt.confirmed_by_customer ? '✓ confirmada por el cliente' : 'sin confirmar'}
            </span>
          </div>
        )}
        {appt.customer_phone && (
          <div className="list-row">
            <span style={{ color: 'var(--ink-faint)' }}>Teléfono</span>
            <span className="mono">{appt.customer_phone}</span>
          </div>
        )}
        {appt.notes && (
          <div className="list-row">
            <span style={{ color: 'var(--ink-faint)' }}>Notas</span>
            <span>{appt.notes}</span>
          </div>
        )}
        <div className="modal-actions">
          {appt.status === 'confirmed' && (
            <>
              <button className="btn btn-danger" disabled={busy} onClick={() => setStatus('cancelled')}>Cancelar turno</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => setStatus('completed')}>Marcar completado</button>
            </>
          )}
          {appt.status !== 'confirmed' && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => setStatus('confirmed')}>Reactivar</button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
