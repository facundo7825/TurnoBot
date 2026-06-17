# Configuración de plataforma — Conexión WhatsApp con 1 click

Esta guía es para **el dueño de la plataforma** (vos), una sola vez. Cuando la completes,
cada usuario conecta su WhatsApp apretando un botón y siguiendo un popup de Facebook —
sin tokens, sin webhooks, sin tocar Meta for Developers.

Así funcionan las plataformas grandes (Wati, 360dialog, etc.): usan el
**Embedded Signup** oficial de Meta. El usuario final solo necesita una cuenta de
Facebook y un número de teléfono.

## Requisitos previos

- Una cuenta en [Meta for Developers](https://developers.facebook.com) (gratis).
- Un **Meta Business Portfolio** verificado a tu nombre (Business Manager → Configuración → Información del negocio → Verificación). La verificación puede tardar unos días.
- Tu servidor accesible por **HTTPS público** (en producción un dominio; para pruebas `ngrok http 4000`).

## Paso 1 — Crear la app

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Crear app** → tipo **Business**.
2. Agregá los productos **WhatsApp** y **Facebook Login for Business**.

## Paso 2 — Configurar el webhook (una sola vez, para todos tus usuarios)

En **WhatsApp → Configuración → Webhook**:

- **Callback URL:** `https://TU-DOMINIO/api/webhook`
- **Verify token:** el valor que pongas en `WEBHOOK_VERIFY_TOKEN` del `.env`
- Suscribite al campo **messages**

Como cada cuenta de WhatsApp de tus usuarios se suscribe a TU app automáticamente
durante el signup, todos sus mensajes llegan a este único webhook y TurnoBot los
enruta al negocio correcto.

## Paso 3 — Crear la configuración de Embedded Signup

En **Facebook Login for Business → Configuraciones** → **Crear configuración**:

- Tipo: **WhatsApp Embedded Signup**
- Activos: WhatsApp Business Account + número de teléfono
- Guardá y copiá el **ID de configuración** (`config_id`)

## Paso 4 — Variables de entorno

Creá `server/.env` (hay un ejemplo en `server/.env.example`):

```
META_APP_ID=tu_app_id
META_APP_SECRET=tu_app_secret        # App → Configuración → Básica
META_CONFIG_ID=tu_config_id          # el del paso 3
WEBHOOK_VERIFY_TOKEN=un_token_secreto_que_elijas
JWT_SECRET=otro_secreto_largo
```

Reiniciá el server. La página "Conexión WhatsApp" detecta sola que el modo
1-click está habilitado y muestra el botón **Conectar mi WhatsApp con Facebook**.

## Paso 5 — Revisión de Meta (para salir a producción)

Mientras la app está en **modo desarrollo**, el signup solo funciona con cuentas
que agregues como testers/administradores de la app. Para abrirlo a cualquier
usuario:

1. En **Revisión de la app**, pedí los permisos `whatsapp_business_management` y
   `whatsapp_business_messaging` (acceso avanzado).
2. Completá la verificación del negocio si no la hiciste.
3. Pasá la app a **modo Live**.

## Qué hace TurnoBot automáticamente en cada conexión

Cuando un usuario termina el popup de Facebook, el servidor:

1. Cambia el código OAuth por un **token de larga duración** del usuario.
2. **Suscribe** su cuenta de WhatsApp (WABA) a tu app → sus mensajes llegan a tu webhook.
3. **Registra** su número en la Cloud API (con un PIN autogenerado).
4. Verifica el número y guarda todo en su cuenta. Listo: el bot responde.

## Costos de Meta — ¿a quién le cobran?

**A cada usuario (negocio), nunca a la plataforma.** Durante el Embedded Signup cada
usuario crea su propia cuenta de WhatsApp Business (WABA) a su nombre; Meta factura
contra la tarjeta que ese negocio cargue en su WhatsApp Manager. Tu app de Meta no
tiene costo.

- Las **conversaciones de servicio** (el cliente escribe y el bot responde dentro de
  las 24 hs — todo el uso normal de TurnoBot) son **gratis**.
- Solo se pagan las **plantillas** (mensajes que el negocio inicia fuera de la ventana
  de 24 hs): en nuestro caso, los **recordatorios de turno** del día anterior. Son
  centavos por mensaje (tarifa "utility") y requieren plantillas aprobadas por Meta
  para entrega confiable. Si el usuario no carga tarjeta, lo gratuito sigue andando.
- Esquema avanzado (opcional, a futuro): los Solution Partners oficiales pueden poner
  su línea de crédito y recobrarle a sus usuarios. No es necesario para operar.
