import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { Prisma } from '@prisma/client';

/** Fängt Fehler aus async-Handlern und reicht sie an Express weiter. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Validiert req.body gegen ein Zod-Schema; liefert bei Fehler 400 + Issues. */
export function parseBody<T extends ZodTypeAny>(
  schema: T,
  req: Request,
  res: Response,
): z.infer<T> | undefined {
  const ergebnis = schema.safeParse(req.body);
  if (!ergebnis.success) {
    res.status(400).json({
      fehler: 'Validierungsfehler',
      issues: ergebnis.error.issues.map((i) => ({
        feld: i.path.join('.'),
        nachricht: i.message,
      })),
    });
    return undefined;
  }
  return ergebnis.data;
}

/** Wandelt Prisma.Decimal in eine normale Zahl (für JSON/Frontend). */
export function dec(wert: Prisma.Decimal | number | null | undefined): number {
  if (wert == null) return 0;
  return typeof wert === 'number' ? wert : Number(wert.toString());
}

/** Zentrale Fehlerbehandlung (am Ende der Middleware-Kette registrieren). */
export function fehlerHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ fehler: 'Eintrag existiert bereits (eindeutiges Feld verletzt)' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ fehler: 'Nicht gefunden' });
      return;
    }
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ fehler: 'Interner Serverfehler' });
}
