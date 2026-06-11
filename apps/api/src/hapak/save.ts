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
 * Default-Enddatum für laufende Projekte ohne Schlussrechnung:
 * 31.12. des Folgejahres (bezogen auf heute bzw. den späteren Projektstart).
 * Das Projekt fällt damit in den Abgrenzungsbedarf und ist jederzeit änderbar.
 */
function defaultEnde(stichtag: Date | null, startdatum: Date | null): Date {
  const basisJahr = Math.max(
    stichtag?.getFullYear() ?? 0,
    startdatum?.getFullYear() ?? 0,
    new Date().getFullYear(),
  );
  return new Date(basisJahr + 1, 11, 31);
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
      // Manueller Projekt-Start: nie überschreiben; nur beim ERSTEN Import
      // mit dem geschätzten Wert (Datum erste Ausgangsrechnung) belegen.
      const projektStartManuell =
        vorhanden?.projektStartManuell ?? p.projektStartGeschaetzt ?? null;

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
        projektStartManuell,
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
            // enddatumGeplant = "voraussichtliches Ende" (manuell gepflegt) —
            // wird beim Sync NIE überschrieben; nur das Ist-Ende (Schluss-
            // rechnung aus HAPAK) wird aktualisiert und hat in der
            // Berechnung ohnehin Vorrang.
            enddatumIst: daten.enddatumIst,
            auftragssummeNetto: daten.auftragssummeNetto,
            istKostenStichtag: daten.istKostenStichtag,
            // projektStartManuell wird NICHT überschrieben (bleibt was es ist).
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

      // Zahlungen + Kostenpositionen in EINEM createMany-Aufruf je Tabelle
      // (deutlich schneller und robuster als hunderte Einzel-Inserts).
      const zahlungenData = p.zahlungen
        .filter((z) => z.datum != null)
        .map((z) => ({
          projektId,
          datum: z.datum as Date,
          betragNetto: z.betragNetto,
          art: z.art,
          rechnungsNr: z.rechnungsNr || null,
          beschreibung: z.beschreibung || null,
        }));
      if (zahlungenData.length > 0) {
        await prisma.zahlung.createMany({ data: zahlungenData });
      }

      const kostenData = p.kostenpositionen
        .filter((k) => k.datum != null)
        .map((k) => {
          const text = [k.lieferant, k.beschreibung].filter(Boolean).join(' — ');
          const zusatz = [k.rechnungsNr ? `Rg. ${k.rechnungsNr}` : '', k.konto ? `Kto ${k.konto}` : '']
            .filter(Boolean)
            .join(', ');
          const beschreibung = text
            ? `${text}${zusatz ? ` (${zusatz})` : ''}`
            : zusatz || null;
          return {
            projektId,
            datum: k.datum as Date,
            betragNetto: k.betragNetto,
            // Kostenart aus dem HAPAK-Aufwandskonto (54xx Material, 59xx Fremdleistung).
            art: k.art,
            beschreibung,
          };
        });
      if (kostenData.length > 0) {
        await prisma.kostenposition.createMany({ data: kostenData });
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
