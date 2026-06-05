import express from 'express';
import { Abgrenzungsmethode } from '@jahresabgrenzung/shared';

/**
 * Platzhalter-Server (Schritt 1 des Repo-Setups).
 *
 * Die eigentlichen API-Routen (CRUD + Abgrenzungs-Endpoint), Zod-Validierung
 * und Basic-Auth folgen in den Schritten 4–6 der Umsetzung (siehe SPEC.md §12).
 */
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', methodenVerfuegbar: Object.values(Abgrenzungsmethode) });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API läuft auf http://localhost:${port}`);
});
