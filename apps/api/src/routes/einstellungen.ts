import { Router } from 'express';
import { einstellungenSchema } from '@jahresabgrenzung/shared';
import { prisma } from '../db.js';
import { asyncHandler, parseBody } from '../helpers.js';

export const einstellungenRouter = Router();

/** Es gibt genau eine Einstellungen-Zeile; bei Bedarf wird sie angelegt. */
async function holeOderErstelle() {
  const vorhanden = await prisma.einstellungen.findFirst();
  if (vorhanden) return vorhanden;
  return prisma.einstellungen.create({ data: {} });
}

einstellungenRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await holeOderErstelle());
  }),
);

einstellungenRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const daten = parseBody(einstellungenSchema.partial(), req, res);
    if (!daten) return;
    const aktuell = await holeOderErstelle();
    const aktualisiert = await prisma.einstellungen.update({
      where: { id: aktuell.id },
      data: daten,
    });
    res.json(aktualisiert);
  }),
);
