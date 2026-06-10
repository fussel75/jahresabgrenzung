import { Router } from 'express';
import { asyncHandler } from '../helpers.js';
import { hapakVerbindungstest } from '../hapak/preview.js';
import { hapakImportVorschau } from '../hapak/import.js';

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

// Read-only Projekt-Vorschau (lädt + mappt, speichert nichts).
importRouter.post(
  '/hapak/vorschau',
  asyncHandler(async (req, res) => {
    const abJahr = Number(req.body?.abJahr) || 2024;
    const stichtag = req.body?.stichtag ? new Date(String(req.body.stichtag)) : null;
    const ergebnis = await hapakImportVorschau(abJahr, stichtag);
    res.status(ergebnis.ok ? 200 : 502).json(ergebnis);
  }),
);
