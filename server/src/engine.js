import { q } from './database.js';
import {
  availableDays,
  freeSlots,
  formatDateHuman,
  createAppointment,
  todayYMD,
  nowTimestampUTC,
} from './booking.js';
import { aiReply, recentHistory } from './ai.js';
import { sendWhatsAppText } from './whatsapp.js';

/**
 * Motor conversacional del bot. Compartido por el webhook de WhatsApp y el simulador.
 * handleIncoming(tenant, phone, text, via) -> { replies: [{ text, options }] }
 * `options` ([{id, title, description?}]) alimenta los botones/listas nativos de
 * WhatsApp y los chips del simulador; el texto siempre incluye la lista numerada
 * como fallback.
 */

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

async function getOrCreateCustomer(tenantId, phone, name = '') {
  let customer = await q.one('SELECT * FROM customers WHERE tenant_id = ? AND phone = ?', [tenantId, phone]);
  if (!customer) {
    const r = await q.run('INSERT INTO customers (tenant_id, phone, name) VALUES (?, ?, ?)', [tenantId, phone, name]);
    customer = await q.one('SELECT * FROM customers WHERE id = ?', [r.id]);
  } else {
    await q.run('UPDATE customers SET last_seen = ? WHERE id = ?', [nowTimestampUTC(), customer.id]);
  }
  return customer;
}

async function getSession(tenantId, customerId) {
  const row = await q.one('SELECT * FROM bot_sessions WHERE tenant_id = ? AND customer_id = ?', [tenantId, customerId]);
  return row ? JSON.parse(row.state) : { step: 'idle' };
}

async function saveSession(tenantId, customerId, state) {
  await q.run(
    `INSERT INTO bot_sessions (tenant_id, customer_id, state, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, customer_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
    [tenantId, customerId, JSON.stringify(state), nowTimestampUTC()]
  );
}

async function logMessage(tenantId, customerId, direction, body, via) {
  await q.run('INSERT INTO messages (tenant_id, customer_id, direction, body, via) VALUES (?, ?, ?, ?, ?)', [
    tenantId,
    customerId,
    direction,
    body,
    via,
  ]);
}

function activeServices(tenantId) {
  return q.all('SELECT * FROM services WHERE tenant_id = ? AND active = 1 ORDER BY position, id', [tenantId]);
}

function upcomingAppointments(tenantId, customerId) {
  return q.all(
    `SELECT a.*, s.name AS service_name FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     WHERE a.tenant_id = ? AND a.customer_id = ? AND a.status = 'confirmed'
       AND a.date >= ?
     ORDER BY a.date, a.time`,
    [tenantId, customerId, todayYMD()]
  );
}

function menuText() {
  return (
    `¿En qué te puedo ayudar? Respondé con un número:\n\n` +
    `1️⃣ Reservar un turno\n` +
    `2️⃣ Ver mis turnos\n` +
    `3️⃣ Cancelar un turno\n` +
    `4️⃣ Horarios y ubicación\n` +
    `5️⃣ Otra consulta\n\n` +
    `Escribí *menu* en cualquier momento para volver acá.`
  );
}

const MENU_OPTIONS = [
  { id: '1', title: 'Reservar turno' },
  { id: '2', title: 'Mis turnos' },
  { id: '3', title: 'Cancelar turno' },
  { id: '4', title: 'Horarios y ubicación' },
  { id: '5', title: 'Otra consulta' },
];

const CONFIRM_OPTIONS = [
  { id: 'si', title: 'Sí, confirmar ✅' },
  { id: 'no', title: 'No, cancelar' },
];

function serviceOptions(services) {
  return services.map((s, i) => ({
    id: String(i + 1),
    title: s.name.slice(0, 24),
    description: `${s.duration_min} min${s.price ? ` — $${s.price}` : ''}`,
  }));
}

function welcomeText(tenant) {
  if (tenant.welcome_message) return tenant.welcome_message;
  return `¡Hola! 👋 Soy el asistente virtual de *${tenant.business_name}*.`;
}

async function matchFaq(tenant, normText) {
  const faqs = await q.all('SELECT * FROM faqs WHERE tenant_id = ?', [tenant.id]);
  for (const f of faqs) {
    const keywords = (f.keywords || '')
      .split(',')
      .map((k) => normalize(k))
      .filter(Boolean);
    if (keywords.some((k) => normText.includes(k))) return f.answer;
  }
  return null;
}

const GREETINGS = ['hola', 'buenas', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'hello', 'hi', 'holaa'];

/** Envía un WhatsApp al dueño del negocio (si configuró su número). */
function notifyOwnerText(tenant, body) {
  if (!tenant.owner_phone) return;
  sendWhatsAppText(tenant, tenant.owner_phone, body).catch(() => {});
}

/** Aviso al dueño cuando el bot reserva un turno (solo conversaciones reales de WhatsApp). */
function notifyOwner(tenant, customer, service, day, time, via) {
  if (via !== 'whatsapp' || !tenant.notify_owner) return;
  notifyOwnerText(
    tenant,
    `🤖 *Nuevo turno reservado por tu bot*\n\n` +
      `👤 ${customer.name || 'Cliente'} (${customer.phone})\n` +
      `📅 ${formatDateHuman(day)} a las ${time} hs\n` +
      `💈 ${service.name}`
  );
}

const HUMAN_RE = /(humano|asesor|asesora|operador|operadora|persona real|hablar con (una persona|alguien|un humano|el due|la due|el encargad|la encargad)|que me atienda (una persona|alguien))/;

function serviceListText(services) {
  return services
    .map((s, i) => `${i + 1}. ${s.name} (${s.duration_min} min${s.price ? ` — $${s.price}` : ''})`)
    .join('\n');
}

async function infoText(tenant) {
  const hours = await q.all('SELECT * FROM working_hours WHERE tenant_id = ? AND enabled = 1 ORDER BY weekday', [tenant.id]);
  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  let text = `*${tenant.business_name}*\n`;
  if (tenant.description) text += `${tenant.description}\n`;
  if (tenant.address) text += `📍 ${tenant.address}\n`;
  if (hours.length) {
    text += `\n🕐 Horarios de atención:\n`;
    text += hours.map((h) => `• ${DAY_NAMES[h.weekday]}: ${h.open_time} a ${h.close_time}`).join('\n');
  }
  return text;
}

/** Punto de entrada del motor. Devuelve { replies, customer }. */
export async function handleIncoming(tenant, phone, text, via = 'whatsapp', profileName = '') {
  const customer = await getOrCreateCustomer(tenant.id, phone, profileName);
  await logMessage(tenant.id, customer.id, 'in', text, via);

  if (!tenant.bot_enabled) return { replies: [], customer };

  // Conversación derivada a un humano: el bot guarda el mensaje pero no responde
  if (customer.bot_paused) return { replies: [], customer };

  const state = await getSession(tenant.id, customer.id);
  const norm = normalize(text);
  const replies = [];

  const reply = (msg, options = null) => replies.push({ text: msg, options });
  const setState = (s) => saveSession(tenant.id, customer.id, s);

  const showMenu = async (withWelcome = false) => {
    if (withWelcome) reply(welcomeText(tenant));
    reply(menuText(), MENU_OPTIONS);
    await setState({ step: 'menu' });
  };

  const startBooking = async () => {
    const services = await activeServices(tenant.id);
    if (!services.length) {
      reply('Por el momento no hay servicios disponibles para reservar online. Escribinos y te respondemos a la brevedad. 🙏');
      await setState({ step: 'menu' });
      return;
    }
    reply(`¿Qué servicio querés reservar? Respondé con el número:\n\n${serviceListText(services)}`, serviceOptions(services));
    await setState({ step: 'book_service' });
  };

  // Comandos globales
  if (norm === 'menu' || norm === 'menú' || norm === '0') {
    await showMenu();
    return finish();
  }
  if (GREETINGS.includes(norm) && state.step !== 'book_name') {
    await showMenu(true);
    return finish();
  }

  // Respuestas a los botones del recordatorio: confirmar_<id> / cancelar_<id>
  const reminderAction = norm.match(/^(confirmar|cancelar)_(\d+)$/);
  if (reminderAction) {
    const appt = await q.one(
      `SELECT a.*, s.name AS service_name FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       WHERE a.id = ? AND a.tenant_id = ? AND a.customer_id = ? AND a.status = 'confirmed'`,
      [Number(reminderAction[2]), tenant.id, customer.id]
    );
    if (!appt) {
      reply('Ese turno ya no está activo. Escribí *menu* para ver tus turnos o reservar otro.');
    } else if (reminderAction[1] === 'confirmar') {
      await q.run('UPDATE appointments SET confirmed_by_customer = 1 WHERE id = ?', [appt.id]);
      reply(`¡Gracias! Tu turno del ${formatDateHuman(appt.date)} a las ${appt.time} hs quedó confirmado. ✅ ¡Te esperamos!`);
    } else {
      await q.run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [appt.id]);
      reply(`Listo, cancelé tu turno del ${formatDateHuman(appt.date)} a las ${appt.time} hs. Escribí *1* si querés reservar otro.`);
      if (via === 'whatsapp' && tenant.notify_owner) {
        notifyOwnerText(
          tenant,
          `❌ *Turno cancelado por el cliente*\n\n👤 ${customer.name || 'Cliente'} (${customer.phone})\n📅 ${formatDateHuman(appt.date)} a las ${appt.time} hs${appt.service_name ? `\n💈 ${appt.service_name}` : ''}\n\nEl horario quedó libre en tu agenda.`
        );
      }
    }
    await setState({ step: 'menu' });
    return finish();
  }

  // "confirmar" / "confirmo" suelto: confirma el próximo turno
  if (['confirmar', 'confirmo'].includes(norm)) {
    const appt = (await upcomingAppointments(tenant.id, customer.id))[0];
    if (appt) {
      await q.run('UPDATE appointments SET confirmed_by_customer = 1 WHERE id = ?', [appt.id]);
      reply(`¡Gracias! Tu turno del ${formatDateHuman(appt.date)} a las ${appt.time} hs quedó confirmado. ✅ ¡Te esperamos!`);
    } else {
      reply('No encontré turnos próximos a tu nombre. Escribí *1* para reservar uno. 😊');
    }
    await setState({ step: 'menu' });
    return finish();
  }

  // Pedido de atención humana: pausa el bot en esta conversación y avisa al dueño
  if (state.step !== 'book_name' && HUMAN_RE.test(norm)) {
    await q.run('UPDATE customers SET bot_paused = 1 WHERE id = ?', [customer.id]);
    reply(
      `¡Entendido! Le aviso a *${tenant.business_name}* que querés hablar con una persona. ` +
        `Te van a responder por acá a la brevedad. 🙋`
    );
    notifyOwnerText(
      tenant,
      `🙋 *Un cliente pide hablar con una persona*\n\n👤 ${customer.name || 'Cliente'} (${customer.phone})\n💬 Último mensaje: "${text.slice(0, 200)}"\n\nEl bot se pausó en esa conversación: respondele directo desde tu WhatsApp. Cuando termines, reactivá el bot desde el panel (Conversaciones).`
    );
    await setState({ step: 'menu' });
    return finish();
  }

  switch (state.step) {
    case 'idle': {
      await showMenu(true);
      break;
    }

    case 'menu': {
      if (norm === '1' || norm.includes('reservar') || norm.includes('turno') || norm.includes('cita')) {
        await startBooking();
      } else if (norm === '2' || norm.includes('mis turnos')) {
        const appts = await upcomingAppointments(tenant.id, customer.id);
        if (!appts.length) {
          reply('No tenés turnos próximos. Escribí *1* para reservar uno. 😊');
        } else {
          reply(
            '📅 Tus próximos turnos:\n\n' +
              appts.map((a) => `• ${formatDateHuman(a.date)} a las ${a.time} — ${a.service_name || 'Turno'}`).join('\n')
          );
        }
        await setState({ step: 'menu' });
      } else if (norm === '3' || norm.includes('cancelar')) {
        const appts = await upcomingAppointments(tenant.id, customer.id);
        if (!appts.length) {
          reply('No tenés turnos próximos para cancelar.');
          await setState({ step: 'menu' });
        } else {
          reply(
            '¿Qué turno querés cancelar? Respondé con el número:\n\n' +
              appts.map((a, i) => `${i + 1}. ${formatDateHuman(a.date)} a las ${a.time} — ${a.service_name || 'Turno'}`).join('\n'),
            appts.map((a, i) => ({
              id: String(i + 1),
              title: `${formatDateHuman(a.date)} ${a.time}`.slice(0, 24),
              description: a.service_name || undefined,
            }))
          );
          await setState({ step: 'cancel_pick', apptIds: appts.map((a) => a.id) });
        }
      } else if (norm === '4' || norm.includes('horario') || norm.includes('direccion') || norm.includes('ubicacion')) {
        reply(await infoText(tenant));
        await setState({ step: 'menu' });
      } else if (norm === '5' || norm.includes('consulta') || norm.includes('pregunta')) {
        reply('Contame tu consulta y te respondo enseguida. 💬');
        await setState({ step: 'free_chat' });
      } else {
        await freeAnswer();
      }
      break;
    }

    case 'book_service': {
      const services = await activeServices(tenant.id);
      const idx = parseInt(norm, 10) - 1;
      const service =
        services[idx] || services.find((s) => normalize(s.name) === norm || norm.includes(normalize(s.name)));
      if (!service) {
        reply(`No entendí cuál servicio. Respondé con el número:\n\n${serviceListText(services)}`, serviceOptions(services));
        break;
      }
      const days = await availableDays(tenant);
      if (!days.length) {
        reply('Por ahora no hay días con disponibilidad. 😞 Probá de nuevo más adelante o escribinos directamente.');
        await setState({ step: 'menu' });
        break;
      }
      const dayOptions = days.map((d, i) => ({ id: String(i + 1), title: formatDateHuman(d) }));
      reply(
        `Perfecto: *${service.name}*. ¿Qué día te queda bien?\n\n` +
          days.map((d, i) => `${i + 1}. ${formatDateHuman(d)}`).join('\n'),
        dayOptions
      );
      await setState({ step: 'book_day', serviceId: service.id, days });
      break;
    }

    case 'book_day': {
      const idx = parseInt(norm, 10) - 1;
      const day = state.days?.[idx];
      if (!day) {
        reply(
          `Elegí un día respondiendo con el número:\n\n` +
            state.days.map((d, i) => `${i + 1}. ${formatDateHuman(d)}`).join('\n'),
          state.days.map((d, i) => ({ id: String(i + 1), title: formatDateHuman(d) }))
        );
        break;
      }
      const service = await q.one('SELECT * FROM services WHERE id = ?', [state.serviceId]);
      const slots = (await freeSlots(tenant, day, service.duration_min)).slice(0, 10);
      if (!slots.length) {
        reply('Ese día ya no tiene horarios libres. Elegí otro día por favor.');
        break;
      }
      const slotOptions = slots.map((s, i) => ({ id: String(i + 1), title: `${s} hs` }));
      reply(
        `Horarios disponibles para el ${formatDateHuman(day)}:\n\n` + slots.map((s, i) => `${i + 1}. ${s} hs`).join('\n'),
        slotOptions
      );
      await setState({ ...state, step: 'book_time', day, slots });
      break;
    }

    case 'book_time': {
      const idx = parseInt(norm, 10) - 1;
      let slot = state.slots?.[idx];
      if (!slot && /^\d{1,2}:\d{2}$/.test(norm)) {
        slot = state.slots.find((s) => s === norm.padStart(5, '0'));
      }
      if (!slot) {
        reply(
          `Elegí un horario respondiendo con el número:\n\n` + state.slots.map((s, i) => `${i + 1}. ${s} hs`).join('\n'),
          state.slots.map((s, i) => ({ id: String(i + 1), title: `${s} hs` }))
        );
        break;
      }
      const next = { ...state, step: 'book_confirm', time: slot };
      if (!customer.name) {
        next.step = 'book_name';
        reply('¡Casi listo! ¿A nombre de quién reservo el turno?');
      } else {
        const service = await q.one('SELECT * FROM services WHERE id = ?', [state.serviceId]);
        reply(confirmText(service, state.day, slot, customer.name), CONFIRM_OPTIONS);
      }
      await setState(next);
      break;
    }

    case 'book_name': {
      const name = text.trim();
      if (name.length < 2) {
        reply('Decime un nombre válido por favor. 😊');
        break;
      }
      await q.run('UPDATE customers SET name = ? WHERE id = ?', [name, customer.id]);
      customer.name = name;
      const service = await q.one('SELECT * FROM services WHERE id = ?', [state.serviceId]);
      reply(confirmText(service, state.day, state.time, name), CONFIRM_OPTIONS);
      await setState({ ...state, step: 'book_confirm' });
      break;
    }

    case 'book_confirm': {
      if (['si', 'sí', 'confirmar', 'confirmo', 'ok', 'dale', '1', 'yes'].includes(norm)) {
        const service = await q.one('SELECT * FROM services WHERE id = ?', [state.serviceId]);
        // Reverificar disponibilidad por si se ocupó mientras tanto
        const stillFree = (await freeSlots(tenant, state.day, service.duration_min)).includes(state.time);
        if (!stillFree) {
          reply('Uy, ese horario se acaba de ocupar. 😞 Escribí *1* para elegir otro.');
          await setState({ step: 'menu' });
          break;
        }
        await createAppointment(tenant, {
          customerId: customer.id,
          serviceId: service.id,
          date: state.day,
          time: state.time,
          durationMin: service.duration_min,
          customerName: customer.name,
          via: 'bot',
        });
        reply(
          `✅ ¡Turno confirmado!\n\n📅 ${formatDateHuman(state.day)} a las ${state.time} hs\n💈 ${service.name}\n👤 ${customer.name}\n\n¡Te esperamos! Escribí *menu* si necesitás algo más.`
        );
        notifyOwner(tenant, customer, service, state.day, state.time, via);
        await setState({ step: 'menu' });
      } else if (['no', 'cancelar', '2'].includes(norm)) {
        reply('Sin problema, no reservé nada. Escribí *menu* para empezar de nuevo.');
        await setState({ step: 'menu' });
      } else {
        reply('Respondé *sí* para confirmar el turno o *no* para cancelar.', CONFIRM_OPTIONS);
      }
      break;
    }

    case 'cancel_pick': {
      const idx = parseInt(norm, 10) - 1;
      const apptId = state.apptIds?.[idx];
      if (!apptId) {
        reply('No entendí cuál turno. Respondé con el número de la lista, o escribí *menu* para volver.');
        break;
      }
      const appt = await q.one(
        'SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.id = ?',
        [apptId]
      );
      await q.run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [apptId]);
      reply(`Listo, cancelé tu turno del ${formatDateHuman(appt.date)} a las ${appt.time}. Escribí *1* si querés reservar otro.`);
      await setState({ step: 'menu' });
      break;
    }

    case 'free_chat': {
      await freeAnswer();
      await setState({ step: 'menu' });
      break;
    }

    default: {
      await showMenu(true);
    }
  }

  async function freeAnswer() {
    const faqAnswer = await matchFaq(tenant, norm);
    if (faqAnswer) {
      reply(faqAnswer);
      await setState({ step: 'menu' });
      return;
    }
    const history = await recentHistory(tenant.id, customer.id);
    const ai = await aiReply(tenant, history.length ? history : [{ role: 'user', content: text }]);
    if (ai) {
      reply(ai);
    } else {
      reply(
        tenant.fallback_message ||
          'No entendí tu mensaje. 🙏 Escribí *menu* para ver las opciones, o dejanos tu consulta y un humano te responderá a la brevedad.'
      );
    }
    await setState({ step: 'menu' });
  }

  function confirmText(service, day, time, name) {
    return (
      `Confirmá tu turno:\n\n📅 ${formatDateHuman(day)} a las ${time} hs\n💈 ${service.name} (${service.duration_min} min${service.price ? ` — $${service.price}` : ''})\n👤 ${name}\n\nRespondé *sí* para confirmar o *no* para cancelar.`
    );
  }

  async function finish() {
    for (const r of replies) await logMessage(tenant.id, customer.id, 'out', r.text, via);
    return { replies, customer };
  }

  return finish();
}
