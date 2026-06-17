import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const NAV = [
  { to: '/app', icon: '◈', label: 'Inicio', end: true },
  { to: '/app/agenda', icon: '▦', label: 'Agenda' },
  { to: '/app/conversaciones', icon: '◳', label: 'Conversaciones' },
  { to: '/app/bot', icon: '⌬', label: 'Mi bot' },
  { to: '/app/simulador', icon: '▷', label: 'Simulador' },
  { to: '/app/whatsapp', icon: '◍', label: 'Conexión WhatsApp' },
];

export default function Shell() {
  const { user, tenant, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-dot" />
          TurnoBot
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <div className="sidebar-footer">
          <div className="user-name">{tenant?.business_name || user?.name}</div>
          <div className="user-email">{user?.email}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
