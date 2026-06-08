import { Router } from 'express';
import {
  Abgrenzungsmethode,
  ALLE_METHODEN,
  berechneAbgrenzung,
} from '@jahresabgrenzung/shared';
import { prisma } from '../db.js';
import { asyncHandler } from '../helpers.js';
import { toBerechnung } from '../mappers.js';

export const abgrenzungRouter = Router();

/**
 * GET /api/abgrenzung/:geschaeftsjahrId?methode=COMPLETED_CONTRACT
 *
 * Berechnet die Abgrenzung aller (nicht stornierten) Projekte für das
 * gewählte Geschäftsjahr nach gewählter Methode. Ohne `methode`-Parameter
 * wird die in den Einstellungen hinterlegte Standardmethode verwendet.
 */
abgrenzungRouter.get(
  '/:geschaeftsjahrId',
  asyncHandler(async (req, res) => {
    const gj = await prisma.geschaeftsjahr.findUnique({
      where: { id: req.params.geschaeftsjahrId },
    });
    if (!gj) {
      res.status(404).json({ fehler: 'Geschäftsjahr nicht gefunden' });
      return;
    }

    let methode = req.query.methode as Abgrenzungsmethode | undefined;
    if (!methode) {
      const einst = await prisma.einstellungen.findFirst();
      methode = (einst?.standardMethode as Abgrenzungsmethode) ?? Abgrenzungsmethode.COMPLETED_CONTRACT;
    }
    if (!ALLE_METHODEN.includes(methode)) {
      res.status(400).json({
        fehler: `Unbekannte Methode. Erlaubt: ${ALLE_METHODEN.join(', ')}`,
      });
      return;
    }

    const projekte = await prisma.projekt.findMany({ include: { zahlungen: true } });
    const ergebnis = berechneAbgrenzung(projekte.map(toBerechnung), gj, methode);
    res.json(ergebnis);
  }),
);
