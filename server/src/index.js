import './env.js';
import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDb, isPostgres } from './database.js';
import routes from './routes.js';
import webhook from './webhook.js';
import { startReminderLoop, startDigestLoop } from './reminders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api', routes);
app.use('/api', webhook);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'turnobot' }));

// Servir el frontend compilado si existe (despliegue en un solo proceso)
const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

// Manejador de errores (captura los rejects de los handlers async vía express-async-errors)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api] error no manejado:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function start() {
  await initDb();
  console.log(`[db] usando ${isPostgres ? 'PostgreSQL' : 'SQLite (desarrollo)'}`);

  startReminderLoop();
  startDigestLoop();

  app.listen(PORT, () => {
    console.log(`TurnoBot server escuchando en http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[fatal] no se pudo iniciar el server:', err);
  process.exit(1);
});
