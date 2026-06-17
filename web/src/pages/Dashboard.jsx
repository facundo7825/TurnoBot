import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function humanDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()}/${m}`;
}

export default function Dashboard() {
  const { tenant } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!stats) return <div className="spinner" />;

  const steps = [
    {
      done: stats.servicesCount > 0,
      title: 'Cargá tus servicios',
      desc: 'Lo que tus clientes pueden reservar (nombre, duración y precio).',
      to: '/app/bot',
      cta: 'Cargar servicios',
    },
    {
      done: stats.simulatorMessages > 0,
      title: 'Probá tu bot en el simulador',
      desc: 'Chateá como si fueras un cliente y reservá un turno de prueba.',
      to: '/app/simulador',
      cta: 'Abrir simulador',
    },
    {
      done: !!tenant?.wa_connected,
      title: 'Conectá tu WhatsApp',
      desc: 'Vinculá tu número con la API oficial de Meta para salir en vivo.',
      to: '/app/whatsapp',
      cta: 'Conectar',
    },
  ];
  const pendingSteps = steps.filter((s) => !s.done).length;

  return (
    <div>
      <div className="page-head rise">
        <div>
          <div className="crumb">panel de control</div>
          <h1>{tenant?.business_name || 'Tu negocio'}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className={`tag ${tenant?.bot_enabled ? 'tag-mint' : 'tag-dim'}`}>
            {tenant?.bot_enabled ? '● bot activo' : '○ bot pausado'}
          </span>
          <span className={`tag ${tenant?.wa_connected ? 'tag-mint' : 'tag-amber'}`}>
            {tenant?.wa_connected ? '● whatsapp conectado' : '○ whatsapp sin conectar'}
          </span>
        </div>
      </div>

      {pendingSteps > 0 && (
        <div className="card rise rise-1" style={{ marginBottom: 24, borderColor: 'rgba(52,226,122,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h3 style={{ fontSize: 16 }}>⚡ Poné tu bot en marcha</h3>
            <span className="tag tag-mint mono">{steps.length - pendingSteps}/{steps.length} listos</span>
          </div>
          {steps.map((s, i) => (
            <div className="list-row" key={i} style={{ opacity: s.done ? 0.55 : 1 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span
                  className="mono"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 13,
                    flexShrink: 0,
                    background: s.done ? 'var(--mint-soft)' : 'var(--bg-3)',
                    color: s.done ? 'var(--mint)' : 'var(--ink-faint)',
                    border: s.done ? '1px solid rgba(52,226,122,0.4)' : '1px solid var(--line-strong)',
                  }}
                >
                  {s.done ? '✓' : i + 1}
                </span>
                <div>
                  <strong style={{ textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</strong>
                  <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{s.desc}</div>
                </div>
              </div>
              {!s.done && (
                <Link to={s.to} className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
                  {s.cta} →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="stat-grid rise rise-1">
        <div className="stat">
          <div className="stat-label">Turnos hoy</div>
          <div className="stat-value">{stats.appointmentsToday}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Turnos esta semana</div>
          <div className="stat-value">{stats.appointmentsWeek}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Clientes</div>
          <div className="stat-value">{stats.customers}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Mensajes</div>
          <div className="stat-value">{stats.messages}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Reservas del bot</div>
          <div className="stat-value">
            {stats.botBookings} <small>auto</small>
          </div>
        </div>
      </div>

      <div className="two-col rise rise-2">
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Próximos turnos</h3>
          {stats.nextAppointments.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">▦</div>
              Todavía no hay turnos. Probá reservar uno desde el simulador.
            </div>
          ) : (
            stats.nextAppointments.map((a) => (
              <div className="list-row" key={a.id}>
                <div>
                  <strong>{a.display_name || 'Cliente'}</strong>
                  <span style={{ color: 'var(--ink-faint)', marginLeft: 8, fontSize: 13 }}>
                    {a.service_name || 'Turno'}
                  </span>
                </div>
                <span className="mono" style={{ color: 'var(--mint)', fontSize: 13 }}>
                  {humanDate(a.date)} · {a.time}
                </span>
              </div>
            ))
          )}
          <Link to="/app/agenda" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }}>
            Ver agenda completa →
          </Link>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Accesos rápidos</h3>
          <div className="list-row">
            <div>
              <strong>Probar el bot</strong>
              <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Chateá con tu bot como si fueras un cliente</div>
            </div>
            <Link to="/app/simulador" className="btn btn-ghost btn-sm">Abrir</Link>
          </div>
          <div className="list-row">
            <div>
              <strong>Servicios y horarios</strong>
              <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Lo que tus clientes pueden reservar</div>
            </div>
            <Link to="/app/bot" className="btn btn-ghost btn-sm">Configurar</Link>
          </div>
          <div className="list-row">
            <div>
              <strong>Conversaciones</strong>
              <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Mirá qué responde el bot a tus clientes</div>
            </div>
            <Link to="/app/conversaciones" className="btn btn-ghost btn-sm">Ver</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
