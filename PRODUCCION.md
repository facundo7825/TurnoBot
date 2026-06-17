# Plan de robustez para producción

Estado actual: TurnoBot corre en **Railway** (app Node + Postgres) y **Evolution API**
(otro servicio + su Postgres) en el mismo proyecto. Es una base sólida para arrancar.
Este documento es el plan para endurecerla a medida que el negocio crezca — **no hace
falta hacer todo de una**. Está ordenado por prioridad/esfuerzo.

> Regla general: el eslabón más frágil **no es Railway ni Postgres** (están bien), sino
> **Evolution API** (no oficial: sesiones que se caen, versiones que se rompen). Casi
> todo este plan apunta a *enterarte rápido* cuando algo falla y a *no perder datos*.

---

## 🟢 Prioridad 1 — Hacer YA (bajo esfuerzo, alto impacto)

Lo mínimo para vender tranquilo. Son horas, no días.

### 1.1 Monitor de uptime con alertas

**Por qué:** hoy, si TurnoBot o Evolution se caen, te enterás cuando un cliente se queja.
Un monitor te avisa en minutos.

**Cómo:**
- Crear cuenta gratis en **UptimeRobot** (uptimerobot.com) o **Better Stack**.
- Monitor 1: `https://turnobot-production.up.railway.app/api/health` cada 5 min.
- Monitor 2: la URL de Evolution (el "Welcome") cada 5 min.
- Configurar alerta por **email** (y si se puede, WhatsApp/Telegram).
- Esfuerzo: ~15 min. Costo: gratis.

### 1.2 Health check más completo

**Por qué:** el `/api/health` actual solo dice "el server está vivo", pero no si la base
o Evolution responden. Un health que chequee esas dependencias hace que el monitor
detecte problemas reales, no solo caídas totales.

**Cómo (cuando se implemente):**
- Extender `GET /api/health` para que verifique:
  - Una query trivial a Postgres (`SELECT 1`).
  - Un ping a Evolution (`GET /` con la API key).
- Devolver `200` solo si todo responde; `503` si algo falla, con detalle de qué.
- Archivo: `server/src/index.js`.

### 1.3 Verificar y probar backups de Postgres

**Por qué:** la base de TurnoBot tiene los turnos y clientes — es lo que más duele perder.
Railway hace backups, pero un backup que nunca probaste restaurar no es un backup confiable.

**Cómo:**
- En Railway → Postgres de TurnoBot → revisar política de backups (frecuencia, retención).
- Hacer una **restauración de prueba** a una base temporal para confirmar que funciona.
- Opcional: un `pg_dump` semanal a un storage externo (Google Drive, S3) como respaldo extra.

### 1.4 Vigilar los recursos de Evolution

**Por qué:** cada cliente de WhatsApp conectado consume RAM en Evolution. Es el primer
componente que se queda corto al crecer.

**Cómo:**
- En Railway → servicio de Evolution → pestaña **Metrics**: mirar uso de RAM/CPU.
- Anotar cuánta RAM usa con X clientes para proyectar cuándo subir el plan.

---

## 🟡 Prioridad 2 — Cuando haya tracción (primeros clientes pagando)

### 2.1 Observabilidad de errores (Sentry)

**Por qué:** los `console.error` se pierden. Sentry te junta los errores reales con
contexto (qué tenant, qué endpoint, stack trace) y te alerta.

**Cómo:**
- Cuenta gratis en sentry.io → crear proyecto Node.
- Integrar el SDK en `server/src/index.js` (captura global de errores).
- Esfuerzo: ~1 hora.

### 2.2 Separar el worker de recordatorios

**Por qué:** hoy los recordatorios y el resumen diario corren con `setInterval` dentro
del proceso de la app. Si algún día corrés **varias instancias** de TurnoBot para
aguantar tráfico, esos loops se duplican → cada cliente recibiría el recordatorio N veces.

**Cómo:**
- Separar `reminders.js` en un **servicio worker** aparte (un segundo servicio en Railway
  que corra solo los loops, con 1 sola instancia).
- O usar una cola (BullMQ + Redis) si se quiere robustez de reintentos.
- Mientras corras **una sola** instancia de la app, esto NO es urgente.

### 2.3 Logs estructurados

**Por qué:** para diagnosticar problemas con muchos tenants, conviene logs con formato
(tenant, acción, resultado) en vez de texto suelto.

**Cómo:** sumar `pino` o similar en el server.

---

## 🔴 Prioridad 3 — Escala / decisiones de fondo (más adelante)

### 3.1 Reconsiderar Evolution vs API oficial de Meta

**Por qué:** Evolution es gratis y sin trámites, pero tiene riesgo de ban y se rompe sola.
A medida que tengas clientes que pagan y dependen del servicio, el riesgo pesa más.

**Opciones a futuro:**
- Ofrecer **dos planes**: básico con Evolution (barato, con su riesgo) y premium con la
  API oficial de Meta (más caro, sin riesgo de ban). El código ya pasó por las dos, así
  que volver a soportar Meta es factible.
- Para la API oficial necesitás el monotributo + verificación de Meta (ver historial).

### 3.2 Postgres con mejor tier / dedicado

**Por qué:** el Postgres de Railway tiene límites. A escala (miles de turnos/clientes),
puede convenir Neon o Supabase con backups y réplicas más serias.

**Cómo:** como la app ya usa `DATABASE_URL`, migrar es cambiar esa variable + importar datos.

### 3.3 Alta disponibilidad

**Por qué:** hoy dependés 100% de Railway (un proveedor, sin failover). Para misión crítica
con muchos clientes, evaluar redundancia. Para un SaaS chico, NO es necesario.

### 3.4 Reconexión automática de Evolution

**Por qué:** si una sesión de WhatsApp de un cliente se cae, hoy el cliente tiene que
volver a escanear el QR. Se podría detectar la desconexión (evento `connection.update`
del webhook) y avisarle automáticamente al dueño para que reconecte.

---

## Resumen de "qué hago primero"

1. **Monitor de uptime** (15 min, gratis) → la mejor relación esfuerzo/beneficio.
2. **Probar un backup** de la base de TurnoBot.
3. **Mirar la RAM de Evolution** de vez en cuando.

Con esos tres, ya operás con red de seguridad. El resto se suma cuando el negocio lo pida.
