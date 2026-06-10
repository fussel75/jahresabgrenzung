import {
  Abgrenzungsmethode,
  ALLE_METHODEN,
  berechneAbgrenzung,
  parseAktiveKostenarten,
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

  const projekte = await prisma.projekt.findMany({
    include: { zahlungen: true, kostenpositionen: true },
  });

  // Globaler Kostenarten-Schalter: nur aktive Arten fließen in die
  // Ist-Kosten/unfertige-Leistungen-Berechnung ein (Simulation der
  // Herstellungskosten-Wahlrechte; siehe Einstellungen).
  const aktiveArten = parseAktiveKostenarten(einstellungen?.kostenartenAktiv);
  const berechnungsInput = projekte.map(toBerechnung).map((p) => ({
    ...p,
    kostenpositionen: p.kostenpositionen?.filter((k) => !k.art || aktiveArten.has(k.art as never)),
  }));

  const ergebnis = berechneAbgrenzung(berechnungsInput, gj, methode);
  return { kontext: { ergebnis, geschaeftsjahr: gj, einstellungen } };
}
