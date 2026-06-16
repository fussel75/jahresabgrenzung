import { Router } from 'express';
import { z } from 'zod';
import { KostenArt } from '@jahresabgrenzung/shared';
import { prisma } from '../db.js';
import { asyncHandler, parseBody } from '../helpers.js';
import { serializeKostenposition } from '../mappers.js';

/** Aendern/Loeschen einzelner Zahlungen und Kostenpositionen anhand ihrer ID. */
export const eintraegeRouter = Router();

eintraegeRouter.delete(
  '/zahlungen/:id',
  asyncHandler(async (req, res) => {
    await prisma.zahlung.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

eintraegeRouter.delete(
  '/kostenpositionen/:id',
  asyncHandler(async (req, res) => {
    await prisma.kostenposition.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// Teil-Update einer Kostenposition (vor allem die Kostenart manuell setzen,
// wenn die SKR04-Heuristik beim Import danebenlag — z. B. Architektenplanung
// kam als MATERIAL an, soll aber FREMDLEISTUNG sein).
const kostenpositionPatchSchema = z
  .object({
    art: z.nativeEnum(KostenArt).optional(),
    beschreibung: z.string().optional().nullable(),
    rechnungsNr: z.string().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Keine Aenderung uebergeben' });

eintraegeRouter.patch(
  '/kostenpositionen/:id',
  asyncHandler(async (req, res) => {
    const daten = parseBody(kostenpositionPatchSchema, req, res);
    if (!daten) return;
    const aktualisiert = await prisma.kostenposition.update({
      where: { id: req.params.id },
      data: daten,
    });
    res.json(serializeKostenposition(aktualisiert));
  }),
);
