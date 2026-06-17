import { Router } from 'express';
import { q } from './database.js';
import { hashPassword, verifyPassword, signToken, requireAuth } from './auth.js';
import { handleIncoming } from './engine.js';
import {
  evolutionConfigured,
  instanceNameFor,
  createInstance,
  getQR,
  getConnectionState,
  deleteInstance,
} from './whatsapp.js';
import { freeSlots, todayYMD, ymdOffset, nowHHMM } from './booking.js';

/** URL pública de la app, para que Evolution mande el webhook acá. */
function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.headers.host}`;
}

const router = Router();

// Plantillas por rubro: servicios y FAQs precargados al registrarse (todo editable después)
const BUSINESS_TEMPLATES = {
  peluqueria: {
    services: [
      ['Corte de pelo', 30, 0],
      ['Corte y barba', 45, 0],
      ['Color', 90, 0],
      ['Peinado / Brushing', 45, 0],
    ],
    faqs: [
      ['¿Aceptan tarjeta?', 'tarjeta, debito, credito, mercado pago, transferencia', '¡Sí! Aceptamos efectivo, tarjetas y Mercado Pago. 💳'],
      ['¿Atienden sin turno?', 'sin turno, orden de llegada, ahora', 'Atendemos con turno para que no esperes. Escribí *1* y reservá el tuyo en segundos. 😉'],
    ],
  },
  estetica: {
    services: [
      ['Limpieza facial', 60, 0],
      ['Manicura', 45, 0],
      ['Depilación', 30, 0],
      ['Masajes', 60, 0],
    ],
    faqs: [
      ['¿Aceptan tarjeta?', 'tarjeta, debito, credito, mercado pago, transferencia', '¡Sí! Aceptamos efectivo, tarjetas y Mercado Pago. 💳'],
      ['¿Qué tengo que llevar?', 'llevar, traer, necesito', 'No necesitás traer nada, nosotros ponemos todos los materiales. 😊'],
    ],
  },
  consultorio: {
    services: [
      ['Consulta', 30, 0],
      ['Primera consulta', 45, 0],
    ],
    faqs: [
      ['¿Atienden obras sociales?', 'obra social, prepaga, osde, swiss, cobertura', 'Contanos qué obra social o prepaga tenés y te confirmamos la cobertura.'],
      ['¿Aceptan tarjeta?', 'tarjeta, debito, credito, mercado pago, transferencia', 'Sí, aceptamos efectivo, tarjetas y Mercado Pago. 💳'],
    ],
  },
  hotel: {
    services: [['Visita / Recorrido por las instalaciones', 30, 0]],
    faqs: [
      ['¿Horario de check-in/out?', 'check in, check out, checkin, checkout, ingreso, salida', 'El check-in es a partir de las 14:00 y el check-out hasta las 10:00.'],
      ['¿Aceptan mascotas?', 'mascota, perro, gato, pet', 'Consultanos por tu mascota y te confirmamos disponibilidad de habitaciones pet-friendly. 🐶'],
    ],
  },
  gimnasio: {
    services: [
      ['Clase de prueba', 60, 0],
      ['Entrenamiento personal', 60, 0],
    ],
    faqs: [['¿Cuánto sale la cuota?', 'cuota, precio, costo, mensualidad, plan', 'Tenemos varios planes según los días que vengas. Escribí *5* y contanos qué buscás para pasarte precios.']],
  },
  gastronomia: {
    services: [['Reserva de mesa', 90, 0]],
    faqs: [['¿Tienen opciones vegetarianas?', 'vegetariano, vegano, celiaco, sin tacc, gluten', 'Sí, tenemos opciones vegetarianas, veganas y sin TACC. 🌱']],
  },
};

// ---------- Auth ----------

router.post('/auth/register', async (req, res) => {
  const { name, email, password, businessName, businessType } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Faltan datos obligatorios' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  const existing = await q.one('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });

  const r = await q.run('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)', [
    email.trim().toLowerCase(),
    hashPassword(password),
    name,
  ]);
  const userId = r.id;

  const t = await q.run(
    `INSERT INTO tenants (user_id, business_name, business_type, wa_verify_token) VALUES (?, ?, ?, ?)`,
    [userId, businessName || '', businessType || 'general', 'turnobot_' + Math.random().toString(36).slice(2, 10)]
  );
  const tenantId = t.id;

  // Horario por defecto: lunes a viernes 9 a 18
  for (let d = 0; d <= 6; d++) {
    await q.run('INSERT INTO working_hours (tenant_id, weekday, open_time, close_time, enabled) VALUES (?, ?, ?, ?, ?)', [
      tenantId,
      d,
      '09:00',
      '18:00',
      d >= 1 && d <= 5 ? 1 : 0,
    ]);
  }

  // Plantilla por rubro: servicios y FAQs de arranque (editables)
  const template = BUSINESS_TEMPLATES[businessType];
  if (template) {
    let pos = 0;
    for (const [sname, dur, price] of template.services) {
      await q.run('INSERT INTO services (tenant_id, name, duration_min, price, position) VALUES (?, ?, ?, ?, ?)', [
        tenantId,
        sname,
        dur,
        price,
        pos++,
      ]);
    }
    for (const [question, keywords, answer] of template.faqs) {
      await q.run('INSERT INTO faqs (tenant_id, question, keywords, answer) VALUES (?, ?, ?, ?)', [
        tenantId,
        question,
        keywords,
        answer,
      ]);
    }
  }

  const user = await q.one('SELECT id, email, name FROM users WHERE id = ?', [userId]);
  res.json({ token: signToken(user), user });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await q.one('SELECT * FROM users WHERE email = ?', [(email || '').trim().toLowerCase()]);
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  res.json({ token: signToken(user), user: { id: user.id, email: user.email, name: user.name } });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user, tenant: publicTenant(req.tenant) });
});

function publicTenant(t) {
  if (!t) return null;
  const { anthropic_api_key, wa_access_token, ...rest } = t;
  return {
    ...rest,
    has_anthropic_key: !!anthropic_api_key,
    has_wa_token: !!wa_access_token,
  };
}

// ---------- Tenant / configuración ----------

router.get('/tenant', requireAuth, (req, res) => res.json({ tenant: publicTenant(req.tenant) }));

router.put('/tenant', requireAuth, async (req, res) => {
  const allowed = [
    'business_name',
    'business_type',
    'description',
    'address',
    'slot_interval_min',
    'booking_horizon_days',
    'welcome_message',
    'fallback_message',
    'bot_enabled',
    'ai_enabled',
    'anthropic_api_key',
    'ai_instructions',
    'wa_phone_number_id',
    'wa_access_token',
    'wa_verify_token',
    'onboarded',
    'owner_phone',
    'notify_owner',
    'reminders_enabled',
    'daily_digest',
    'digest_hour',
  ];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (key in (req.body || {})) {
      updates.push(`${key} = ?`);
      let v = req.body[key];
      if (typeof v === 'boolean') v = v ? 1 : 0;
      values.push(v);
    }
  }
  if (updates.length) {
    values.push(req.tenant.id);
    await q.run(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`, values);
  }
  const tenant = await q.one('SELECT * FROM tenants WHERE id = ?', [req.tenant.id]);
  res.json({ tenant: publicTenant(tenant) });
});

// ¿Está configurada la conexión con Evolution API a nivel plataforma?
router.get('/whatsapp/config', requireAuth, (req, res) => {
  res.json({ enabled: evolutionConfigured() });
});

/**
 * Inicia la conexión: crea (o reusa) la instancia del tenant en Evolution,
 * le configura el webhook hacia esta app y devuelve el QR para escanear.
 */
router.post('/whatsapp/connect', requireAuth, async (req, res) => {
  if (!evolutionConfigured()) {
    return res.status(503).json({ error: 'La conexión de WhatsApp no está habilitada en el servidor.' });
  }
  // Nombre de instancia estable; se genera una vez y se guarda
  let instance = req.tenant.evolution_instance;
  if (!instance) {
    instance = `turnobot_${req.tenant.id}_${Math.random().toString(36).slice(2, 8)}`;
    await q.run('UPDATE tenants SET evolution_instance = ? WHERE id = ?', [instance, req.tenant.id]);
  }

  const webhookUrl = `${appUrl(req)}/api/webhook`;
  const result = await createInstance(instance, webhookUrl);
  if (!result.ok) {
    return res.status(400).json({ error: `No se pudo iniciar la conexión: ${result.error}` });
  }
  // El QR puede no venir al instante; el front lo pide con /whatsapp/qr
  res.json({ ok: true, qr: result.qr || null });
});

/** Devuelve el QR actual de la instancia del tenant (para mostrar/refrescar). */
router.get('/whatsapp/qr', requireAuth, async (req, res) => {
  const instance = instanceNameFor(req.tenant);
  if (!req.tenant.evolution_instance) return res.json({ qr: null });
  const r = await getQR(instance);
  res.json({ qr: r.qr || null, pairingCode: r.pairingCode || null });
});

/** Estado de conexión; si quedó conectado, lo persiste con el número. */
router.get('/whatsapp/state', requireAuth, async (req, res) => {
  if (!req.tenant.evolution_instance) return res.json({ state: 'close', connected: false });
  const instance = instanceNameFor(req.tenant);
  const r = await getConnectionState(instance);
  const connected = r.state === 'open';

  // Persistir cambios de estado
  if (connected && (!req.tenant.wa_connected || (r.phone && r.phone !== req.tenant.wa_display_phone))) {
    await q.run('UPDATE tenants SET wa_connected = 1, wa_display_phone = ? WHERE id = ?', [r.phone || '', req.tenant.id]);
  } else if (!connected && req.tenant.wa_connected) {
    await q.run('UPDATE tenants SET wa_connected = 0 WHERE id = ?', [req.tenant.id]);
  }

  res.json({ state: r.state, connected, phone: r.phone || '', profileName: r.profileName || '' });
});

/** Desconecta el WhatsApp del tenant (borra la instancia en Evolution). */
router.post('/whatsapp/disconnect', requireAuth, async (req, res) => {
  if (req.tenant.evolution_instance) {
    await deleteInstance(instanceNameFor(req.tenant));
  }
  await q.run("UPDATE tenants SET wa_connected = 0, wa_display_phone = '', evolution_instance = '' WHERE id = ?", [
    req.tenant.id,
  ]);
  res.json({ ok: true });
});

// ---------- Servicios ----------

router.get('/services', requireAuth, async (req, res) => {
  res.json({ services: await q.all('SELECT * FROM services WHERE tenant_id = ? ORDER BY position, id', [req.tenant.id]) });
});

router.post('/services', requireAuth, async (req, res) => {
  const { name, duration_min, price } = req.body || {};
  if (!name) return res.status(400).json({ error: 'El servicio necesita un nombre' });
  const r = await q.run('INSERT INTO services (tenant_id, name, duration_min, price) VALUES (?, ?, ?, ?)', [
    req.tenant.id,
    name,
    duration_min || 30,
    price || 0,
  ]);
  res.json({ service: await q.one('SELECT * FROM services WHERE id = ?', [r.id]) });
});

router.put('/services/:id', requireAuth, async (req, res) => {
  const service = await q.one('SELECT * FROM services WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
  if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });
  const { name, duration_min, price, active } = req.body || {};
  await q.run('UPDATE services SET name = ?, duration_min = ?, price = ?, active = ? WHERE id = ?', [
    name ?? service.name,
    duration_min ?? service.duration_min,
    price ?? service.price,
    active === undefined ? service.active : active ? 1 : 0,
    service.id,
  ]);
  res.json({ service: await q.one('SELECT * FROM services WHERE id = ?', [service.id]) });
});

router.delete('/services/:id', requireAuth, async (req, res) => {
  await q.run('DELETE FROM services WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
  res.json({ ok: true });
});

// ---------- Horarios ----------

router.get('/working-hours', requireAuth, async (req, res) => {
  res.json({ hours: await q.all('SELECT * FROM working_hours WHERE tenant_id = ? ORDER BY weekday', [req.tenant.id]) });
});

router.put('/working-hours', requireAuth, async (req, res) => {
  const { hours } = req.body || {};
  if (!Array.isArray(hours)) return res.status(400).json({ error: 'Formato inválido' });
  for (const h of hours) {
    if (h.weekday < 0 || h.weekday > 6) continue;
    await q.run(
      `INSERT INTO working_hours (tenant_id, weekday, open_time, close_time, enabled) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tenant_id, weekday) DO UPDATE SET open_time = excluded.open_time, close_time = excluded.close_time, enabled = excluded.enabled`,
      [req.tenant.id, h.weekday, h.open_time || '09:00', h.close_time || '18:00', h.enabled ? 1 : 0]
    );
  }
  res.json({ hours: await q.all('SELECT * FROM working_hours WHERE tenant_id = ? ORDER BY weekday', [req.tenant.id]) });
});

// ---------- FAQs ----------

router.get('/faqs', requireAuth, async (req, res) => {
  res.json({ faqs: await q.all('SELECT * FROM faqs WHERE tenant_id = ? ORDER BY id', [req.tenant.id]) });
});

router.post('/faqs', requireAuth, async (req, res) => {
  const { question, keywords, answer } = req.body || {};
  if (!question || !answer) return res.status(400).json({ error: 'Faltan pregunta o respuesta' });
  const r = await q.run('INSERT INTO faqs (tenant_id, question, keywords, answer) VALUES (?, ?, ?, ?)', [
    req.tenant.id,
    question,
    keywords || '',
    answer,
  ]);
  res.json({ faq: await q.one('SELECT * FROM faqs WHERE id = ?', [r.id]) });
});

router.put('/faqs/:id', requireAuth, async (req, res) => {
  const faq = await q.one('SELECT * FROM faqs WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
  if (!faq) return res.status(404).json({ error: 'FAQ no encontrada' });
  const { question, keywords, answer } = req.body || {};
  await q.run('UPDATE faqs SET question = ?, keywords = ?, answer = ? WHERE id = ?', [
    question ?? faq.question,
    keywords ?? faq.keywords,
    answer ?? faq.answer,
    faq.id,
  ]);
  res.json({ faq: await q.one('SELECT * FROM faqs WHERE id = ?', [faq.id]) });
});

router.delete('/faqs/:id', requireAuth, async (req, res) => {
  await q.run('DELETE FROM faqs WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
  res.json({ ok: true });
});

// ---------- Turnos / agenda ----------

router.get('/appointments', requireAuth, async (req, res) => {
  const { from, to } = req.query;
  let rows;
  if (from && to) {
    rows = await q.all(
      `SELECT a.*, s.name AS service_name, c.phone AS customer_phone,
              COALESCE(NULLIF(a.customer_name, ''), c.name) AS display_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.tenant_id = ? AND a.date >= ? AND a.date <= ?
       ORDER BY a.date, a.time`,
      [req.tenant.id, from, to]
    );
  } else {
    rows = await q.all(
      `SELECT a.*, s.name AS service_name, c.phone AS customer_phone,
              COALESCE(NULLIF(a.customer_name, ''), c.name) AS display_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.tenant_id = ? AND a.date >= ?
       ORDER BY a.date, a.time LIMIT 200`,
      [req.tenant.id, ymdOffset(-1)]
    );
  }
  res.json({ appointments: rows });
});

router.post('/appointments', requireAuth, async (req, res) => {
  const { date, time, service_id, customer_name, notes, duration_min } = req.body || {};
  if (!date || !time) return res.status(400).json({ error: 'Faltan fecha u hora' });
  const service = service_id
    ? await q.one('SELECT * FROM services WHERE id = ? AND tenant_id = ?', [service_id, req.tenant.id])
    : null;
  const r = await q.run(
    `INSERT INTO appointments (tenant_id, service_id, date, time, duration_min, created_via, customer_name, notes)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
    [
      req.tenant.id,
      service?.id ?? null,
      date,
      time,
      duration_min || service?.duration_min || req.tenant.slot_interval_min || 30,
      customer_name || '',
      notes || '',
    ]
  );
  res.json({ appointment: await q.one('SELECT * FROM appointments WHERE id = ?', [r.id]) });
});

router.patch('/appointments/:id', requireAuth, async (req, res) => {
  const appt = await q.one('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant.id]);
  if (!appt) return res.status(404).json({ error: 'Turno no encontrado' });
  const { status, date, time, notes } = req.body || {};
  await q.run('UPDATE appointments SET status = ?, date = ?, time = ?, notes = ? WHERE id = ?', [
    status ?? appt.status,
    date ?? appt.date,
    time ?? appt.time,
    notes ?? appt.notes,
    appt.id,
  ]);
  res.json({ appointment: await q.one('SELECT * FROM appointments WHERE id = ?', [appt.id]) });
});

router.get('/slots', requireAuth, async (req, res) => {
  const { date, duration } = req.query;
  if (!date) return res.status(400).json({ error: 'Falta la fecha' });
  res.json({ slots: await freeSlots(req.tenant, date, parseInt(duration, 10) || 30) });
});

// ---------- Clientes y conversaciones ----------

router.get('/customers', requireAuth, async (req, res) => {
  res.json({
    customers: await q.all(
      `SELECT c.*,
              (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'confirmed') AS appt_count
       FROM customers c WHERE c.tenant_id = ? ORDER BY c.last_seen DESC`,
      [req.tenant.id]
    ),
  });
});

router.get('/conversations', requireAuth, async (req, res) => {
  res.json({
    conversations: await q.all(
      `SELECT c.id AS customer_id, c.phone, c.name, c.last_seen, c.bot_paused,
              (SELECT body FROM messages m WHERE m.customer_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m WHERE m.customer_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
              (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id) AS message_count
       FROM customers c
       WHERE c.tenant_id = ? AND EXISTS (SELECT 1 FROM messages m WHERE m.customer_id = c.id)
       ORDER BY last_message_at DESC`,
      [req.tenant.id]
    ),
  });
});

// Pausar / reactivar el bot en una conversación puntual (handoff a humano)
router.post('/conversations/:customerId/bot', requireAuth, async (req, res) => {
  const customer = await q.one('SELECT * FROM customers WHERE id = ? AND tenant_id = ?', [req.params.customerId, req.tenant.id]);
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
  const paused = req.body?.paused ? 1 : 0;
  await q.run('UPDATE customers SET bot_paused = ? WHERE id = ?', [paused, customer.id]);
  res.json({ ok: true, bot_paused: paused });
});

router.get('/conversations/:customerId/messages', requireAuth, async (req, res) => {
  const customer = await q.one('SELECT * FROM customers WHERE id = ? AND tenant_id = ?', [req.params.customerId, req.tenant.id]);
  if (!customer) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({
    customer,
    messages: await q.all('SELECT * FROM messages WHERE tenant_id = ? AND customer_id = ? ORDER BY id ASC LIMIT 500', [
      req.tenant.id,
      customer.id,
    ]),
  });
});

// ---------- Stats ----------

router.get('/stats', requireAuth, async (req, res) => {
  const tid = req.tenant.id;
  const today = todayYMD();
  const weekEnd = ymdOffset(7);
  const nowTime = nowHHMM();
  const count = async (sql, params) => (await q.one(sql, params)).n;

  const stats = {
    appointmentsToday: await count(
      "SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND date = ? AND status = 'confirmed'",
      [tid, today]
    ),
    appointmentsWeek: await count(
      `SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND status = 'confirmed'
       AND date >= ? AND date < ?`,
      [tid, today, weekEnd]
    ),
    customers: await count('SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?', [tid]),
    messages: await count('SELECT COUNT(*) AS n FROM messages WHERE tenant_id = ?', [tid]),
    servicesCount: await count('SELECT COUNT(*) AS n FROM services WHERE tenant_id = ? AND active = 1', [tid]),
    simulatorMessages: await count("SELECT COUNT(*) AS n FROM messages WHERE tenant_id = ? AND via = 'simulator'", [tid]),
    botBookings: await count("SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND created_via = 'bot'", [tid]),
    nextAppointments: await q.all(
      `SELECT a.*, s.name AS service_name, COALESCE(NULLIF(a.customer_name, ''), c.name) AS display_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.tenant_id = ? AND a.status = 'confirmed'
         AND (a.date > ? OR (a.date = ? AND a.time >= ?))
       ORDER BY a.date, a.time LIMIT 5`,
      [tid, today, today, nowTime]
    ),
  };
  res.json(stats);
});

// ---------- Simulador ----------

router.post('/simulator/message', requireAuth, async (req, res) => {
  const { text, phone } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Falta el mensaje' });
  const simPhone = phone || `sim-${req.tenant.id}`;
  const tenant = await q.one('SELECT * FROM tenants WHERE id = ?', [req.tenant.id]);
  const { replies } = await handleIncoming(tenant, simPhone, text, 'simulator');
  res.json({ replies });
});

router.post('/simulator/reset', requireAuth, async (req, res) => {
  const simPhone = req.body?.phone || `sim-${req.tenant.id}`;
  const customer = await q.one('SELECT * FROM customers WHERE tenant_id = ? AND phone = ?', [req.tenant.id, simPhone]);
  if (customer) {
    await q.run('DELETE FROM bot_sessions WHERE tenant_id = ? AND customer_id = ?', [req.tenant.id, customer.id]);
    await q.run('DELETE FROM messages WHERE tenant_id = ? AND customer_id = ?', [req.tenant.id, customer.id]);
  }
  res.json({ ok: true });
});

export default router;
