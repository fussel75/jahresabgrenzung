import { Router } from 'express';
import { asyncHandler } from '../helpers.js';
import { hapakVerbindungstest } from '../hapak/preview.js';

/**
 * Import-Schnittstelle.
 *
 * `/hapak/test` ist ein read-only Verbindungstest zum NAS (Synology
 * FileStation): meldet sich an, liest den Daten-Ordner, lädt DOKUMENT.DBF und
 * zeigt Spalten + erste Zeilen — speichert nichts.
 *
 * Der eigentliche HAPAK-Import (Projekte/Rechnungen) folgt darauf aufbauend.
 */
export const importRouter = Router();

importRouter.post(
  '/hapak/test',
  asyncHandler(async (_req, res) => {
    const ergebnis = await hapakVerbindungstest();
    res.status(ergebnis.ok ? 200 : 502).json(ergebnis);
  }),
);

importRouter.post('/hapak', (_req, res) => {
  res.status(501).json({
    fehler: 'HAPAK-Import noch nicht aktiv',
    hinweis: 'Zuerst Verbindungstest über POST /api/import/hapak/test ausführen.',
  });
});
