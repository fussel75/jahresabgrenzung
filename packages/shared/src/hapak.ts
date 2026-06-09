import { round2 } from './abgrenzung.js';

/**
 * Reine HAPAK-Transformationslogik (ohne Datei-/Netzwerkzugriff, daher
 * vollständig unit-testbar). Die DBF-Roh-Extraktion und der FileStation-Zugriff
 * liegen separat im API-Backend.
 *
 * Grundlage: HAPAK-Datenmodell (DOKUMENT.DBF, FIBUZWO.DBF, Positions-DBFs).
 *  - FIBU-Werte (TYP=HR/HG) sind die maßgebliche Betragsquelle.
 *  - Abschläge werden in HAPAK KUMULATIV gespeichert → echter Betrag = Delta
 *    zur vorherigen Abschlagsrechnung der Kette (kritischer Teil!).
 *  - Projektnummer-Format JJ-NNNNN; JJ-00001 ist das Kleinprojekte-Sammelprojekt.
 */

// --- Dokumenttypen --------------------------------------------------------

export type HapakDokumentTyp =
  | 'RECHNUNG' // normale Einzelrechnung
  | 'ABSCHLAGSRECHNUNG'
  | 'SCHLUSSRECHNUNG'
  | 'GUTSCHRIFT'
  | 'EINGANGSRECHNUNG'; // Lieferantenrechnung (Kosten)

/**
 * Leitet den Dokumenttyp aus `TYPUNDNR` (DOKUMENT.DBF) und dem Feld `ID` ab.
 *
 * `ID === "5"` kennzeichnet eine Eingangsrechnung eindeutig und hat daher
 * Vorrang (sonst würde eine Eingangsrechnung mit TYPUNDNR "rechnung..."
 * fälschlich als Ausgangsrechnung erkannt). Danach gilt die dokumentierte
 * Prefix-Reihenfolge (erste Übereinstimmung gewinnt).
 *
 * Liefert `null` für Nicht-Rechnungs-Dokumente (Angebot, AB, Ordner …).
 */
export function mapHapakDokumentTyp(
  typundnr: string | null | undefined,
  id?: string | number | null,
): HapakDokumentTyp | null {
  if (id != null && String(id).trim() === '5') return 'EINGANGSRECHNUNG';

  const t = (typundnr ?? '').trim().toLowerCase();
  if (t.startsWith('abschlag')) return 'ABSCHLAGSRECHNUNG';
  if (t.startsWith('schluss')) return 'SCHLUSSRECHNUNG';
  if (t.startsWith('gutschrift')) return 'GUTSCHRIFT';
  if (t.startsWith('rechnung')) {
    return t.includes('abschlagsrechnung') ? 'ABSCHLAGSRECHNUNG' : 'RECHNUNG';
  }
  return null;
}

// --- Projektnummer (JJ-NNNNN) ---------------------------------------------

export interface Projektnummer {
  jahr: number; // zweistellig wie in HAPAK (z.B. 25)
  lfdNr: number;
  normalisiert: string; // immer "JJ-NNNNN"
}

/**
 * Parst eine HAPAK-Projektnummer im Format JJ-NNNNN (Bindestrich optional).
 * Liefert `null`, wenn der String keine gültige Projektnummer ist.
 */
export function parseProjektnummer(roh: string | null | undefined): Projektnummer | null {
  const m = (roh ?? '').trim().match(/^(\d{2})-?(\d{4,6})$/);
  if (!m) return null;
  return {
    jahr: Number(m[1]),
    lfdNr: Number(m[2]),
    normalisiert: `${m[1]}-${m[2].padStart(5, '0')}`,
  };
}

/** Ist die Projektnummer das Kleinprojekte-Sammelprojekt (JJ-00001)? */
export function istSammelprojekt(projektnummer: string | null | undefined): boolean {
  const p = parseProjektnummer(projektnummer);
  return p !== null && p.lfdNr === 1;
}

// --- Abschlag-Delta-Logik (kritischer Teil) -------------------------------

export interface AbschlagEingang {
  dokumentnummer: string;
  datum: Date;
  /** Kumulative Items-Summe (netto) bis einschließlich dieser Abschlagsrechnung. */
  kumulativeNetto: number;
}

export interface AbschlagDelta extends AbschlagEingang {
  /** Echter (nicht-kumulativer) Betrag dieser Abschlagsrechnung. */
  deltaNetto: number;
}

/**
 * Berechnet je Abschlagsrechnung den echten Betrag als Differenz zur
 * vorherigen Abschlagsrechnung der Kette (nach Datum sortiert).
 *
 * Beispiel: kumulativ 10.000 → 25.000 → 40.000 ergibt 10.000 / 15.000 / 15.000.
 */
export function berechneAbschlagDeltas(kette: AbschlagEingang[]): AbschlagDelta[] {
  const sortiert = [...kette].sort((a, b) => a.datum.getTime() - b.datum.getTime());
  let vorher = 0;
  return sortiert.map((a) => {
    const deltaNetto = round2(a.kumulativeNetto - vorher);
    vorher = a.kumulativeNetto;
    return { ...a, deltaNetto };
  });
}
