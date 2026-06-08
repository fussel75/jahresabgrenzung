import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../helpers.js';

/** Einzel-Löschen von Zahlungen und Kostenpositionen anhand ihrer ID. */
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
