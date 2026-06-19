import { round2 } from './abgrenzung.js';
import { mapHapakDokumentTyp, anzeigeBelegnummer } from './hapak.js';
import type { KostenArt, ZahlungsArt } from './types.js';

/**
 * Reine Mapping-Logik HAPAK -> Import-Projekte (ohne Datei-/NAS-Zugriff,
 * vollständig unit-testbar). Die DBF-Extraktion (FileStation) liegt im API-Backend.
 *
 * Quelle ist FIBUZWO (Rechnungsbuch, Feld KTR = Projekt):
 *   - Kosten     = Eingangsrechnungen (ART=RE, TYP=HR), NETTO
 *   - Erlöse/AZ  = Ausgangsrechnungen (ART=RA, TYP=HR), NETTO (bereits real,
 *                  nicht kumulativ); Typ aus dem verknüpften Dokument (RNR↔NAME).
 *   - Gutschrift = ART=RA, TYP=HG (Vorzeichen negativ).
 * DOKUMENT liefert Projektkopf (Bezeichnung/Kunde) und Rechnungstyp (TYPUNDNR).
 * ADRESSEN löst die Kundennummer in einen Namen auf.
 */

// --- Normalisierte Eingabe-Rows (vom Backend aus DBF erzeugt) -------------

export interface HapakDokRow {
  id: string;
  name: string;
  projname: string;
  kunde: string;
  kundesuch: string;
  typundnr: string;
  betreff: string;
  datum: Date | null;
  netto: number;
}

export interface HapakFibuRow {
  art: string; // RA | RE
  typ: string; // HR | ZA | HG
  rnr: string;
  ktr: string; // = Projekt (PROJNAME)
  adrNr: string;
  adrSuch: string;
  betreff: string;
  netto: number;
  zahlung: number;
  offen: number;
  belegdat: Date | null;
  /** Gegenkonto (KONTO_G): bei Eingangsrechnungen das Aufwandskonto (SKR04). */
  kontoG: string;
}

export interface HapakAdrRow {
  kuNr: string;
  name: string;
  name2: string;
  strasse: string;
  plz: string;
  ort: string;
}

/** Zeile aus LOHNBUCH.DBF (Zeiterfassung je Mitarbeiter und Tag). */
export interface HapakLohnRow {
  ktr: string; // Projekt (PROJNAME)
  tag: Date | null;
  minuten: number; // MINSUM
  pause: number; // PAUSE (Minuten)
  satzEk: number; // LSATZ_EK = interner Stundensatz in €
  storno: boolean; // STORNOFLAG
}

// --- Ausgabe --------------------------------------------------------------

export interface ImportZahlung {
  datum: Date | null;
  betragNetto: number;
  bezahlt: number;
  offen: number;
  art: ZahlungsArt;
  rechnungsNr: string;
  beschreibung: string;
}

export interface ImportKostenposition {
  datum: Date | null;
  betragNetto: number;
  rechnungsNr: string;
  lieferant: string; // ADR_SUCH der Eingangsrechnung
  beschreibung: string;
  /** Aus dem Aufwandskonto abgeleitete Kostenart (SKR04-Heuristik). */
  art: KostenArt;
  konto: string;
  /** Nur bei Lohn-Positionen: Stunden des Monats. */
  stunden?: number;
}

/**
 * Aggregiert Lohnbuch-Zeilen zu monatlichen Kostenpositionen je Projekt (KTR).
 * Lohnkosten = (Minuten − Pause) / 60 × interner Stundensatz, monatlich
 * summiert (39k Einzeltage würden die Listen fluten). Datum = Monatsletzter,
 * damit die Stichtags-Filterung (31.12.) korrekt greift.
 */
export function aggregiereLohnJeProjekt(
  rows: HapakLohnRow[],
  stichtag?: Date | null,
): Map<string, ImportKostenposition[]> {
  interface Monat {
    stunden: number;
    kosten: number;
  }
  const proMonat = new Map<string, Map<string, Monat>>(); // ktr -> "yyyy-mm" -> Monat

  for (const r of rows) {
    const ktr = r.ktr.trim();
    if (!ktr || r.storno || !(r.tag instanceof Date)) continue;
    if (stichtag && r.tag > stichtag) continue;
    const stunden = Math.max(0, r.minuten - r.pause) / 60;
    const kosten = stunden * r.satzEk;
    if (kosten <= 0) continue;

    const key = `${r.tag.getFullYear()}-${String(r.tag.getMonth() + 1).padStart(2, '0')}`;
    if (!proMonat.has(ktr)) proMonat.set(ktr, new Map());
    const m = proMonat.get(ktr)!;
    const akt = m.get(key) ?? { stunden: 0, kosten: 0 };
    akt.stunden += stunden;
    akt.kosten += kosten;
    m.set(key, akt);
  }

  const ergebnis = new Map<string, ImportKostenposition[]>();
  for (const [ktr, monate] of proMonat) {
    const liste: ImportKostenposition[] = [...monate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, m]) => {
        const [jahr, monat] = key.split('-').map(Number);
        return {
          datum: new Date(jahr, monat, 0), // Monatsletzter
          betragNetto: round2(m.kosten),
          rechnungsNr: '',
          lieferant: '',
          beschreibung: `Eigenleistung Lohn ${String(monat).padStart(2, '0')}/${jahr} (${m.stunden.toFixed(1).replace('.', ',')} h)`,
          art: 'LOHN' as KostenArt,
          konto: '',
          stunden: round2(m.stunden),
        };
      });
    ergebnis.set(ktr, liste);
  }
  return ergebnis;
}

/**
 * Kostenart aus dem SKR04-Aufwandskonto der Eingangsrechnung ableiten:
 *   59xx = Fremdleistungen/Fremdarbeiten -> FREMDLEISTUNG
 *   5xxx (sonst, v.a. 54xx Wareneingang) -> MATERIAL
 *   alles andere                          -> SONSTIGES
 * (Pragmatische Heuristik; bei Bedarf später über Einstellungen konfigurierbar.)
 */
export function kontoZuKostenart(konto: string): KostenArt {
  const k = konto.trim();
  if (!k) return 'SONSTIGES';
  if (k.startsWith('59')) return 'FREMDLEISTUNG';
  if (k.startsWith('5')) return 'MATERIAL';
  return 'SONSTIGES';
}

export interface ImportProjekt {
  projektnummer: string; // Anzeige-Nummer JJ-NNNNN (wie in HAPAK sichtbar)
  projname: string; // interner HAPAK-Schlüssel (PROJNAME), z.B. PZZ25000003
  bezeichnung: string;
  kunde: string;
  kundenadresse?: string;
  auftragssummeNetto: number; // Vorschlag (editierbar)
  auftragssummeQuelle: string; // woraus abgeleitet
  istKostenStichtag: number; // Σ Eingangsrechnungen + Lohn (bis Stichtag)
  lohnKosten: number; // davon Lohn (Eigenleistung)
  lohnStunden: number;
  startdatum: Date | null;
  /** Geschätzter echter Projekt-Start: Datum der ersten Ausgangsrechnung (sonst null). */
  projektStartGeschaetzt: Date | null;
  enddatum: Date | null; // Schlussrechnung; null => läuft
  laeuft: boolean;
  sammelprojekt: boolean; // "Kleinprojekte"-Bündel -> Sonderbehandlung
  zahlungen: ImportZahlung[];
  kostenpositionen: ImportKostenposition[];
  anzahlEingangsrechnungen: number;
  anzahlAusgangsrechnungen: number;
}

export interface MappingOptionen {
  abJahr: number; // nur Projekte mit Aktivität ab diesem Jahr
  stichtag?: Date | null; // Grenze für istKosten/Anzahlungen (optional)
  lohn?: HapakLohnRow[]; // Lohnbuch-Zeilen (werden monatlich aggregiert)
}

function jahr(d: Date | null): number | null {
  return d instanceof Date ? d.getFullYear() : null;
}

/**
 * Rekonstruiert die in HAPAK sichtbare Anzeige-Nummer JJ-NNNNN aus dem
 * internen PROJNAME und dem Projektjahr. HAPAK speichert sie nicht direkt,
 * leitet sie aber so ab: Jahr aus dem Projektdatum, laufende Nummer aus den
 * Ziffern des PROJNAME (z.B. PZZ25000003 + 2025 -> 25-00003, PY00002 + 2024 -> 24-00002).
 */
export function anzeigeNummer(projname: string, datum: Date | null): string {
  const ziffern = (projname.match(/\d+/g) ?? []).join('');
  const seq = ziffern ? Number(ziffern) % 100000 : 0;
  const j = datum instanceof Date ? datum.getFullYear() % 100 : null;
  if (j == null) return projname;
  return `${String(j).padStart(2, '0')}-${String(seq).padStart(5, '0')}`;
}

function hapakTypZuZahlungsart(typundnr: string): ZahlungsArt {
  const t = mapHapakDokumentTyp(typundnr);
  switch (t) {
    case 'ABSCHLAGSRECHNUNG':
      return 'ABSCHLAG';
    case 'GUTSCHRIFT':
      return 'STORNO';
    case 'SCHLUSSRECHNUNG':
      return 'SCHLUSSRECHNUNG';
    case 'RECHNUNG':
      return 'RECHNUNG';
    default:
      // Fallback (Eingangsrechnung sollte hier nicht ankommen, weil wir nur
      // RA verarbeiten): wie eine normale Rechnung behandeln.
      return 'RECHNUNG';
  }
}

/**
 * Bildet aus HAPAK-Rohdaten die Import-Projekte (gruppiert über PROJNAME/KTR).
 * Nur Projekte mit Aktivität ab `abJahr` werden zurückgegeben.
 */
export function mappeHapakImport(
  dokumente: HapakDokRow[],
  fibu: HapakFibuRow[],
  adressen: HapakAdrRow[],
  opt: MappingOptionen,
): ImportProjekt[] {
  const stichtag = opt.stichtag ?? null;

  // Adressen-Index.
  const adrByNr = new Map<string, HapakAdrRow>();
  for (const a of adressen) adrByNr.set(a.kuNr.trim(), a);

  // Dokumente je Projekt + Index NAME->Dokument (für Rechnungstyp via RNR).
  const dokByProj = new Map<string, HapakDokRow[]>();
  const dokByName = new Map<string, HapakDokRow>();
  for (const d of dokumente) {
    const p = d.projname.trim();
    if (p) {
      if (!dokByProj.has(p)) dokByProj.set(p, []);
      dokByProj.get(p)!.push(d);
    }
    if (d.name.trim()) dokByName.set(d.name.trim(), d);
  }

  // FIBU je Projekt (KTR).
  const fibuByProj = new Map<string, HapakFibuRow[]>();
  for (const f of fibu) {
    const p = f.ktr.trim();
    if (!p) continue;
    if (!fibuByProj.has(p)) fibuByProj.set(p, []);
    fibuByProj.get(p)!.push(f);
  }

  // Lohnbuch monatlich je Projekt aggregieren (bereits stichtagsgefiltert).
  const lohnByProj = aggregiereLohnJeProjekt(opt.lohn ?? [], stichtag);

  const projektnamen = new Set<string>([
    ...dokByProj.keys(),
    ...fibuByProj.keys(),
    ...lohnByProj.keys(),
  ]);
  const ergebnis: ImportProjekt[] = [];

  for (const proj of projektnamen) {
    const dks = dokByProj.get(proj) ?? [];
    const fbs = fibuByProj.get(proj) ?? [];
    const lohnPos = lohnByProj.get(proj) ?? [];

    // Aktivität ab Jahr?
    const aktiv =
      dks.some((d) => (jahr(d.datum) ?? 0) >= opt.abJahr) ||
      fbs.some((f) => (jahr(f.belegdat) ?? 0) >= opt.abJahr) ||
      lohnPos.some((l) => (jahr(l.datum) ?? 0) >= opt.abJahr);
    if (!aktiv) continue;

    // Projektkopf (NAME == PROJNAME) für Bezeichnung/Kunde.
    const kopf = dks.find((d) => d.name.trim() === proj) ?? dks[0];
    const kundeNr = (
      kopf?.kunde ||
      dks.find((d) => d.kunde.trim())?.kunde ||
      fbs.find((f) => f.adrNr.trim())?.adrNr ||
      ''
    ).trim();
    const adr = adrByNr.get(kundeNr);
    const kundeSuch = (
      kopf?.kundesuch ||
      dks.find((d) => d.kundesuch.trim())?.kundesuch ||
      fbs.find((f) => f.adrSuch.trim())?.adrSuch ||
      ''
    ).trim();
    const kundeName = adr ? [adr.name, adr.name2].filter(Boolean).join(' ').trim() : kundeSuch;
    const kundenadresse = adr
      ? [adr.strasse, [adr.plz, adr.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : undefined;

    // FIBU auswerten.
    const bisStichtag = (d: Date | null) => !stichtag || (d instanceof Date && d <= stichtag);

    const eingang = fbs.filter((f) => f.art === 'RE' && f.typ === 'HR');
    const ausgang = fbs.filter((f) => f.art === 'RA' && f.typ === 'HR');
    const gutschrift = fbs.filter((f) => f.art === 'RA' && f.typ === 'HG');

    // Lohn (bereits monatlich aggregiert + stichtagsgefiltert).
    const lohnKosten = round2(lohnPos.reduce((s, l) => s + l.betragNetto, 0));
    const lohnStunden = round2(lohnPos.reduce((s, l) => s + (l.stunden ?? 0), 0));

    const istKosten = round2(
      eingang.filter((f) => bisStichtag(f.belegdat)).reduce((s, f) => s + f.netto, 0) +
        lohnKosten,
    );

    // Eingangsrechnungen + Lohn-Monate als einzelne Kostenpositionen.
    const kostenpositionen: ImportKostenposition[] = [
      ...eingang
        .filter((f) => bisStichtag(f.belegdat))
        .map((f) => ({
          datum: f.belegdat,
          betragNetto: round2(f.netto),
          // Eingangsrechnungs-Nummern kommen vom Lieferanten und werden
          // unveraendert uebernommen (kein HAPAK-Schluessel-Format).
          rechnungsNr: f.rnr.trim(),
          lieferant: f.adrSuch.trim(),
          beschreibung: f.betreff.trim(),
          art: kontoZuKostenart(f.kontoG),
          konto: f.kontoG.trim(),
        })),
      ...lohnPos,
    ];

    const zahlungen: ImportZahlung[] = [];
    for (const f of ausgang.filter((x) => bisStichtag(x.belegdat))) {
      const dok = dokByName.get(f.rnr.trim());
      zahlungen.push({
        datum: f.belegdat,
        betragNetto: round2(f.netto),
        bezahlt: round2(f.zahlung),
        offen: round2(f.offen),
        art: dok ? hapakTypZuZahlungsart(dok.typundnr) : 'RECHNUNG',
        // Ausgangsrechnungs-Nummer in das menschliche Anzeigeformat wandeln
        // (RZZ25000053 -> 25-00053), wie auf der ausgedruckten Rechnung.
        rechnungsNr: anzeigeBelegnummer(f.rnr.trim(), f.belegdat),
        beschreibung: f.betreff.trim(),
      });
    }
    for (const f of gutschrift.filter((x) => bisStichtag(x.belegdat))) {
      zahlungen.push({
        datum: f.belegdat,
        betragNetto: round2(-Math.abs(f.netto)),
        bezahlt: round2(-Math.abs(f.zahlung)),
        offen: round2(f.offen),
        art: 'STORNO',
        rechnungsNr: anzeigeBelegnummer(f.rnr.trim(), f.belegdat),
        beschreibung: f.betreff.trim(),
      });
    }

    // Start = frühestes Datum, Ende = jüngste Schlussrechnung.
    const alleDaten = [
      ...dks.map((d) => d.datum),
      ...fbs.map((f) => f.belegdat),
    ].filter((d): d is Date => d instanceof Date);
    const startdatum = alleDaten.length ? new Date(Math.min(...alleDaten.map((d) => d.getTime()))) : null;

    const schluss = ausgang
      .filter((f) => {
        const dok = dokByName.get(f.rnr.trim());
        return dok && mapHapakDokumentTyp(dok.typundnr) === 'SCHLUSSRECHNUNG';
      })
      .map((f) => f.belegdat)
      .filter((d): d is Date => d instanceof Date);
    const enddatum = schluss.length ? new Date(Math.max(...schluss.map((d) => d.getTime()))) : null;

    // Auftragssumme = Summe der Ausgangsrechnungen (netto, abzgl. Gutschriften).
    // Angebote/AB sind in HAPAK nicht eindeutig genug; die Rechnungen sind real.
    const summeAusgang = ausgang.reduce((s, f) => s + f.netto, 0);
    const summeGutschrift = gutschrift.reduce((s, f) => s + Math.abs(f.netto), 0);
    const auftragssummeNetto = round2(summeAusgang - summeGutschrift);
    const auftragssummeQuelle = 'Ausgangsrechnungen';

    const bezeichnung = (kopf?.betreff || fbs[0]?.betreff || proj).trim();
    ergebnis.push({
      projektnummer: anzeigeNummer(proj, kopf?.datum ?? startdatum),
      projname: proj,
      bezeichnung,
      sammelprojekt: /kleinprojekt/i.test(bezeichnung),
      kunde: kundeName || '(unbekannt)',
      kundenadresse,
      auftragssummeNetto,
      auftragssummeQuelle,
      istKostenStichtag: istKosten,
      lohnKosten,
      lohnStunden,
      startdatum,
      enddatum,
      laeuft: enddatum === null,
      projektStartGeschaetzt: ausgang
        .map((f) => f.belegdat)
        .filter((d): d is Date => d instanceof Date)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
      zahlungen,
      kostenpositionen,
      anzahlEingangsrechnungen: eingang.length,
      anzahlAusgangsrechnungen: ausgang.length,
    });
  }

  ergebnis.sort((a, b) => a.projektnummer.localeCompare(b.projektnummer));
  return ergebnis;
}
