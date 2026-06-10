import { Router } from 'express';
import { asyncHandler } from '../helpers.js';
import { hapakVerbindungstest } from '../hapak/preview.js';
import { hapakImportVorschau } from '../hapak/import.js';
import { speichereImport } from '../hapak/save.js';

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

// Übernahme: lädt frisch vom NAS (vertraut Beträgen aus dem Browser NICHT)
// und speichert nur die per `projnames` ausgewählten Projekte idempotent.
// WICHTIG: Es wird IMMER alles importiert (kein Stichtag-Limit) — die App
// rechnet je Geschäftsjahr stichtagsgenau aus den datierten Belegen. Sonst
// hinge der Datenbestand vom zufällig gewählten GJ beim Import-Klick ab.
importRouter.post(
  '/hapak/uebernahme',
  asyncHandler(async (req, res) => {
    const abJahr = Number(req.body?.abJahr) || 2024;
    const auswahl = new Set<string>(
      Array.isArray(req.body?.projnames) ? req.body.projnames.map(String) : [],
    );
    if (auswahl.size === 0) {
      res.status(400).json({ fehler: 'Keine Projekte ausgewählt (projnames leer).' });
      return;
    }
    const vorschau = await hapakImportVorschau(abJahr, null);
    if (!vorschau.ok) {
      res.status(502).json({ fehler: vorschau.fehler ?? 'NAS-Abruf fehlgeschlagen' });
      return;
    }
    const ausgewaehlt = vorschau.projekte.filter((p) => auswahl.has(p.projname));
    const ergebnis = await speichereImport(ausgewaehlt, null);
    res.status(ergebnis.ok ? 200 : 207).json(ergebnis);
  }),
);
