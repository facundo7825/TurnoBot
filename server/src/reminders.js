import { q } from './database.js';
import { sendWhatsAppText, sendWhatsAppInteractive } from './whatsapp.js';
import { formatDateHuman, todayYMD, ymdOffset } from './booking.js';

/**
 * Recordatorios automáticos: una vez por turno, el día anterior, por WhatsApp.
 * Solo aplica a clientes reales (no del simulador) de tenants con WhatsApp
 * conectado y recordatorios activados.
 */
async function tick() {
  let appts;
  try {
    appts = await q.all(
      `SELECT a.id, a.tenant_id, a.date, a.time, a.customer_name, c.phone, c.name AS customer_db_name,
              s.name AS service_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       LEFT JOIN services s ON s.id = a.service_id
       WHERE a.status = 'confirmed' AND a.reminder_sent = 0
         AND a.date = ?
         AND c.phone NOT LIKE 'sim-%'`,
      [ymdOffset(1)]
    );
  } catch (err) {
    console.error('[reminders] error consultando turnos:', err.message);
    return;
  }

  for (const a of appts) {
    const tenant = await q.one('SELECT * FROM tenants WHERE id = ?', [a.tenant_id]);
    if (!tenant || !tenant.reminders_enabled || !tenant.wa_connected) continue;

    const name = a.customer_name || a.customer_db_name || '';
    const body =
      `⏰ ¡Hola${name ? ` ${name}` : ''}! Te recordamos tu turno en *${tenant.business_name}*:\n\n` +
      `📅 Mañana, ${formatDateHuman(a.date)} a las ${a.time} hs` +
      (a.service_name ? `\n💈 ${a.service_name}` : '') +
      `\n\n¿Venís? Tocá un botón, o respondé *confirmar* / escribí *menu* para reprogramar.`;

    // Botones de confirmación; si fallan, cae a texto plano
    let result = await sendWhatsAppInteractive(tenant, a.phone, body, [
      { id: `confirmar_${a.id}`, title: '✅ Confirmo' },
      { id: `cancelar_${a.id}`, title: '❌ Cancelar turno' },
    ]);
    if (!result.ok) result = await sendWhatsAppText(tenant, a.phone, body);
    // Se marca como enviado incluso si falla, para no reintentar en loop cada 15 min
    await q.run('UPDATE appointments SET reminder_sent = 1 WHERE id = ?', [a.id]);
    if (result.ok) {
      console.log(`[reminders] recordatorio enviado: turno ${a.id} (tenant ${a.tenant_id})`);
    } else {
      console.error(`[reminders] falló turno ${a.id}: ${result.error}`);
    }
  }
}

export function startReminderLoop(intervalMs = 15 * 60 * 1000) {
  setInterval(() => tick().catch((e) => console.error('[reminders]', e)), intervalMs);
  tick().catch((e) => console.error('[reminders]', e));
}

/**
 * Resumen matutino: un WhatsApp al dueño con los turnos del día,
 * una vez por día a partir de la hora configurada (digest_hour).
 */
async function digestTick() {
  const now = new Date();
  const today = todayYMD();
  const hour = now.getHours();

  const tenants = await q.all(
    `SELECT * FROM tenants
     WHERE daily_digest = 1 AND wa_connected = 1 AND owner_phone != '' AND last_digest_date != ?`,
    [today]
  );

  for (const tenant of tenants) {
    if (hour < (tenant.digest_hour ?? 8)) continue;

    const appts = await q.all(
      `SELECT a.time, a.confirmed_by_customer, s.name AS service_name,
              COALESCE(NULLIF(a.customer_name, ''), c.name) AS display_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.tenant_id = ? AND a.date = ? AND a.status = 'confirmed'
       ORDER BY a.time`,
      [tenant.id, today]
    );

    let body;
    if (!appts.length) {
      body = `☀️ ¡Buen día! Hoy no tenés turnos agendados en *${tenant.business_name}*.`;
    } else {
      body =
        `☀️ ¡Buen día! Tu agenda de hoy en *${tenant.business_name}* (${appts.length} turno${appts.length > 1 ? 's' : ''}):\n\n` +
        appts
          .map(
            (a) =>
              `• ${a.time} hs — ${a.display_name || 'Cliente'}${a.service_name ? ` (${a.service_name})` : ''}${a.confirmed_by_customer ? ' ✅' : ''}`
          )
          .join('\n') +
        `\n\n✅ = confirmó asistencia. ¡Buena jornada!`;
    }

    const result = await sendWhatsAppText(tenant, tenant.owner_phone, body);
    // Una vez por día aunque falle, para no insistir en loop
    await q.run('UPDATE tenants SET last_digest_date = ? WHERE id = ?', [today, tenant.id]);
    if (result.ok) console.log(`[digest] resumen enviado a tenant ${tenant.id}`);
    else console.error(`[digest] falló tenant ${tenant.id}: ${result.error}`);
  }
}

export function startDigestLoop(intervalMs = 10 * 60 * 1000) {
  setInterval(() => digestTick().catch((e) => console.error('[digest]', e)), intervalMs);
  digestTick().catch((e) => console.error('[digest]', e));
}
