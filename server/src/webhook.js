import { Router } from 'express';
import { q } from './database.js';
import { handleIncoming } from './engine.js';
import { sendWhatsAppText, phoneFromJid } from './whatsapp.js';

const router = Router();

/**
 * Webhook de Evolution API (compartido por todas las instancias/tenants).
 * Evolution envía el evento `messages.upsert` con el nombre de la instancia,
 * que usamos para encontrar el tenant correcto.
 */
router.post('/webhook', async (req, res) => {
  // Responder rápido; el procesamiento sigue después
  res.sendStatus(200);

  try {
    const payload = req.body || {};
    const event = (payload.event || '').toLowerCase();
    if (event !== 'messages.upsert') return;

    const instanceName = payload.instance;
    if (!instanceName) return;

    const tenant = await q.one('SELECT * FROM tenants WHERE evolution_instance = ?', [instanceName]);
    if (!tenant) {
      console.warn(`[webhook] mensaje para instancia desconocida: ${instanceName}`);
      return;
    }

    // Evolution puede mandar uno o varios mensajes en data
    const items = Array.isArray(payload.data) ? payload.data : [payload.data];
    for (const msg of items) {
      if (!msg?.key) continue;
      if (msg.key.fromMe) continue; // eco de lo que enviamos nosotros
      const jid = msg.key.remoteJid || '';
      if (!jid.endsWith('@s.whatsapp.net')) continue; // ignorar grupos/estados

      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.buttonsResponseMessage?.selectedDisplayText ||
        msg.message?.listResponseMessage?.title ||
        null;

      const from = phoneFromJid(jid);
      const profileName = msg.pushName || '';

      if (!text) {
        await sendWhatsAppText(
          tenant,
          from,
          'Por ahora solo puedo leer mensajes de texto. 🙏 Escribí *menu* para ver las opciones.'
        );
        continue;
      }

      const { replies } = await handleIncoming(tenant, from, text, 'whatsapp', profileName);
      for (const reply of replies) {
        await sendWhatsAppText(tenant, from, reply.text);
      }
    }
  } catch (err) {
    console.error('[webhook] error procesando:', err);
  }
});

export default router;
