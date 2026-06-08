import { Router } from 'express';
import { geschaeftsjahrSchema } from '@jahresabgrenzung/shared';
import { prisma } from '../db.js';
import { asyncHandler, parseBody } from '../helpers.js';

export const geschaeftsjahreRouter = Router();

geschaeftsjahreRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const jahre = await prisma.geschaeftsjahr.findMany({ orderBy: { jahr: 'desc' } });
    res.json(jahre);
  }),
);

geschaeftsjahreRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const daten = parseBody(geschaeftsjahrSchema, req, res);
    if (!daten) return;
    const gj = await prisma.geschaeftsjahr.create({ data: daten });
    res.status(201).json(gj);
  }),
);

geschaeftsjahreRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const daten = parseBody(geschaeftsjahrSchema, req, res);
    if (!daten) return;
    const gj = await prisma.geschaeftsjahr.update({ where: { id: req.params.id }, data: daten });
    res.json(gj);
  }),
);

geschaeftsjahreRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.geschaeftsjahr.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);
