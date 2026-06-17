# Plan de seguridad del SaaS

Auditoría del código actual + plan priorizado para endurecer la seguridad. Igual que
`PRODUCCION.md`: **no hace falta hacer todo de una**, está ordenado por criticidad.

---

## Estado actual (auditoría)

### ✅ Lo que YA está bien (lo más importante)

- **Aislamiento entre clientes (multi-tenant): correcto.** Todos los endpoints que reciben
  un `id` filtran también por `tenant_id` (`WHERE id = ? AND tenant_id = ?`). Un negocio
  **no puede** ver ni tocar los datos de otro. Este es *el* riesgo número uno de un SaaS y
  está cubierto.
- **Sin inyección SQL.** Todas las queries usan parámetros (`?`), nunca se arma SQL
  concatenando texto del usuario.
- **Contraseñas hasheadas** con bcrypt (nunca se guardan en texto plano).
- **Secretos no se filtran al frontend.** La API key de Anthropic y el token de WhatsApp
  se ocultan antes de devolver el tenant (solo se manda un flag "configurada").
- **HTTPS** en todo (Railway).
- **Los errores no exponen detalles internos** al cliente (devuelven mensaje genérico).
- **Límite de tamaño de request** (1 MB) — evita payloads gigantes.

### ⚠️ Lo que falta reforzar

Ninguno de estos es un agujero que exponga datos entre clientes (eso está bien), pero son
mejoras de endurecimiento que un SaaS en producción debería tener.

---

## 🔴 Prioridad 1 — Crítico (hacer ya)

### 1.1 Confirmar que `JWT_SECRET` esté seteado en producción

**Riesgo:** el código tiene un valor por defecto inseguro si la variable no está. Si en
Railway faltara `JWT_SECRET`, **cualquiera podría falsificar sesiones** y entrar como
cualquier usuario.

**Cómo:**
- Verificar en Railway → TurnoBot → Variables que `JWT_SECRET` exista y sea un texto largo
  y aleatorio (ya lo seteaste en el deploy — confirmar que sigue ahí).
- **Mejora de código:** hacer que el server **se niegue a arrancar en producción** si
  `JWT_SECRET` no está seteada, en vez de usar el default. (Archivo: `server/src/auth.js`.)

### 1.2 Proteger el webhook de Evolution

**Riesgo:** `POST /api/webhook` hoy acepta cualquier request. Alguien que adivine el nombre
de instancia de un negocio (`turnobot_3_xxxx`) podría **inyectar mensajes falsos** (simular
que un cliente escribió) o ensuciar las conversaciones.

**Cómo:**
- Agregar un **token secreto** en la URL del webhook (ej: `/api/webhook/<token-secreto>`) y
  validarlo en cada request. Evolution se configura con esa URL al crear la instancia.
- O validar un header de autorización que Evolution mande.
- Archivos: `server/src/webhook.js` y `server/src/whatsapp.js` (donde se setea el webhook).

### 1.3 Rate limiting en el login

**Riesgo:** sin límite, alguien puede probar **miles de contraseñas por minuto** (fuerza
bruta) contra `/auth/login`.

**Cómo:**
- Sumar `express-rate-limit`: límite por IP en `/auth/login` y `/auth/register`
  (ej: 10 intentos cada 15 min) y un límite general más holgado para el resto de la API.
- Archivo: `server/src/index.js` / `routes.js`.

---

## 🟡 Prioridad 2 — Importante (al tener clientes)

### 2.1 Restringir CORS

**Riesgo:** hoy la API acepta requests de cualquier origen web. Como la auth es por token
Bearer (no cookies), el riesgo es acotado, pero conviene cerrarlo.

**Cómo:** configurar `cors` para permitir solo tu dominio (`APP_URL`). Archivo: `index.js`.

### 2.2 Headers de seguridad (Helmet)

**Riesgo:** faltan headers HTTP defensivos (anti-clickjacking, anti-sniffing, etc.).

**Cómo:** sumar `helmet` en `index.js`. Es una línea y agrega varias protecciones de una.

### 2.3 Encriptar los secretos de cada tenant en la base

**Riesgo:** la API key de Anthropic y el token de WhatsApp de cada negocio se guardan en
**texto plano**. Si alguien accediera a la base, quedarían expuestos.

**Cómo:** encriptar esas columnas a nivel de aplicación (AES con una clave en variable de
entorno). Es el mismo patrón recomendado para un SaaS serio.

### 2.4 Política de contraseñas más fuerte

**Riesgo:** hoy se aceptan contraseñas de apenas 6 caracteres, sin requisitos.

**Cómo:** subir el mínimo (ej: 8-10), y opcionalmente exigir combinación. Validar en
backend (`/auth/register`) y avisar en el frontend.

---

## 🟢 Prioridad 3 — Madurez (a escala)

### 3.1 Revocación de sesiones / refresh tokens

Hoy el token JWT dura **30 días** y no se puede invalidar (si se roba, vale 30 días). Para
mayor control: tokens de acceso cortos + refresh token, o una lista de revocación. Sumar
también un flujo de **"cerrar todas las sesiones"** y **recuperación de contraseña**.

### 3.2 `npm audit` periódico

Revisar vulnerabilidades conocidas en las dependencias (`npm audit` en server y web) y
actualizar. Idealmente automatizado (Dependabot en GitHub, gratis).

### 3.3 Proteger la `EVOLUTION_API_KEY`

Es una clave **global de administrador** sobre todas las instancias de WhatsApp. Si se
filtra, alguien controla los WhatsApp de todos tus clientes. Ya está en variable de entorno
(bien) — sumar rotación periódica y acceso restringido a quién la ve.

### 3.4 Logs de auditoría

Registrar acciones sensibles (logins, cambios de credenciales, conexión/desconexión de
WhatsApp) con fecha, usuario e IP, para poder investigar incidentes.

### 3.5 Verificación de email + 2FA (opcional)

Confirmar el email al registrarse (evita cuentas falsas) y, para cuentas con datos
sensibles, ofrecer autenticación de dos factores.

---

## Resumen de "qué hago primero"

1. **Confirmar `JWT_SECRET`** en Railway (5 min) — y que el código falle sin él.
2. **Proteger el webhook** con un token secreto en la URL.
3. **Rate limiting** en el login.

Esos tres cierran los riesgos más concretos. El resto es endurecimiento progresivo.

> **Lo tranquilizador:** lo más difícil y peligroso de un SaaS multi-tenant —que un cliente
> acceda a los datos de otro— **ya está bien resuelto**. Lo que falta es blindaje alrededor
> (fuerza bruta, webhook, headers), que se suma de a poco sin reescribir nada.
