import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { basicAuth } from './auth.js';
import { fehlerHandler } from './helpers.js';
import { projekteRouter } from './routes/projekte.js';
import { geschaeftsjahreRouter } from './routes/geschaeftsjahre.js';
import { einstellungenRouter } from './routes/einstellungen.js';
import { abgrenzungRouter } from './routes/abgrenzung.js';
import { eintraegeRouter } from './routes/eintraege.js';
import { importRouter } from './routes/import.js';
import { szenarienRouter } from './routes/szenarien.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: '5mb' }));

// Health-Check bewusst OHNE Auth (für VPS-/Uptime-Monitoring).
app.get('/api/health', (_req, res) => {
  const jetzt = new Date();
  res.json({
    status: 'ok',
    zeitzone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    serverzeit: jetzt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
    iso: jetzt.toISOString(),
  });
});

// Basic Auth schützt ab hier API + ausgeliefertes Frontend (V1, SPEC.md §2).
app.use(basicAuth);

// API-Routen
app.use('/api/projekte', projekteRouter);
app.use('/api/geschaeftsjahre', geschaeftsjahreRouter);
app.use('/api/einstellungen', einstellungenRouter);
app.use('/api/abgrenzung', abgrenzungRouter);
app.use('/api/import', importRouter);
app.use('/api/szenarien', szenarienRouter);
app.use('/api', eintraegeRouter); // /api/zahlungen/:id, /api/kostenpositionen/:id

// Frontend ausliefern, falls gebaut (apps/web/dist). Im Dev läuft Vite separat.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use(fehlerHandler);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API läuft auf http://localhost:${port}`);
});
