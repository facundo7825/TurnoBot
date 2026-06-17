import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function loadFbSdk(appId) {
  return new Promise((resolve) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v21.0' });
      resolve(window.FB);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/es_LA/sdk.js';
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    document.body.appendChild(s);
  });
}

function CopyRow({ value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="copy-row">
      <code>{value}</code>
      <button className="btn btn-ghost btn-sm" type="button" onClick={copy}>
        {copied ? '✓' : 'Copiar'}
      </button>
    </div>
  );
}

export default function WhatsAppSetup() {
  const { tenant, refreshTenant } = useAuth();
  const [cfg, setCfg] = useState(null); // {enabled, appId, configId}
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const sessionInfo = useRef({});

  useEffect(() => {
    api('/meta-config').then(setCfg).catch(() => setCfg({ enabled: false }));
  }, []);

  // Facebook manda phone_number_id y waba_id por postMessage durante el signup
  useEffect(() => {
    const listener = (event) => {
      if (typeof event.origin !== 'string' || !event.origin.endsWith('facebook.com')) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH') {
          sessionInfo.current = {
            phone_number_id: data.data?.phone_number_id,
            waba_id: data.data?.waba_id,
          };
        }
      } catch {
        /* mensajes que no son JSON */
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const connect = async () => {
    setError('');
    setOk('');
    setBusy(true);
    try {
      const FB = await loadFbSdk(cfg.appId);
      FB.login(
        async (response) => {
          const code = response?.authResponse?.code;
          if (!code) {
            setError('La conexión con Facebook fue cancelada. Probá de nuevo cuando quieras.');
            setBusy(false);
            return;
          }
          // Esperar (hasta 6s) los datos del número que manda el popup
          for (let i = 0; i < 12 && !sessionInfo.current.phone_number_id; i++) {
            await new Promise((r) => setTimeout(r, 500));
          }
          const { phone_number_id, waba_id } = sessionInfo.current;
          if (!phone_number_id || !waba_id) {
            setError('Facebook no devolvió los datos del número. Cerrá el popup y probá de nuevo.');
            setBusy(false);
            return;
          }
          try {
            const result = await api('/whatsapp/embedded-signup', {
              method: 'POST',
              body: { code, phone_number_id, waba_id },
            });
            await refreshTenant();
            setOk(`¡Listo! Tu número ${result.displayPhone || ''} quedó conectado. El bot ya responde solo. 🎉`);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        },
        {
          config_id: cfg.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
        }
      );
    } catch (e) {
      setError(`No se pudo cargar Facebook: ${e.message}`);
      setBusy(false);
    }
  };

  if (!cfg) return <div className="spinner" />;

  return (
    <div>
      <div className="page-head rise">
        <div>
          <div className="crumb">tu número, tu bot</div>
          <h1>Conexión WhatsApp</h1>
        </div>
        <span className={`tag ${tenant?.wa_connected ? 'tag-mint' : 'tag-amber'}`}>
          {tenant?.wa_connected ? `● conectado ${tenant?.wa_display_phone || ''}` : '○ sin conectar'}
        </span>
      </div>

      {error && <div className="error-box rise">{error}</div>}
      {ok && <div className="ok-box rise">{ok}</div>}

      {tenant?.wa_connected ? (
        <div className="card rise rise-1" style={{ maxWidth: 640, borderColor: 'rgba(52,226,122,0.35)' }}>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>✅ Tu WhatsApp está conectado</h3>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, margin: '0 0 6px' }}>
            Número: <strong className="mono">{tenant.wa_display_phone || tenant.wa_phone_number_id}</strong>
          </p>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, margin: 0 }}>
            El bot responde solo los mensajes que lleguen a ese número. Podés ver todo en{' '}
            <strong>Conversaciones</strong> y los turnos en la <strong>Agenda</strong>. Si algo no anda,
            volvé a conectar desde esta página.
          </p>
          {cfg.enabled && (
            <button className="btn btn-ghost" style={{ marginTop: 16 }} disabled={busy} onClick={connect}>
              ↺ Volver a conectar
            </button>
          )}
        </div>
      ) : cfg.enabled ? (
        <div className="card rise rise-1" style={{ maxWidth: 640 }}>
          <h3 style={{ fontSize: 20, marginBottom: 8 }}>Conectá tu número en 2 minutos</h3>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, marginTop: 0 }}>
            Apretá el botón, iniciá sesión con Facebook y seguí los pasos del asistente. Nosotros nos
            encargamos de todo lo técnico.
          </p>
          <div style={{ margin: '18px 0' }}>
            <div className="list-row">
              <span>📘 Una cuenta de Facebook (personal o del negocio)</span>
            </div>
            <div className="list-row">
              <span>
                📱 Un número de teléfono que <strong>no esté usando la app de WhatsApp</strong> (puede ser
                un número nuevo, un fijo, o tu número actual si lo migrás en el asistente)
              </span>
            </div>
            <div className="list-row">
              <span>✅ Poder recibir un SMS o llamada en ese número para verificarlo</span>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: '14px' }} disabled={busy} onClick={connect}>
            {busy ? 'Conectando…' : '🔗 Conectar mi WhatsApp con Facebook'}
          </button>
          <p style={{ color: 'var(--ink-faint)', fontSize: 12, marginTop: 14, marginBottom: 0 }}>
            Usamos la API oficial de WhatsApp (Meta). Tu cuenta queda a tu nombre y podés desconectarla
            cuando quieras.{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setShowManual(!showManual); }}>
              Modo manual (avanzado)
            </a>
          </p>
        </div>
      ) : (
        <div className="card rise rise-1" style={{ maxWidth: 640, borderColor: 'rgba(255,181,71,0.35)' }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>🛠 La conexión con un click no está habilitada todavía</h3>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14, margin: 0 }}>
            El administrador de la plataforma tiene que completar una configuración única con Meta (ver{' '}
            <code>PLATFORM-SETUP.md</code> en el proyecto). Mientras tanto podés usar el{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); setShowManual(!showManual); }}>modo manual</a>{' '}
            o seguir probando tu bot en el <strong>Simulador</strong>, que funciona exactamente igual.
          </p>
        </div>
      )}

      {showManual && <ManualMode tenant={tenant} refreshTenant={refreshTenant} />}
    </div>
  );
}

function ManualMode({ tenant, refreshTenant }) {
  const [form, setForm] = useState({
    wa_phone_number_id: tenant?.wa_phone_number_id || '',
    wa_access_token: '',
    wa_verify_token: tenant?.wa_verify_token || '',
  });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const webhookUrl = `${window.location.origin.replace(':5173', ':4000')}/api/webhook`;

  const saveAndVerify = async () => {
    setBusy(true);
    setError('');
    setOk('');
    try {
      const body = {
        wa_phone_number_id: form.wa_phone_number_id.trim(),
        wa_verify_token: form.wa_verify_token.trim(),
      };
      if (form.wa_access_token.trim()) body.wa_access_token = form.wa_access_token.trim();
      await api('/tenant', { method: 'PUT', body });
      const result = await api('/tenant/verify-whatsapp', { method: 'POST' });
      await refreshTenant();
      setOk(`¡Conectado! Número verificado: ${result.displayPhone || ''}`);
    } catch (e) {
      await refreshTenant().catch(() => {});
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="two-col rise" style={{ marginTop: 18 }}>
      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Modo manual (avanzado)</h3>
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 0 }}>
          Para quien ya maneja Meta for Developers y quiere usar su propia app.
        </p>
        <div className="step">
          <div className="step-num">1</div>
          <div>
            <h3>App en Meta</h3>
            <p>
              Creá una app <strong>Business</strong> en{' '}
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com</a>{' '}
              y agregale el producto <strong>WhatsApp</strong>.
            </p>
          </div>
        </div>
        <div className="step">
          <div className="step-num">2</div>
          <div>
            <h3>Credenciales</h3>
            <p>
              En <strong>WhatsApp → Configuración de la API</strong>: copiá el <code>Phone Number ID</code> y
              generá un <code>Access Token</code> (permanente con un usuario de sistema).
            </p>
          </div>
        </div>
        <div className="step">
          <div className="step-num">3</div>
          <div>
            <h3>Webhook</h3>
            <p>
              Cargá esta URL (pública con HTTPS — usá <a href="https://ngrok.com" target="_blank" rel="noreferrer">ngrok</a> si
              estás en tu PC) y tu verify token, suscripto al campo <code>messages</code>:
            </p>
            <CopyRow value={webhookUrl} />
            <CopyRow value={form.wa_verify_token || '—'} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>Credenciales</h3>
        {error && <div className="error-box">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}
        <div className="field">
          <label className="label">Phone Number ID</label>
          <input
            className="input mono"
            value={form.wa_phone_number_id}
            onChange={(e) => setForm({ ...form, wa_phone_number_id: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="label">Access Token</label>
          <input
            className="input mono"
            type="password"
            placeholder={tenant?.has_wa_token ? '••••••••  (dejá vacío para no cambiarlo)' : 'EAAG…'}
            value={form.wa_access_token}
            onChange={(e) => setForm({ ...form, wa_access_token: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="label">Verify Token</label>
          <input
            className="input mono"
            value={form.wa_verify_token}
            onChange={(e) => setForm({ ...form, wa_verify_token: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} onClick={saveAndVerify}>
          {busy ? 'Verificando…' : 'Guardar y verificar'}
        </button>
      </div>
    </div>
  );
}
