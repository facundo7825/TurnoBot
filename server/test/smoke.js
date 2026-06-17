/**
 * Smoke test del motor del bot: crea un tenant de prueba directamente en la DB
 * y simula una conversación completa de reserva.
 *
 * Por defecto usa SQLite. Para probar contra Postgres:
 *   DATABASE_URL=postgres://... node test/smoke.js
 */
import { q, initDb } from '../src/database.js';
import { handleIncoming } from '../src/engine.js';

await initDb();

// Tenant de prueba aislado
await q.run("DELETE FROM users WHERE email = 'smoke@test.local'");
const u = await q.run("INSERT INTO users (email, password_hash, name) VALUES ('smoke@test.local', 'x', 'Smoke')");
const t = await q.run(
  `INSERT INTO tenants (user_id, business_name, business_type, wa_verify_token)
   VALUES (?, 'Peluquería Smoke', 'peluqueria', ?)`,
  [u.id, 'smoke_token_' + Math.random().toString(36).slice(2, 8)]
);
const tenantId = t.id;

for (let d = 0; d <= 6; d++) {
  await q.run('INSERT INTO working_hours (tenant_id, weekday, open_time, close_time, enabled) VALUES (?, ?, ?, ?, 1)', [
    tenantId,
    d,
    '09:00',
    '18:00',
  ]);
}

await q.run("INSERT INTO services (tenant_id, name, duration_min, price) VALUES (?, 'Corte de pelo', 30, 5000)", [tenantId]);
await q.run("INSERT INTO services (tenant_id, name, duration_min, price) VALUES (?, 'Color', 90, 15000)", [tenantId]);
await q.run(
  "INSERT INTO faqs (tenant_id, question, keywords, answer) VALUES (?, '¿Aceptan tarjeta?', 'tarjeta,debito,credito', 'Sí, aceptamos todas las tarjetas 💳')",
  [tenantId]
);

const tenant = await q.one('SELECT * FROM tenants WHERE id = ?', [tenantId]);
const phone = '5491100000001';

let failures = 0;
async function send(text, expectIncludes) {
  const { replies } = await handleIncoming(tenant, phone, text, 'simulator', '');
  const joined = replies.map((r) => r.text).join('\n---\n');
  const ok = expectIncludes.every((e) => joined.toLowerCase().includes(e.toLowerCase()));
  if (!ok) {
    failures++;
    console.log(`✗ "${text}" — esperaba ${JSON.stringify(expectIncludes)}\n   recibí: ${joined.slice(0, 300)}`);
  } else {
    console.log(`✓ "${text}" → ${replies.length} respuesta(s)`);
  }
  return replies;
}

console.log('--- Conversación de reserva ---');
await send('hola', ['Peluquería Smoke', 'Reservar']);
await send('1', ['Corte de pelo', 'Color']);
await send('1', ['día']);
await send('1', ['Horarios disponibles']);
await send('1', ['nombre']);
await send('Facundo', ['Confirmá']);
await send('si', ['Turno confirmado']);

const appt = await q.one("SELECT * FROM appointments WHERE tenant_id = ? AND created_via = 'bot'", [tenantId]);
if (!appt) {
  failures++;
  console.log('✗ No se creó el turno en la base');
} else {
  console.log(`✓ Turno creado: ${appt.date} ${appt.time} (${appt.customer_name})`);
}

console.log('--- Confirmación de asistencia ---');
await send('confirmo', ['Gracias', 'confirmado']);
const confirmed = await q.one('SELECT confirmed_by_customer FROM appointments WHERE id = ?', [appt.id]);
if (!confirmed?.confirmed_by_customer) {
  failures++;
  console.log('✗ El turno no quedó marcado como confirmado por el cliente');
} else {
  console.log('✓ Turno marcado como confirmado por el cliente');
}

console.log('--- Botón cancelar del recordatorio ---');
await send(`cancelar_${appt.id}`, ['cancelé']);
const cancelledAppt = await q.one('SELECT status FROM appointments WHERE id = ?', [appt.id]);
if (cancelledAppt.status !== 'cancelled') {
  failures++;
  console.log('✗ El botón cancelar no canceló el turno');
} else {
  console.log('✓ Botón cancelar liberó el turno');
}

// Re-reservar para probar "mis turnos" y la cancelación por menú
await send('1', []);
await send('1', []);
await send('1', []);
await send('1', []);
await send('si', ['confirmado']);

console.log('--- Mis turnos / cancelar ---');
await send('2', ['próximos turnos']);
await send('3', ['cancelar']);
await send('1', ['cancelé']);

console.log('--- FAQ por palabra clave ---');
await send('aceptan tarjeta?', ['tarjetas']);

console.log('--- Info ---');
await send('4', ['Horarios de atención']);

console.log('--- Handoff a humano ---');
await send('quiero hablar con un humano', ['persona']);
const paused = await q.one('SELECT bot_paused FROM customers WHERE tenant_id = ? AND phone = ?', [tenantId, phone]);
if (!paused?.bot_paused) {
  failures++;
  console.log('✗ El bot no se pausó tras pedir un humano');
} else {
  console.log('✓ Bot pausado tras pedir un humano');
}
const { replies: silent } = await handleIncoming(tenant, phone, 'hola', 'simulator', '');
if (silent.length !== 0) {
  failures++;
  console.log(`✗ El bot respondió estando pausado (${silent.length} respuestas)`);
} else {
  console.log('✓ Bot en silencio mientras está pausado');
}

// Limpieza
await q.run("DELETE FROM users WHERE email = 'smoke@test.local'");

console.log(failures ? `\n${failures} FALLAS` : '\nTODO OK ✅');
process.exit(failures ? 1 : 0);
