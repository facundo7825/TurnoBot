import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const TYPES = [
  ['peluqueria', 'Peluquería / Barbería'],
  ['estetica', 'Estética / Spa'],
  ['consultorio', 'Consultorio / Salud'],
  ['hotel', 'Hotel / Hospedaje'],
  ['gimnasio', 'Gimnasio / Entrenamiento'],
  ['gastronomia', 'Gastronomía'],
  ['general', 'Otro'],
];

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', businessName: '', businessType: 'peluqueria' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/auth/register', { method: 'POST', body: form });
      await login(data);
      navigate('/app/bot');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card rise">
        <Link to="/" className="logo" style={{ textDecoration: 'none' }}>
          <span className="logo-dot" />
          TurnoBot
        </Link>
        <h1>Creá tu bot</h1>
        <p className="sub">En un par de minutos tu negocio responde solo.</p>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label className="label">Tu nombre</label>
            <input className="input" value={form.name} onChange={set('name')} required autoFocus />
          </div>
          <div className="field">
            <label className="label">Nombre del negocio</label>
            <input className="input" placeholder="Ej: Peluquería Lola" value={form.businessName} onChange={set('businessName')} required />
          </div>
          <div className="field">
            <label className="label">Rubro</label>
            <select className="select" value={form.businessType} onChange={set('businessType')}>
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div className="field">
            <label className="label">Contraseña</label>
            <input className="input" type="password" minLength={6} value={form.password} onChange={set('password')} required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Creando…' : 'Crear mi bot →'}
          </button>
        </form>
        <p className="sub" style={{ marginTop: 20, marginBottom: 0, textAlign: 'center' }}>
          ¿Ya tenés cuenta? <Link to="/login">Ingresá</Link>
        </p>
      </div>
    </div>
  );
}
