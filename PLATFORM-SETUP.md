# Configuración de plataforma — Conexión WhatsApp por QR (Evolution API)

Esta guía es para **el dueño de la plataforma** (vos), una sola vez. Cuando la
completes, cada negocio conecta su WhatsApp **escaneando un QR** (como WhatsApp
Web), sin trámites de Meta, sin verificación, sin tokens.

Usamos **Evolution API**, una API no oficial de WhatsApp (open source, gratuita)
que se conecta vía Baileys. Vos la hospedás una vez y todos tus clientes la
usan: cada negocio = una "instancia" con su propio QR.

> ⚠️ **Importante:** Evolution API es **no oficial** y va contra los términos de
> WhatsApp. Meta puede banear el número de un cliente en cualquier momento. El
> riesgo es bajo para un bot que responde (no hace spam), pero no es cero. Es
> ideal para validar y arrancar; para algo a prueba de todo, la API oficial de
> Meta es más sólida (ver historial del proyecto).

## Requisitos

- Una cuenta en Railway (o un VPS) para hospedar Evolution API.
- Tu app de TurnoBot ya desplegada (ver `DEPLOY.md`).

## Paso 1 — Desplegar Evolution API en Railway

Evolution necesita su propia base de datos PostgreSQL. La forma más simple:

1. En tu proyecto de Railway → **New → Database → PostgreSQL** (una base aparte
   para Evolution, distinta de la de TurnoBot). Copiá su `DATABASE_URL`.
2. **New → Empty Service → Deploy from Docker Image**, imagen:
   ```
   atendai/evolution-api:v2.1.1
   ```
3. En ese servicio → **Variables**, cargá:
   ```
   AUTHENTICATION_API_KEY = <inventá-una-clave-larga-y-secreta>
   DATABASE_PROVIDER = postgresql
   DATABASE_CONNECTION_URI = <la DATABASE_URL del Postgres de Evolution>
   DATABASE_SAVE_DATA_INSTANCE = true
   CACHE_LOCAL_ENABLED = true
   CACHE_REDIS_ENABLED = false
   ```
4. En ese servicio → **Settings → Networking → Generate Domain**. Te da la URL de
   Evolution, p.ej. `https://evolution-production-xxxx.up.railway.app`.

## Paso 2 — Conectar TurnoBot con Evolution

En el servicio **de TurnoBot** (no el de Evolution) → **Variables**, agregá:

```
EVOLUTION_API_URL = https://evolution-production-xxxx.up.railway.app
EVOLUTION_API_KEY = <la misma AUTHENTICATION_API_KEY del paso 1>
APP_URL = https://turnobot-production.up.railway.app   (tu dominio de TurnoBot)
```

`APP_URL` es importante: es la URL a la que Evolution le manda los mensajes
entrantes (el webhook). TurnoBot la usa para configurar cada instancia.

Railway redeploya TurnoBot solo. Listo: la página "Conexión WhatsApp" detecta que
Evolution está disponible y muestra el botón **Generar código QR**.

## Cómo lo vive tu cliente (negocio)

1. Entra a su panel → **Conexión WhatsApp** → **Generar código QR**.
2. En su celular: WhatsApp → **Dispositivos vinculados → Vincular un dispositivo**.
3. Escanea el QR. En unos segundos queda conectado y el bot responde solo.

No pierde su WhatsApp: lo sigue usando normal en el teléfono (es como WhatsApp Web).

## Qué hace TurnoBot automáticamente

Cuando el cliente toca "Generar código QR", el servidor:

1. Crea una **instancia** en Evolution para ese negocio.
2. Le configura el **webhook** apuntando a `APP_URL/api/webhook`.
3. Muestra el **QR** y consulta el estado hasta que conecta.
4. Al conectar, guarda el número y marca el WhatsApp como activo.

Desde ahí, cada mensaje que reciba ese WhatsApp llega al webhook, TurnoBot lo
rutea al negocio correcto (por el nombre de instancia) y el bot responde.

## Notas de producción

- **Recursos:** cada instancia mantiene una conexión viva. Con muchos clientes,
  Evolution necesita bastante RAM. Monitoreá el servicio de Evolution.
- **Reconexión:** si una sesión se cae (WhatsApp lo permite por inactividad o
  cambios de Meta), el cliente vuelve a escanear el QR desde su panel.
- **Botones:** los botones nativos de WhatsApp son inestables vía Baileys, así que
  el bot usa el menú de texto numerado (funciona siempre).
- **Backups:** la base de Evolution guarda las sesiones; si la perdés, los clientes
  tienen que reconectar. Railway hace backups del Postgres.
