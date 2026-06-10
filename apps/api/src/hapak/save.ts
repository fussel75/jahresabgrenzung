import type { ImportProjekt } from '@jahresabgrenzung/shared';
import { prisma } from '../db.js';

/**
 * Schreibt ausgewählte HAPAK-Projekte in die App-Datenbank. Idempotent über
 * das interne Feld `hapakProjname`: bestehende Projekte werden aktualisiert,
 * neue angelegt; ihre HAPAK-Zahlungen werden bei jedem Lauf frisch ersetzt
 * (Quelle bleibt FIBUZWO — Edits in der App auf Zahlungen würden also durch
 * den nächsten Sync überschrieben; manuelle Anpassungen an Stammdaten bleiben).
 */

export interface SaveStat {
  projname: string;
  projektnummer: string;
  aktion: 'neu' | 'aktualisiert' | 'fehler';
  fehler?: string;
}

export interface SaveErgebnis {
  ok: boolean;
  uebernommen: number;
  uebersprungen: number;
  fehler: number;
  details: SaveStat[];
}

function mapStatus(p: ImportProjekt): string {
  return p.laeuft ? 'LAUFEND' : 'ABGESCHLOSSEN';
}

/**
 * Default-Enddatum, wenn HAPAK keines liefert: 31.12. des Folgejahres
 * vom Stichtag. So fällt das Projekt in den Abgrenzungsbedarf, ist aber
 * jederzeit in der App änderbar.
 */
function defaultEnde(stichtag: Date | null, startdatum: Date | null): Date {
  if (stichtag) {
    return new Date(stichtag.getFullYear() + 1, 11, 31);
  }
  if (startdatum) {
    return new Date(startdatum.getFullYear() + 1, 11, 31);
  }
  return new Date(new Date().getFullYear() + 1, 11, 31);
}

export async function speichereImport(
  projekte: ImportProjekt[],
  stichtag: Date | null,
): Promise<SaveErgebnis> {
  const details: SaveStat[] = [];
  let neu = 0;
  let aktualisiert = 0;
  let fehler = 0;

  for (const p of projekte) {
    try {
      const vorhanden = await prisma.projekt.findUnique({
        where: { hapakProjname: p.projname },
      });

      const startdatumGeplant = p.startdatum ?? new Date();
      const enddatumGeplant = p.enddatum ?? defaultEnde(stichtag, p.startdatum);

      const daten = {
        projektnummer: p.projektnummer,
        bezeichnung: p.bezeichnung,
        kunde: p.kunde,
        kundenadresse: p.kundenadresse ?? null,
        startdatumGeplant,
        enddatumGeplant,
        enddatumIst: p.enddatum ?? null,
        auftragssummeNetto: p.auftragssummeNetto,
        gesamtkostenGeplant: p.istKostenStichtag, // Default = bisherige Ist-Kosten
        istKostenStichtag: p.istKostenStichtag,
        status: mapStatus(p),
        gewerk: 'GEMISCHT' as const,
        hapakProjname: p.projname,
        notizen: `HAPAK-Import. Auftragssumme aus: ${p.auftragssummeQuelle}.`,
      };

      let projektId: string;
      if (vorhanden) {
        // Idempotente Aktualisierung: HAPAK-getriebene Felder neu setzen,
        // manuell editierbare Stammdaten (Gewerk, Status) NICHT überschreiben.
        await prisma.projekt.update({
          where: { id: vorhanden.id },
          data: {
            projektnummer: daten.projektnummer,
            bezeichnung: daten.bezeichnung,
            kunde: daten.kunde,
            kundenadresse: daten.kundenadresse,
            startdatumGeplant: daten.startdatumGeplant,
            enddatumGeplant: daten.enddatumGeplant,
            enddatumIst: daten.enddatumIst,
            auftragssummeNetto: daten.auftragssummeNetto,
            istKostenStichtag: daten.istKostenStichtag,
          },
        });
        // HAPAK-Sync: Zahlungen + Kostenpositionen wegräumen und neu schreiben.
        await prisma.zahlung.deleteMany({ where: { projektId: vorhanden.id } });
        await prisma.kostenposition.deleteMany({ where: { projektId: vorhanden.id } });
        projektId = vorhanden.id;
        aktualisiert++;
        details.push({ projname: p.projname, projektnummer: p.projektnummer, aktion: 'aktualisiert' });
      } else {
        const neuesProjekt = await prisma.projekt.create({ data: daten });
        projektId = neuesProjekt.id;
        neu++;
        details.push({ projname: p.projname, projektnummer: p.projektnummer, aktion: 'neu' });
      }

      // Zahlungen schreiben (frisch).
      for (const z of p.zahlungen) {
        if (!z.datum) continue;
        await prisma.zahlung.create({
          data: {
            projektId,
            datum: z.datum,
            betragNetto: z.betragNetto,
            art: z.art,
            rechnungsNr: z.rechnungsNr || null,
            beschreibung: z.beschreibung || null,
          },
        });
      }

      // Kostenpositionen schreiben (Eingangsrechnungen aus FIBUZWO).
      for (const k of p.kostenpositionen) {
        if (!k.datum) continue;
        const text = [k.lieferant, k.beschreibung].filter(Boolean).join(' — ');
        await prisma.kostenposition.create({
          data: {
            projektId,
            datum: k.datum,
            betragNetto: k.betragNetto,
            art: 'FREMDLEISTUNG',
            beschreibung: text ? `${text}${k.rechnungsNr ? ` (Rg. ${k.rechnungsNr})` : ''}` : k.rechnungsNr || null,
          },
        });
      }
    } catch (e) {
      fehler++;
      details.push({
        projname: p.projname,
        projektnummer: p.projektnummer,
        aktion: 'fehler',
        fehler: (e as Error).message,
      });
    }
  }

  return {
    ok: fehler === 0,
    uebernommen: neu + aktualisiert,
    uebersprungen: 0,
    fehler,
    details,
  };
}
