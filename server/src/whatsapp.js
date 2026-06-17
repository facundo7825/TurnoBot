const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/** Envía un mensaje de texto por WhatsApp Cloud API con las credenciales del tenant. */
export async function sendWhatsAppText(tenant, toPhone, body) {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) {
    console.warn(`[whatsapp] tenant ${tenant.id} sin credenciales, mensaje no enviado`);
    return { ok: false, error: 'missing_credentials' };
  }
  try {
    const res = await fetch(`${GRAPH_BASE}/${tenant.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenant.wa_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[whatsapp] error enviando (tenant ${tenant.id}):`, JSON.stringify(data));
      return { ok: false, error: data.error?.message || 'send_failed' };
    }
    return { ok: true, id: data.messages?.[0]?.id };
  } catch (err) {
    console.error(`[whatsapp] fetch error (tenant ${tenant.id}):`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Envía un mensaje interactivo nativo: hasta 3 opciones usa botones,
 * hasta 10 usa lista desplegable. Con más opciones (o si falla) el caller
 * debe caer al texto plano.
 */
export async function sendWhatsAppInteractive(tenant, toPhone, body, options) {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) {
    return { ok: false, error: 'missing_credentials' };
  }
  if (!options?.length || options.length > 10) return { ok: false, error: 'unsupported_option_count' };

  let interactive;
  if (options.length <= 3) {
    interactive = {
      type: 'button',
      body: { text: body.slice(0, 1024) },
      action: {
        buttons: options.map((o) => ({ type: 'reply', reply: { id: o.id, title: o.title.slice(0, 20) } })),
      },
    };
  } else {
    interactive = {
      type: 'list',
      body: { text: body.slice(0, 1024) },
      action: {
        button: 'Ver opciones',
        sections: [
          {
            rows: options.map((o) => ({
              id: o.id,
              title: o.title.slice(0, 24),
              ...(o.description ? { description: o.description.slice(0, 72) } : {}),
            })),
          },
        ],
      },
    };
  }

  try {
    const res = await fetch(`${GRAPH_BASE}/${tenant.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenant.wa_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[whatsapp] error interactivo (tenant ${tenant.id}):`, JSON.stringify(data));
      return { ok: false, error: data.error?.message || 'send_failed' };
    }
    return { ok: true, id: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------- Embedded Signup (conexión automática) ----------

/** Cambia el código del popup de Facebook por un token de larga duración. */
export async function exchangeCodeForToken(code) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, error: 'platform_not_configured' };
  try {
    const url = `${GRAPH_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      return { ok: false, error: data.error?.message || 'token_exchange_failed' };
    }
    return { ok: true, accessToken: data.access_token };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Suscribe la app de la plataforma al WABA del cliente (para recibir sus mensajes en nuestro webhook). */
export async function subscribeAppToWaba(wabaId, accessToken) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error?.message || 'subscribe_failed' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Registra el número para la Cloud API (necesario para poder enviar mensajes). */
export async function registerPhoneNumber(phoneNumberId, accessToken, pin) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error?.message || 'register_failed';
      // Si ya estaba registrado, lo tratamos como éxito
      if (/already/i.test(msg)) return { ok: true, alreadyRegistered: true };
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Verifica que el token de acceso y el phone_number_id sean válidos consultando Graph. */
export async function verifyCredentials(phoneNumberId, accessToken) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error?.message || 'invalid_credentials' };
    return { ok: true, displayPhone: data.display_phone_number, verifiedName: data.verified_name };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
