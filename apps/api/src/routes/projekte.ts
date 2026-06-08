import { Router } from 'express';
import {
  projektSchema,
  projektUpdateSchema,
  zahlungSchema,
  kostenpositionSchema,
  hatAbgrenzungsbedarf,
} from '@jahresabgrenzung/shared';
import { prisma } from '../db.js';
import { asyncHandler, parseBody } from '../helpers.js';
import {
  serializeProjekt,
  serializeZahlung,
  serializeKostenposition,
  toBerechnung,
} from '../mappers.js';

export const projekteRouter = Router();

// --- Liste (mit einfachen Filtern) ---
projekteRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, gewerk, kunde, nurAbzugrenzende, geschaeftsjahrId } = req.query;

    const where: Record<string, unknown> = {};
    if (typeof status === 'string') where.status = status;
    if (typeof gewerk === 'string') where.gewerk = gewerk;
    if (typeof kunde === 'string') where.kunde = { contains: kunde };

    let projekte = await prisma.projekt.findMany({
      where,
      orderBy: { startdatumGeplant: 'asc' },
    });

    // Optionaler Filter "nur abzugrenzende" — braucht ein Geschäftsjahr.
    if (nurAbzugrenzende === 'true' && typeof geschaeftsjahrId === 'string') {
      const gj = await prisma.geschaeftsjahr.findUnique({ where: { id: geschaeftsjahrId } });
      if (gj) {
        projekte = projekte.filter((p) => hatAbgrenzungsbedarf(toBerechnung(p), gj));
      }
    }

    res.json(projekte.map(serializeProjekt));
  }),
);

// --- Einzelnes Projekt inkl. Detaildaten ---
projekteRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const projekt = await prisma.projekt.findUnique({
      where: { id: req.params.id },
      include: {
        zahlungen: { orderBy: { datum: 'asc' } },
        kostenpositionen: { orderBy: { datum: 'asc' } },
      },
    });
    if (!projekt) {
      res.status(404).json({ fehler: 'Projekt nicht gefunden' });
      return;
    }
    res.json(serializeProjekt(projekt));
  }),
);

// --- Neuanlage ---
projekteRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const daten = parseBody(projektSchema, req, res);
    if (!daten) return;
    const projekt = await prisma.projekt.create({ data: daten });
    res.status(201).json(serializeProjekt(projekt));
  }),
);

// --- Update (Teil-Update erlaubt) ---
projekteRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const daten = parseBody(projektUpdateSchema, req, res);
    if (!daten) return;
    const projekt = await prisma.projekt.update({
      where: { id: req.params.id },
      data: daten,
    });
    res.json(serializeProjekt(projekt));
  }),
);

// --- Löschen (kaskadiert auf Zahlungen/Kostenpositionen) ---
projekteRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.projekt.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// --- Zahlungen ---
projekteRouter.post(
  '/:id/zahlungen',
  asyncHandler(async (req, res) => {
    const daten = parseBody(zahlungSchema, req, res);
    if (!daten) return;
    const zahlung = await prisma.zahlung.create({
      data: { ...daten, projektId: req.params.id },
    });
    res.status(201).json(serializeZahlung(zahlung));
  }),
);

// --- Kostenpositionen ---
projekteRouter.post(
  '/:id/kostenpositionen',
  asyncHandler(async (req, res) => {
    const daten = parseBody(kostenpositionSchema, req, res);
    if (!daten) return;
    const pos = await prisma.kostenposition.create({
      data: { ...daten, projektId: req.params.id },
    });
    res.status(201).json(serializeKostenposition(pos));
  }),
);
