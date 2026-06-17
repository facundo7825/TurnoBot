import Anthropic from '@anthropic-ai/sdk';
import { q } from './database.js';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

async function buildSystemPrompt(tenant) {
  const services = await q.all(
    'SELECT name, duration_min, price FROM services WHERE tenant_id = ? AND active = 1 ORDER BY position, id',
    [tenant.id]
  );
  const hours = await q.all(
    'SELECT weekday, open_time, close_time FROM working_hours WHERE tenant_id = ? AND enabled = 1 ORDER BY weekday',
    [tenant.id]
  );
  const faqs = await q.all('SELECT question, answer FROM faqs WHERE tenant_id = ?', [tenant.id]);

  const serviceList = services.map((s) => `- ${s.name} (${s.duration_min} min${s.price ? `, $${s.price}` : ''})`).join('\n');
  const hourList = hours.map((h) => `- ${DAY_NAMES[h.weekday]}: ${h.open_time} a ${h.close_time}`).join('\n');
  const faqList = faqs.map((f) => `P: ${f.question}\nR: ${f.answer}`).join('\n\n');

  return `Sos el asistente virtual de WhatsApp de "${tenant.business_name}"${tenant.business_type ? ` (${tenant.business_type})` : ''}.
${tenant.description ? `Sobre el negocio: ${tenant.description}` : ''}
${tenant.address ? `Dirección: ${tenant.address}` : ''}

Servicios disponibles:
${serviceList || '(sin servicios cargados)'}

Horarios de atención:
${hourList || '(sin horarios cargados)'}

${faqList ? `Preguntas frecuentes:\n${faqList}` : ''}

${tenant.ai_instructions ? `Instrucciones del dueño del negocio:\n${tenant.ai_instructions}` : ''}

Reglas:
- Respondé en español, breve y cordial, como un mensaje de WhatsApp (máximo 3 o 4 oraciones).
- Si el cliente quiere reservar, consultar o cancelar un turno, indicale que escriba "menu" para usar el menú de turnos.
- No inventes servicios, precios ni horarios que no estén listados.
- Si no sabés la respuesta, decilo y ofrecé que un humano lo contacte.
- Respondé solo con el mensaje final, sin razonamiento ni meta-comentarios.`;
}

/**
 * Respuesta libre con Claude usando la API key del tenant.
 * history: [{role:'user'|'assistant', content:string}, ...] (último mensaje incluido)
 */
export async function aiReply(tenant, history) {
  if (!tenant.ai_enabled || !tenant.anthropic_api_key) return null;
  try {
    const client = new Anthropic({ apiKey: tenant.anthropic_api_key });
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: await buildSystemPrompt(tenant),
      messages: history,
    });
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return text || null;
  } catch (err) {
    console.error(`[ai] tenant ${tenant.id}:`, err.message);
    return null;
  }
}

/** Historial reciente de la conversación en formato Messages API. */
export async function recentHistory(tenantId, customerId, limit = 10) {
  const rows = (
    await q.all(
      `SELECT direction, body FROM messages WHERE tenant_id = ? AND customer_id = ?
       ORDER BY id DESC LIMIT ?`,
      [tenantId, customerId, limit]
    )
  ).reverse();

  const history = [];
  for (const r of rows) {
    const role = r.direction === 'in' ? 'user' : 'assistant';
    if (history.length && history[history.length - 1].role === role) {
      history[history.length - 1].content += '\n' + r.body;
    } else {
      history.push({ role, content: r.body });
    }
  }
  // La API exige que el primer mensaje sea del usuario
  while (history.length && history[0].role !== 'user') history.shift();
  return history;
}
