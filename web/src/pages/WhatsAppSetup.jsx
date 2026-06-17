import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function WhatsAppSetup() {
  const { tenant, refreshTenant } = useAuth();
  const [cfg, setCfg] = useState(null); // { enabled }
  const [state, setState] = useState(null); // { state, connected, phone, profileName }
  const [qr, setQr] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  useEffect(() => {
    api('/whatsapp/config').then(setCfg).catch(() => setCfg({ enabled: false }));
    refreshState();
    return () => clearInterval(pollRef.current);
  }, []);

  const refreshState = async () => {
    try {
      const s = await api('/whatsapp/state');
      setState(s);
      return s;
    } catch {
      return null;
    }
  };

  // Mientras esperamos el escaneo: refresca el QR y consulta el estado
  const startPolling = () => {
    clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks++;
      const s = await refreshState();
      if (s?.connected) {
        clearInterval(pollRef.current);
        setQr(null);
        setConnecting(false);
        await refreshTenant();
        return;
      }
      // Refrescar el QR cada ~6s por si expiró, hasta ~2 min
      if (ticks % 2 === 0 && ticks < 40) {
        const r = await api('/whatsapp/qr').catch(() => null);
        if (r?.qr) setQr(r.qr);
      }
      if (ticks >= 60) {
        clearInterval(pollRef.current);
        setConnecting(false);
        setError('Se agotó el tiempo de espera. Tocá "Conectar" para generar un QR nuevo.');
      }
    }, 3000);
  };

  const connect = async () => {
    setError('');
    setConnecting(true);
    setQr(null);
    try {
      const r = await api('/whatsapp/connect', { method: 'POST' });
      if (r.qr) setQr(r.qr);
      // Si no vino el QR al instante, lo busca el polling
      if (!r.qr) {
        for (let i = 0; i < 6 && !qr; i++) {
          await new Promise((res) => setTimeout(res, 1500));
          const q = await api('/whatsapp/qr').catch(() => null);
          if (q?.qr) {
            setQr(q.qr);
            break;
          }
        }
      }
      startPolling();
    } catch (e) {
      setError(e.message);
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('¿Seguro que querés desconectar tu WhatsApp? El bot dejará de responder hasta que vuelvas a conectar.')) return;
    clearInterval(pollRef.current);
    await api('/whatsapp/disconnect', { method: 'POST' });
    setQr(null);
    setState({ state: 'close', connected: false });
    await refreshTenant();
  };

  if (!cfg) return <div className="spinner" />;

  return (
    <div>
      <div className="page-head rise">
        <div>
          <div className="crumb">conectá tu whatsapp</div>
          <h1>Conexión WhatsApp</h1>
        </div>
        <span className={`tag ${state?.connected ? 'tag-mint' : 'tag-amber'}`}>
          {state?.connected ? `● conectado ${state.phone || ''}` : '○ sin conectar'}
        </span>
      </div>

      {error && <div className="error-box rise">{error}</div>}

      {!cfg.enabled ? (
        <div className="card rise rise-1" style={{ maxWidth: 640, borderColor: 'rgba(255,181,71,0.35)' }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>🛠 La conexión de WhatsApp no está habilitada todavía</h3>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, margin: 0 }}>
            El administrador de la plataforma tiene que configurar el servidor de Evolution API
            (variables <code>EVOLUTION_API_URL</code> y <code>EVOLUTION_API_KEY</code>). Mientras tanto, podés
            probar tu bot en el <strong>Simulador</strong>, que funciona exactamente igual.
          </p>
        </div>
      ) : state?.connected ? (
        <div className="card rise rise-1" style={{ maxWidth: 640, borderColor: 'rgba(52,226,122,0.35)' }}>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>✅ Tu WhatsApp está conectado</h3>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, margin: '0 0 6px' }}>
            Número: <strong className="mono">{state.phone || '—'}</strong>
            {state.profileName ? ` (${state.profileName})` : ''}
          </p>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, margin: 0 }}>
            El bot responde solo los mensajes que lleguen a ese WhatsApp. Mirá todo en{' '}
            <strong>Conversaciones</strong> y los turnos en la <strong>Agenda</strong>.
          </p>
          <button className="btn btn-danger" style={{ marginTop: 16 }} onClick={disconnect}>
            Desconectar WhatsApp
          </button>
        </div>
      ) : (
        <div className="two-col rise rise-1">
          <div className="card">
            <h3 style={{ fontSize: 20, marginBottom: 8 }}>Conectá tu WhatsApp en 1 minuto</h3>
            <p style={{ color: 'var(--ink-dim)', fontSize: 14, marginTop: 0 }}>
              Vas a vincular tu WhatsApp escaneando un código QR, igual que cuando usás WhatsApp Web en la
              compu. No perdés tu WhatsApp: lo seguís usando normal en el celular.
            </p>
            <ol style={{ color: 'var(--ink-dim)', fontSize: 14, paddingLeft: 18, lineHeight: 1.9 }}>
              <li>Tocá <strong>Generar código QR</strong>.</li>
              <li>En tu celular, abrí <strong>WhatsApp → Ajustes → Dispositivos vinculados</strong>.</li>
              <li>Tocá <strong>Vincular un dispositivo</strong> y escaneá el código de la derecha.</li>
              <li>¡Listo! En unos segundos queda conectado y el bot empieza a responder.</li>
            </ol>
            {!qr && !connecting && (
              <button className="btn btn-primary" style={{ width: '100%', padding: 13 }} onClick={connect}>
                📷 Generar código QR
              </button>
            )}
            {connecting && !qr && (
              <div style={{ textAlign: 'center' }}>
                <div className="spinner" />
                <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Generando el código…</p>
              </div>
            )}
          </div>

          <div className="card" style={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
            {qr ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#fff', padding: 14, borderRadius: 12, display: 'inline-block' }}>
                  <img src={qr} alt="Código QR de WhatsApp" style={{ width: 240, height: 240, display: 'block' }} />
                </div>
                <p style={{ color: 'var(--mint)', fontSize: 13, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span className="spinner" style={{ width: 14, height: 14, margin: 0 }} />
                  Esperando que escanees el código…
                </p>
                <p style={{ color: 'var(--ink-faint)', fontSize: 12 }}>
                  El código se renueva solo. Si expira, generá uno nuevo.
                </p>
              </div>
            ) : (
              <div className="empty" style={{ margin: 0 }}>
                <div className="empty-icon">📱</div>
                Acá va a aparecer el código QR
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
