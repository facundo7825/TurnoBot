import { Router } from 'express';
import { q } from './database.js';
import { handleIncoming } from './engine.js';
import { sendWhatsAppText, sendWhatsAppInteractive } from './whatsapp.js';

const router = Router();

/**
 * Webhook de WhatsApp Cloud API (compartido por todos los tenants).
 * - GET: verificación de Meta (hub.challenge). Acepta el verify token de cualquier tenant.
 * - POST: mensajes entrantes; se enruta al tenant por metadata.phone_number_id.
 */

router.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode !== 'subscribe' || !token) return res.sendStatus(403);

  const tenant = await q.one('SELECT id FROM tenants WHERE wa_verify_token = ?', [token]);
  const globalToken = process.env.WEBHOOK_VERIFY_TOKEN;
  if (tenant || (globalToken && token === globalToken)) {
    console.log('[webhook] verificación OK');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/webhook', async (req, res) => {
  // Responder rápido: Meta reintenta si no recibe 200 en pocos segundos
  res.sendStatus(200);

  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages?.length) continue;

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const tenant = await q.one('SELECT * FROM tenants WHERE wa_phone_number_id = ?', [phoneNumberId]);
        if (!tenant) {
          console.warn(`[webhook] mensaje para phone_number_id desconocido: ${phoneNumberId}`);
          continue;
        }

        for (const message of value.messages) {
          // Texto plano, o respuesta a un botón/lista interactiva (llega el id de la opción)
          let body = null;
          if (message.type === 'text') {
            body = message.text.body;
          } else if (message.type === 'interactive') {
            body =
              message.interactive?.button_reply?.id ||
              message.interactive?.list_reply?.id ||
              message.interactive?.button_reply?.title ||
              message.interactive?.list_reply?.title ||
              null;
          }
          if (body == null) {
            await sendWhatsAppText(
              tenant,
              message.from,
              'Por ahora solo puedo leer mensajes de texto. 🙏 Escribí *menu* para ver las opciones.'
            );
            continue;
          }
          const profileName = value.contacts?.[0]?.profile?.name || '';
          const { replies } = await handleIncoming(tenant, message.from, body, 'whatsapp', profileName);
          for (const reply of replies) {
            let sent = { ok: false };
            if (reply.options?.length && reply.options.length <= 10) {
              sent = await sendWhatsAppInteractive(tenant, message.from, reply.text, reply.options);
            }
            if (!sent.ok) {
              await sendWhatsAppText(tenant, message.from, reply.text);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[webhook] error procesando:', err);
  }
});

export default router;
