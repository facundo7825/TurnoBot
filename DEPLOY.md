# Despliegue a producción

TurnoBot corre como **un solo proceso Node** que sirve la API y el frontend compilado, con
**PostgreSQL** como base de datos. Necesitás un host que mantenga el proceso siempre vivo
(Railway, Render, Fly.io o un VPS) — **no** sirve hosting serverless tipo Vercel, porque el bot
necesita el proceso vivo para el webhook y los trabajos en segundo plano (recordatorios, resumen).

## 1. Base de datos PostgreSQL

Creá una base administrada (cualquiera de estas tiene plan gratis para empezar):

- **[Neon](https://neon.tech)** — Postgres serverless, backups automáticos. Recomendado.
- **[Supabase](https://supabase.com)** — Postgres + panel de administración.
- **Railway / Render** — pueden crear la Postgres junto al servicio web.

Copiá la **connection string**, que se ve así:

```
postgresql://usuario:password@host.neon.tech:5432/turnobot?sslmode=require
```

La app crea las tablas sola la primera vez que arranca (no hay que correr migraciones a mano).

## 2. Variables de entorno

Configurá estas variables en el panel del host (o en `server/.env` en un VPS):

| Variable | Obligatoria | Valor |
|---|---|---|
| `DATABASE_URL` | ✅ | La connection string de Postgres del paso 1 |
| `JWT_SECRET` | ✅ | Un texto largo y aleatorio (firma las sesiones) |
| `TZ` | recomendada | `America/Argentina/Buenos_Aires` (afecta "hoy" y los horarios) |
| `PORT` | según host | El puerto que asigne el host (muchos lo setean solos) |
| `WEBHOOK_VERIFY_TOKEN` | para WhatsApp | Token del webhook de Meta (ver `PLATFORM-SETUP.md`) |
| `META_APP_ID` / `META_APP_SECRET` / `META_CONFIG_ID` | para 1-click | Conexión de WhatsApp con un botón (ver `PLATFORM-SETUP.md`) |

> ⚠️ Sin `DATABASE_URL`, la app usa SQLite (archivo local). Está perfecto para desarrollo, pero
> en la mayoría de los hosts el disco es efímero: **en producción usá siempre Postgres**.

## 3. Build y arranque

El host tiene que ejecutar, en orden:

```bash
npm install                 # raíz
npm install --prefix server
npm install --prefix web
npm run build               # compila el frontend a web/dist
npm start                   # arranca el server (sirve API + frontend) — usa server/src/index.js
```

`npm start` levanta el server, que detecta `web/dist` y sirve el panel y la API juntos en el mismo
puerto. La URL del webhook para Meta será `https://TU-DOMINIO/api/webhook`.

## 4. Opción recomendada: Railway

El repo ya viene con la configuración de Railway lista (`railway.json`, `.node-version`, y el script
`deploy:build` en el `package.json` raíz). No tenés que configurar el build a mano: Railway lee esos
archivos solos.

1. Subí el repo a GitHub.
2. En [railway.com](https://railway.com): **New Project → Deploy from GitHub repo**, elegí el repo.
   Railway detecta `railway.json` y configura el build (`npm run deploy:build`), el arranque
   (`npm run start --prefix server`) y el healthcheck (`/api/health`) automáticamente.
3. **Add → Database → PostgreSQL**. Railway crea la base y expone su `DATABASE_URL`. En el servicio
   web → **Variables → Add Reference**, referenciá la `DATABASE_URL` de la base (o copiala a mano).
4. En el servicio web → **Variables**, agregá:
   - `JWT_SECRET` — un texto largo y aleatorio
   - `TZ` = `America/Argentina/Buenos_Aires`
   - (opcional, para WhatsApp 1-click) `WEBHOOK_VERIFY_TOKEN`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`
5. Railway buildea y deploya. Cuando termina, **Settings → Networking → Generate Domain** te da la URL
   HTTPS (`https://tu-app.up.railway.app`) — esa es la base del webhook de Meta.

**Qué hace cada archivo:**

| Archivo | Para qué |
|---|---|
| `railway.json` | Build command, start command, healthcheck y política de reinicio |
| `.node-version` | Fija Node 20 |
| `package.json` → `deploy:build` | Instala server + web y compila el frontend (lo usa Railway y sirve para otros hosts) |

> Con Postgres administrado **no necesitás volumen de disco**. La detección de SSL es automática:
> funciona con la Postgres interna de Railway (sin SSL) y con Neon/Supabase (con SSL). Si hiciera
> falta forzarlo, está la variable `PGSSL` (`require` / `disable`).

### Render / Fly.io (alternativas)

El mismo `deploy:build` sirve en cualquier host de proceso vivo:
- **Build command:** `npm run deploy:build`
- **Start command:** `npm run start --prefix server`
- **Health check path:** `/api/health`
- Variables: las mismas del paso 4.

## 5. Migrar tus datos de desarrollo (opcional)

La base de SQLite de desarrollo (`server/data/turnobot.db`) es independiente de la de producción.
Si querés llevar negocios cargados localmente a producción, exportá/importá con una herramienta como
[pgloader](https://pgloader.io) o recreá las cuentas en producción (suele ser lo más simple al
arrancar). Las cuentas de prueba **no** se migran solas.

## 6. Después del deploy

- Verificá `https://TU-DOMINIO/api/health` → `{"ok":true,"service":"turnobot"}`.
- Registrá tu cuenta y probá el simulador.
- Seguí `PLATFORM-SETUP.md` para habilitar la conexión de WhatsApp con un botón.
- Configurá backups de la base (Neon/Supabase los hacen solos; en un VPS, un `pg_dump` diario por cron).
