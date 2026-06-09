import {
  Abgrenzungsmethode,
  ALLE_METHODEN,
  berechneAbgrenzung,
  type AbgrenzungsErgebnis,
} from '@jahresabgrenzung/shared';
import type { Einstellungen, Geschaeftsjahr } from '@prisma/client';
import { prisma } from './db.js';
import { toBerechnung } from './mappers.js';

export interface AbgrenzungKontext {
  ergebnis: AbgrenzungsErgebnis;
  geschaeftsjahr: Geschaeftsjahr;
  einstellungen: Einstellungen | null;
}

/** Lädt GJ, Einstellungen und Projekte und berechnet die Abgrenzung. */
export async function ladeAbgrenzung(
  geschaeftsjahrId: string,
  methodeRoh?: string,
): Promise<{ kontext?: AbgrenzungKontext; fehler?: { status: number; nachricht: string } }> {
  const gj = await prisma.geschaeftsjahr.findUnique({ where: { id: geschaeftsjahrId } });
  if (!gj) return { fehler: { status: 404, nachricht: 'Geschäftsjahr nicht gefunden' } };

  const einstellungen = await prisma.einstellungen.findFirst();
  const methode =
    (methodeRoh as Abgrenzungsmethode | undefined) ??
    (einstellungen?.standardMethode as Abgrenzungsmethode) ??
    Abgrenzungsmethode.COMPLETED_CONTRACT;

  if (!ALLE_METHODEN.includes(methode)) {
    return {
      fehler: { status: 400, nachricht: `Unbekannte Methode. Erlaubt: ${ALLE_METHODEN.join(', ')}` },
    };
  }

  const projekte = await prisma.projekt.findMany({ include: { zahlungen: true } });
  const ergebnis = berechneAbgrenzung(projekte.map(toBerechnung), gj, methode);
  return { kontext: { ergebnis, geschaeftsjahr: gj, einstellungen } };
}
