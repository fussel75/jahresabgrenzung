import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * HTTP Basic Auth vor dem gesamten Backend (V1, siehe SPEC.md §2).
 * Nutzer/Passwort kommen aus den Umgebungsvariablen AUTH_USER / AUTH_PASSWORD.
 */

function sicherGleich(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const erwarteterUser = process.env.AUTH_USER ?? '';
  const erwartetesPasswort = process.env.AUTH_PASSWORD ?? '';

  // Wenn keine Credentials konfiguriert sind, läuft die App offen (lokal/dev).
  if (!erwarteterUser && !erwartetesPasswort) {
    next();
    return;
  }

  const header = req.headers.authorization ?? '';
  if (header.startsWith('Basic ')) {
    const dekodiert = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const trenner = dekodiert.indexOf(':');
    const user = dekodiert.slice(0, trenner);
    const passwort = dekodiert.slice(trenner + 1);
    if (sicherGleich(user, erwarteterUser) && sicherGleich(passwort, erwartetesPasswort)) {
      next();
      return;
    }
  }

  res
    .set('WWW-Authenticate', 'Basic realm="Jahresabgrenzung", charset="UTF-8"')
    .status(401)
    .json({ fehler: 'Nicht autorisiert' });
}
