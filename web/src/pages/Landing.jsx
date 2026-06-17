import React from 'react';
import { Link } from 'react-router-dom';

const DEMO_CHAT = [
  { dir: 'in', text: 'Hola! Quiero un turno para corte' },
  { dir: 'out', text: '¡Hola! 👋 ¿Qué día te queda bien?\n1. Martes 10 jun\n2. Miércoles 11 jun' },
  { dir: 'in', text: '2' },
  { dir: 'out', text: 'Horarios libres el Miércoles 11:\n1. 10:00 hs\n2. 15:30 hs' },
  { dir: 'in', text: '1' },
  { dir: 'out', text: '✅ ¡Turno confirmado!\n📅 Miércoles 11 jun, 10:00 hs' },
];

const FEATURES = [
  {
    icon: '⌬',
    title: 'Responde solo, 24/7',
    desc: 'Tu bot atiende WhatsApp mientras trabajás o dormís: contesta preguntas, informa horarios y guía a tus clientes.',
  },
  {
    icon: '▦',
    title: 'Agenda automática',
    desc: 'Los clientes reservan, consultan y cancelan turnos desde el chat. Todo queda en tu agenda al instante, sin superposiciones.',
  },
  {
    icon: '◍',
    title: 'Tu número, tu marca',
    desc: 'Conectás tu número con la API oficial de WhatsApp (Meta). Configurás servicios, horarios y mensajes a tu gusto.',
  },
  {
    icon: '✦',
    title: 'IA opcional',
    desc: 'Activá respuestas con inteligencia artificial para que el bot conteste preguntas libres con el contexto de tu negocio.',
  },
];

export default function Landing() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="logo">
          <span className="logo-dot" />
          TurnoBot
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/login" className="btn btn-ghost">Ingresar</Link>
          <Link to="/registro" className="btn btn-primary">Crear mi bot</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-kicker rise">whatsapp + agenda + bot</div>
        <h1 className="rise rise-1">
          Tu negocio atiende solo.<br />
          <em>Vos, a lo tuyo.</em>
        </h1>
        <p className="rise rise-2">
          Creá en minutos un bot de WhatsApp que responde a tus clientes y gestiona los turnos de tu
          peluquería, consultorio, estudio u hotel. Sin código, sin complicaciones.
        </p>
        <div className="hero-actions rise rise-3">
          <Link to="/registro" className="btn btn-primary">Empezar gratis →</Link>
          <Link to="/login" className="btn btn-ghost">Ya tengo cuenta</Link>
        </div>

        <div className="hero-chat rise rise-4">
          <div className="phone">
            <div className="phone-head">
              <div className="phone-avatar">🤖</div>
              <div>
                <div className="phone-name">Peluquería Lola</div>
                <div className="phone-status">bot en línea</div>
              </div>
            </div>
            <div className="phone-body" style={{ height: 'auto', maxHeight: 340 }}>
              {DEMO_CHAT.map((m, i) => (
                <div key={i} className={`bubble ${m.dir}`} style={{ animationDelay: `${0.4 + i * 0.35}s` }}>
                  {m.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f, i) => (
          <div key={i} className={`card feature rise rise-${(i % 4) + 1}`}>
            <h3>
              <span style={{ color: 'var(--mint)' }}>{f.icon}</span>
              {f.title}
            </h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
