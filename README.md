# 🤖 TurnoBot

Plataforma SaaS para que cualquier negocio (peluquería, consultorio, estética, hotel…) cree su **bot de WhatsApp** que responde solo y gestiona la **agenda de turnos** automáticamente.

Cada usuario se registra, configura su negocio (servicios, horarios, mensajes, FAQs), conecta su número con la **API oficial de WhatsApp Cloud (Meta)** y el bot se encarga del resto: responde clientes 24/7, ofrece turnos disponibles, reserva, consulta y cancela — todo queda registrado en la agenda del panel.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + Express. **PostgreSQL** en producción, **SQLite** en desarrollo (mismo código, se elige por `DATABASE_URL`) |
| Auth | JWT + bcrypt |
| WhatsApp | Meta WhatsApp Cloud API (webhook multi-tenant, ruteo por `phone_number_id`) |
| IA opcional | Claude (`@anthropic-ai/sdk`) con API key por negocio |
| Frontend | React 18 + Vite, diseño dark "consola nocturna" |

## Cómo correrlo

```bash
# 1. Instalar dependencias (raíz, server y web)
npm install
npm install --prefix server
npm install --prefix web

# 2. Levantar todo en modo desarrollo
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000

La base de datos se crea sola: en desarrollo es SQLite en `server/data/turnobot.db` (no necesitás
instalar nada). En producción usás PostgreSQL seteando `DATABASE_URL` — ver `DEPLOY.md`.

> ⚠️ Si `npm install` falla con `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (típico cuando un antivirus
> intercepta TLS), instalá así: entrá a la carpeta (`cd server` / `cd web`) y corré
> `NODE_TLS_REJECT_UNAUTHORIZED=0 npm install --strict-ssl=false`.

### Tests

```bash
node server/test/smoke.js   # simula una conversación completa de reserva (SQLite)

# El mismo test contra Postgres (valida el dialecto):
DATABASE_URL=postgres://usuario:pass@host:5432/db node server/test/smoke.js
```

### Base de datos: SQLite (dev) ↔ Postgres (prod)

La capa `server/src/database.js` expone una API async única (`q.one/all/run/exec`) y elige el motor
según `DATABASE_URL`: si está vacío usa SQLite (archivo local); si tiene una URL `postgres://` usa
PostgreSQL. La aplicación escribe SQL portable (placeholders `?`, traducidos a `$n` en Postgres) y las
fechas se calculan en JS, así el mismo código corre idéntico en ambos motores. Para pasar a producción
solo seteás `DATABASE_URL` — no hay que cambiar código. Ver **`DEPLOY.md`**.

### Producción (un solo proceso)

```bash
npm run build          # compila el frontend a web/dist
npm start              # el server sirve la API y el frontend en :4000
```

Variables de entorno opcionales del server:

| Variable | Uso |
|---|---|
| `PORT` | Puerto del server (default 4000) |
| `JWT_SECRET` | Secreto para firmar tokens (¡cambiar en producción!) |
| `WEBHOOK_VERIFY_TOKEN` | Verify token global extra para el webhook de Meta |

## Flujo del usuario (dueño del negocio)

1. **Se registra** en la web → se crea su negocio (tenant) con horarios por defecto.
2. En **Mi bot** configura: mensajes, servicios (nombre/duración/precio), horarios por día, FAQs por palabras clave y, si quiere, la IA con su API key de Anthropic.
3. En **Simulador** prueba el bot exactamente como lo vería un cliente (sin necesidad de conectar nada).
4. En **Conexión WhatsApp** sigue el wizard para conectar su número con Meta:
   - Crea una app Business en [developers.facebook.com](https://developers.facebook.com/apps) con el producto WhatsApp.
   - Copia el **Phone Number ID** y un **Access Token**.
   - Configura el **webhook** apuntando a `https://TU-DOMINIO/api/webhook` con su verify token (autogenerado) y se suscribe al campo `messages`.
   - Pega las credenciales en el panel y verifica la conexión.
5. **Agenda**: ve la semana completa, crea turnos manuales, cancela o completa turnos. Los turnos del bot aparecen marcados con 🤖.
6. **Conversaciones**: historial completo de cada cliente con el bot.

> 💡 Para probar el webhook desde una PC local, exponé el puerto con `ngrok http 4000` y usá esa URL HTTPS en Meta.

## Qué hace el bot con los clientes

- Saluda con mensaje de bienvenida configurable y muestra un menú numerado.
- **1** Reservar turno → servicio → día con disponibilidad real → horario libre → nombre → confirmación. Verifica superposiciones y horarios de atención.
- **2** Ver turnos próximos.
- **3** Cancelar un turno.
- **4** Horarios y ubicación del negocio.
- **5** Consulta libre → responde por FAQs (palabras clave) o con IA (Claude) si está activada; si no, mensaje de fallback configurable.
- `menu` en cualquier momento vuelve al inicio.
- En WhatsApp real usa **botones y listas nativas** (mensajes interactivos de Meta); si hay más de 10 opciones cae a texto numerado. El simulador muestra las mismas opciones como chips clickeables.
- **Recordatorios automáticos**: el día anterior al turno le manda un WhatsApp al cliente (configurable en Mi bot → Avisos).
- **Aviso al dueño**: cada vez que el bot reserva, le llega un WhatsApp al número del dueño (configurable en Mi bot → Avisos).

Al registrarse, cada negocio arranca con **servicios y FAQs precargados según su rubro** (editables), y el Dashboard muestra un **checklist de puesta en marcha** (cargar servicios → probar el simulador → conectar WhatsApp).

## Arquitectura multi-tenant

- Un solo webhook `/api/webhook` para todos los negocios: Meta manda `metadata.phone_number_id` en cada mensaje y el server enruta al tenant correcto.
- La verificación GET del webhook acepta el verify token de cualquier tenant (cada cuenta tiene el suyo autogenerado).
- Cada tenant guarda sus propias credenciales de Meta y su propia API key de Anthropic (nunca se devuelven al frontend, solo un flag de "configurada").
- El motor conversacional (`server/src/engine.js`) es compartido por el webhook real y el simulador del panel: lo que ves en el simulador es exactamente lo que recibe el cliente.

## Estructura

```
server/
  src/
    index.js      # Express, sirve API + frontend compilado
    db.js         # esquema SQLite multi-tenant
    auth.js       # JWT + bcrypt
    routes.js     # API del panel (tenant, servicios, horarios, faqs, agenda, stats, simulador)
    webhook.js    # webhook de Meta (GET verificación + POST mensajes)
    engine.js     # motor conversacional (máquina de estados de reservas)
    booking.js    # disponibilidad y slots libres
    whatsapp.js   # envío por Graph API + verificación de credenciales
    ai.js         # respuestas libres con Claude (opcional, por tenant)
web/
  src/
    pages/        # Landing, Login, Registro, Dashboard, Agenda, Mi bot, Conversaciones, WhatsApp, Simulador
    components/   # Shell (sidebar)
    styles.css    # sistema de diseño dark
```
