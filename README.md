# 🤖 TurnoBot

> Plataforma SaaS para que cualquier negocio cree su **bot de WhatsApp** que atiende solo y gestiona la **agenda de turnos** automáticamente.

Pensada para peluquerías, barberías, estética, consultorios, gimnasios, hoteles, gastronomía y cualquier negocio que trabaje con turnos. Cada negocio se registra, configura su bot en minutos, conecta su WhatsApp **escaneando un QR** (como WhatsApp Web) y listo: el bot responde a sus clientes 24/7, ofrece los horarios disponibles, reserva, recuerda y cancela turnos — todo queda registrado en el panel.

**Estado:** en producción (Railway + PostgreSQL + Evolution API).

---

## ✨ Características

**Para el dueño del negocio (panel web):**
- 📊 **Dashboard** con métricas (turnos del día/semana, clientes, reservas del bot) y un checklist de puesta en marcha.
- 🗓️ **Agenda semanal** para ver, crear, cancelar y completar turnos. Los del bot aparecen marcados con 🤖 y muestran si el cliente confirmó asistencia.
- ⌬ **Configuración del bot** sin código: mensajes, servicios (duración y precio), horarios por día, preguntas frecuentes por palabras clave.
- ✦ **IA opcional** (Claude): si el dueño carga su API key, el bot responde preguntas libres con el contexto del negocio.
- ◳ **Conversaciones**: historial completo de cada cliente, con opción de **pausar el bot** y atender a mano.
- ▷ **Simulador**: prueba el bot exactamente como lo vería un cliente, sin conectar nada.
- 🧩 **Plantillas por rubro**: al registrarse, el negocio arranca con servicios y FAQs típicos de su rubro (editables).

**Lo que hace el bot solo con los clientes:**
- 💬 Atiende por **menú** (reservar, ver turnos, cancelar, horarios/ubicación, consulta libre).
- 📅 **Reserva turnos** ofreciendo solo días y horarios con disponibilidad real (verifica superposiciones y horarios de atención).
- ⏰ **Recordatorio automático** el día anterior, con opción de **confirmar o cancelar** (si cancela, el horario se libera solo).
- ☀️ **Resumen diario** al dueño cada mañana con la agenda del día.
- 🙋 **Derivación a humano**: si el cliente pide hablar con una persona, el bot se pausa en esa conversación y le avisa al dueño.
- 🔔 **Aviso al dueño** cada vez que el bot reserva un turno.

---

## 🧱 Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + Express |
| Base de datos | **PostgreSQL** en producción · **SQLite** en desarrollo (mismo código, se elige por `DATABASE_URL`) |
| Auth | JWT + bcrypt |
| WhatsApp | **Evolution API** (vía QR/Baileys) — webhook multi-tenant, ruteo por instancia |
| IA opcional | Claude (`@anthropic-ai/sdk`), API key por negocio |
| Frontend | React 18 + Vite — diseño dark "consola nocturna" |
| Deploy | Railway (un solo proceso sirve API + frontend) |

---

## 🚀 Cómo se usa (dueño del negocio)

1. **Se registra** → se crea su negocio con horarios y plantilla de su rubro por defecto.
2. En **Mi bot** ajusta mensajes, servicios, horarios, FAQs y (opcional) la IA.
3. En **Simulador** prueba el bot como si fuera un cliente.
4. En **Conexión WhatsApp** vincula su número escaneando un **QR** (WhatsApp → Dispositivos vinculados → Vincular un dispositivo). En segundos el bot empieza a responder.
5. Gestiona todo desde la **Agenda** y **Conversaciones**.

---

## 🏗️ Arquitectura multi-tenant

- Cada negocio tiene su propia **instancia** en Evolution API, conectada por QR.
- Un único webhook `/api/webhook` recibe el evento `messages.upsert` de Evolution con el nombre de instancia, y el server enruta el mensaje al negocio correcto.
- Cada negocio solo accede a sus propios datos (todas las consultas filtran por `tenant_id`).
- El **motor conversacional** (`server/src/engine.js`) es el mismo para el WhatsApp real y para el simulador: lo que ves en el simulador es exactamente lo que recibe el cliente.

---

## 💻 Correr en local (desarrollo)

```bash
# Instalar dependencias
npm install
cd server && npm install && cd ..
cd web && npm install && cd ..

# Levantar todo en modo desarrollo
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000

En desarrollo usa **SQLite** automáticamente (`server/data/turnobot.db`) — no necesitás instalar ninguna base. El simulador funciona sin conectar WhatsApp.

> ⚠️ Si `npm install` falla con `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (un antivirus/proxy interceptando TLS), instalá con: `NODE_TLS_REJECT_UNAUTHORIZED=0 npm install --strict-ssl=false`.

### Tests

```bash
node server/test/smoke.js   # simula una conversación completa de reserva (SQLite)

# El mismo test contra Postgres (valida el dialecto SQL):
DATABASE_URL=postgres://usuario:pass@host:5432/db node server/test/smoke.js
```

---

## 📦 Despliegue

El proyecto está listo para Railway (incluye `railway.json` y el script `deploy:build`). El paso a paso completo está en **[`DEPLOY.md`](DEPLOY.md)**.

En resumen: se crea una base PostgreSQL, se setea `DATABASE_URL` + `JWT_SECRET` (+ las de Evolution), y Railway buildea y arranca solo. Para habilitar la conexión de WhatsApp por QR hay que hospedar Evolution API — guía en **[`PLATFORM-SETUP.md`](PLATFORM-SETUP.md)**.

### Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres en producción (vacío = SQLite local) |
| `JWT_SECRET` | Secreto para firmar sesiones (**obligatorio en producción**) |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` | Servidor de Evolution API para WhatsApp |
| `APP_URL` | URL pública de la app (para el webhook de Evolution) |
| `TZ` | Zona horaria (ej: `America/Argentina/Buenos_Aires`) |
| `PORT` | Puerto del server (default 4000) |

---

## 📚 Documentación

| Documento | Contenido |
|---|---|
| [`DEPLOY.md`](DEPLOY.md) | Despliegue paso a paso en Railway (app + Postgres) |
| [`PLATFORM-SETUP.md`](PLATFORM-SETUP.md) | Hospedar Evolution API para la conexión de WhatsApp por QR |
| [`PRODUCCION.md`](PRODUCCION.md) | Plan de robustez para producción (uptime, backups, observabilidad, escala) |
| [`SEGURIDAD.md`](SEGURIDAD.md) | Auditoría y plan de seguridad del SaaS |

---

## 🗂️ Estructura

```
server/
  src/
    index.js      # Express: inicializa la base, sirve API + frontend compilado
    database.js   # capa de datos async dual (Postgres/SQLite) + esquema y migraciones
    env.js        # carga server/.env
    auth.js       # JWT + bcrypt
    routes.js     # API del panel (tenant, servicios, horarios, FAQs, agenda, stats, simulador, WhatsApp)
    webhook.js    # webhook de Evolution (messages.upsert → motor)
    engine.js     # motor conversacional (máquina de estados de reservas)
    booking.js    # disponibilidad, horarios libres y helpers de fecha
    whatsapp.js   # Evolution API: instancias, QR, estado de conexión, envío
    reminders.js  # recordatorios + resumen diario (loops en segundo plano)
    ai.js         # respuestas libres con Claude (opcional, por negocio)
  test/
    smoke.js      # test del motor del bot (reserva, confirmación, cancelación, handoff)
web/
  src/
    pages/        # Landing, Login, Registro, Dashboard, Agenda, Mi bot, Conversaciones, WhatsApp, Simulador
    components/   # Shell (sidebar de navegación)
    styles.css    # sistema de diseño dark
```

---

## ⚠️ Nota sobre Evolution API

Evolution API es una integración **no oficial** de WhatsApp (vía Baileys). Es gratuita y no requiere trámites de verificación, ideal para arrancar y validar. A tener en cuenta: WhatsApp puede restringir un número que use APIs no oficiales (riesgo bajo para un bot que solo responde, pero no nulo) y, al depender de WhatsApp Web, conviene mantener Evolution en una versión reciente. Para un servicio a gran escala o de misión crítica puede evaluarse la API oficial de Meta (el proyecto pasó por ambas integraciones).
