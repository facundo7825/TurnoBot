/**
 * Capa de WhatsApp sobre Evolution API (no oficial, vía Baileys).
 *
 * Cada negocio (tenant) tiene una "instancia" en Evolution que se conecta
 * escaneando un QR con el WhatsApp del dueño. Todas las operaciones usan el
 * API key GLOBAL de Evolution (admin), así no hay que gestionar el token de
 * cada instancia por separado.
 *
 * Config (env): EVOLUTION_API_URL, EVOLUTION_API_KEY
 */

const BASE = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const KEY = process.env.EVOLUTION_API_KEY || '';

export function evolutionConfigured() {
  return !!(BASE && KEY);
}

/** Nombre de instancia estable y único por tenant. */
export function instanceNameFor(tenant) {
  return tenant.evolution_instance || `turnobot_${tenant.id}`;
}

async function evo(path, { method = 'GET', body } = {}) {
  if (!evolutionConfigured()) return { ok: false, status: 0, data: { error: 'evolution_not_configured' } };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* sin cuerpo */
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

/** Extrae el número (solo dígitos) de un JID de WhatsApp: "549...@s.whatsapp.net" -> "549...". */
export function phoneFromJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

// ---------- Gestión de instancias (conexión por QR) ----------

/**
 * Crea la instancia del tenant (si no existe) y le configura el webhook
 * apuntando a nuestra URL. Idempotente: si ya existe, no falla.
 */
export async function createInstance(instanceName, webhookUrl) {
  const create = await evo('/instance/create', {
    method: 'POST',
    body: { instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true },
  });
  // 403/409 => ya existe; lo tratamos como ok para reusarla
  const alreadyExists = !create.ok && /already in use|exists/i.test(JSON.stringify(create.data || {}));
  if (!create.ok && !alreadyExists) {
    return { ok: false, error: create.data?.response?.message || create.data?.error || 'create_failed' };
  }
  if (webhookUrl) await setWebhook(instanceName, webhookUrl);
  return { ok: true, qr: create.data?.qrcode?.base64 || null };
}

/** Configura el webhook de la instancia (evento de mensajes entrantes). */
export async function setWebhook(instanceName, webhookUrl) {
  const r = await evo(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT'],
      },
    },
  });
  return { ok: r.ok };
}

/** Devuelve el QR (imagen base64) para escanear. Puede tardar unos segundos en estar listo. */
export async function getQR(instanceName) {
  const r = await evo(`/instance/connect/${instanceName}`);
  if (!r.ok) return { ok: false, error: r.data?.error || 'connect_failed' };
  let base64 = r.data?.base64 || r.data?.qrcode?.base64 || null;
  if (base64 && !base64.startsWith('data:image')) base64 = `data:image/png;base64,${base64}`;
  return { ok: true, qr: base64, pairingCode: r.data?.pairingCode || r.data?.code || null };
}

/**
 * Estado de conexión + datos del número conectado.
 * state: 'open' (conectado) | 'connecting' | 'close'
 */
export async function getConnectionState(instanceName) {
  const r = await evo(`/instance/connectionState/${instanceName}`);
  if (!r.ok) return { ok: false, state: 'close' };
  const state = r.data?.instance?.state || 'close';
  let phone = '';
  let profileName = '';
  if (state === 'open') {
    const list = await evo(`/instance/fetchInstances?instanceName=${instanceName}`);
    const info = Array.isArray(list.data) ? list.data[0] : null;
    if (info) {
      phone = phoneFromJid(info.ownerJid);
      profileName = info.profileName || '';
    }
  }
  return { ok: true, state, phone, profileName };
}

/** Desconecta y elimina la instancia. */
export async function deleteInstance(instanceName) {
  await evo(`/instance/logout/${instanceName}`, { method: 'DELETE' });
  const r = await evo(`/instance/delete/${instanceName}`, { method: 'DELETE' });
  return { ok: r.ok };
}

// ---------- Envío de mensajes (firma compatible con el motor) ----------

/** Envía un mensaje de texto. Mantiene la firma usada por engine.js/reminders.js. */
export async function sendWhatsAppText(tenant, toPhone, body) {
  const instance = instanceNameFor(tenant);
  if (!evolutionConfigured()) {
    console.warn(`[whatsapp] Evolution sin configurar, mensaje no enviado (tenant ${tenant.id})`);
    return { ok: false, error: 'evolution_not_configured' };
  }
  const number = String(toPhone).replace(/\D/g, '');
  const r = await evo(`/message/sendText/${instance}`, {
    method: 'POST',
    body: { number, text: body },
  });
  if (!r.ok) {
    console.error(`[whatsapp] error enviando (tenant ${tenant.id}):`, JSON.stringify(r.data));
    return { ok: false, error: r.data?.response?.message || r.data?.error || 'send_failed' };
  }
  return { ok: true, id: r.data?.key?.id };
}

/**
 * Los botones/listas nativos de Baileys son inestables y WhatsApp los
 * restringe fuera de la API oficial. Devolvemos no-soportado para que el
 * caller caiga al menú de texto numerado (que ya existe como fallback).
 */
export async function sendWhatsAppInteractive() {
  return { ok: false, error: 'interactive_not_supported_on_evolution' };
}
