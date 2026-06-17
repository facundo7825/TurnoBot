import { q } from './database.js';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function dateToYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ymdToDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateHuman(ymd) {
  const d = ymdToDate(ymd);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

// ---- Helpers de fecha/hora (reemplazan funciones SQL específicas de SQLite) ----
// Usan la hora local del proceso; en producción se setea TZ=America/Argentina/Buenos_Aires.

/** Fecha civil de hoy 'YYYY-MM-DD' (hora local). */
export function todayYMD() {
  return dateToYMD(new Date());
}

/** Fecha civil de hoy +/- n días 'YYYY-MM-DD'. */
export function ymdOffset(days) {
  const now = new Date();
  return dateToYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

/** Hora actual 'HH:MM' (local). */
export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Timestamp de auditoría 'YYYY-MM-DD HH:MM:SS' en UTC (igual que CURRENT_TIMESTAMP). */
export function nowTimestampUTC() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/** Días (YYYY-MM-DD) con atención dentro del horizonte de reserva, desde hoy. */
export async function availableDays(tenant) {
  const hours = await q.all('SELECT * FROM working_hours WHERE tenant_id = ? AND enabled = 1', [tenant.id]);
  const enabledWeekdays = new Set(hours.map((h) => h.weekday));
  const days = [];
  const today = new Date();
  for (let i = 0; i < (tenant.booking_horizon_days || 14) && days.length < 7; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (!enabledWeekdays.has(d.getDay())) continue;
    const ymd = dateToYMD(d);
    if ((await freeSlots(tenant, ymd, 30)).length === 0) continue;
    days.push(ymd);
  }
  return days;
}

/** Horarios libres (HH:MM) para una fecha y duración dadas. */
export async function freeSlots(tenant, ymd, durationMin) {
  const weekday = ymdToDate(ymd).getDay();
  const wh = await q.one('SELECT * FROM working_hours WHERE tenant_id = ? AND weekday = ? AND enabled = 1', [
    tenant.id,
    weekday,
  ]);
  if (!wh) return [];

  const interval = tenant.slot_interval_min || 30;
  const open = toMinutes(wh.open_time);
  const close = toMinutes(wh.close_time);

  const appts = (
    await q.all("SELECT time, duration_min FROM appointments WHERE tenant_id = ? AND date = ? AND status = 'confirmed'", [
      tenant.id,
      ymd,
    ])
  ).map((a) => ({ start: toMinutes(a.time), end: toMinutes(a.time) + a.duration_min }));

  const now = new Date();
  const isToday = ymd === dateToYMD(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let t = open; t + durationMin <= close; t += interval) {
    if (isToday && t <= nowMin) continue;
    const overlaps = appts.some((a) => t < a.end && t + durationMin > a.start);
    if (!overlaps) slots.push(toHHMM(t));
  }
  return slots;
}

export async function createAppointment(
  tenant,
  { customerId, serviceId, date, time, durationMin, customerName, via, notes }
) {
  const result = await q.run(
    `INSERT INTO appointments (tenant_id, customer_id, service_id, date, time, duration_min, status, created_via, customer_name, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
    [tenant.id, customerId ?? null, serviceId ?? null, date, time, durationMin, via || 'manual', customerName || '', notes || '']
  );
  return q.one('SELECT * FROM appointments WHERE id = ?', [result.id]);
}
