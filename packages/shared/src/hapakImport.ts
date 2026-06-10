import { round2 } from './abgrenzung.js';
import { mapHapakDokumentTyp } from './hapak.js';
import type { ZahlungsArt } from './types.js';

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
}

export interface HapakAdrRow {
  kuNr: string;
  name: string;
  name2: string;
  strasse: string;
  plz: string;
  ort: string;
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

export interface ImportProjekt {
  projektnummer: string; // PROJNAME
  bezeichnung: string;
  kunde: string;
  kundenadresse?: string;
  auftragssummeNetto: number; // Vorschlag (editierbar)
  auftragssummeQuelle: string; // woraus abgeleitet
  istKostenStichtag: number; // Σ Eingangsrechnungen (bis Stichtag)
  startdatum: Date | null;
  enddatum: Date | null; // Schlussrechnung; null => läuft
  laeuft: boolean;
  sammelprojekt: boolean; // "Kleinprojekte"-Bündel -> Sonderbehandlung
  zahlungen: ImportZahlung[];
  anzahlEingangsrechnungen: number;
  anzahlAusgangsrechnungen: number;
}

export interface MappingOptionen {
  abJahr: number; // nur Projekte mit Aktivität ab diesem Jahr
  stichtag?: Date | null; // Grenze für istKosten/Anzahlungen (optional)
}

function jahr(d: Date | null): number | null {
  return d instanceof Date ? d.getFullYear() : null;
}

function hapakTypZuZahlungsart(typundnr: string): ZahlungsArt {
  const t = mapHapakDokumentTyp(typundnr);
  switch (t) {
    case 'ABSCHLAGSRECHNUNG':
      return 'ABSCHLAG';
    case 'GUTSCHRIFT':
      return 'STORNO';
    case 'SCHLUSSRECHNUNG':
    case 'RECHNUNG':
    default:
      return 'SCHLUSSRECHNUNG';
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

  const projektnamen = new Set<string>([...dokByProj.keys(), ...fibuByProj.keys()]);
  const ergebnis: ImportProjekt[] = [];

  for (const proj of projektnamen) {
    const dks = dokByProj.get(proj) ?? [];
    const fbs = fibuByProj.get(proj) ?? [];

    // Aktivität ab Jahr?
    const aktiv =
      dks.some((d) => (jahr(d.datum) ?? 0) >= opt.abJahr) ||
      fbs.some((f) => (jahr(f.belegdat) ?? 0) >= opt.abJahr);
    if (!aktiv) continue;

    // Projektkopf (NAME == PROJNAME) für Bezeichnung/Kunde.
    const kopf = dks.find((d) => d.name.trim() === proj) ?? dks[0];
    const kundeNr = (kopf?.kunde || fbs[0]?.adrNr || '').trim();
    const adr = adrByNr.get(kundeNr);
    const kundeName = adr
      ? [adr.name, adr.name2].filter(Boolean).join(' ').trim()
      : (kopf?.kundesuch || fbs[0]?.adrSuch || '').trim();
    const kundenadresse = adr
      ? [adr.strasse, [adr.plz, adr.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : undefined;

    // FIBU auswerten.
    const bisStichtag = (d: Date | null) => !stichtag || (d instanceof Date && d <= stichtag);

    const eingang = fbs.filter((f) => f.art === 'RE' && f.typ === 'HR');
    const ausgang = fbs.filter((f) => f.art === 'RA' && f.typ === 'HR');
    const gutschrift = fbs.filter((f) => f.art === 'RA' && f.typ === 'HG');

    const istKosten = round2(
      eingang.filter((f) => bisStichtag(f.belegdat)).reduce((s, f) => s + f.netto, 0),
    );

    const zahlungen: ImportZahlung[] = [];
    for (const f of ausgang.filter((x) => bisStichtag(x.belegdat))) {
      const dok = dokByName.get(f.rnr.trim());
      zahlungen.push({
        datum: f.belegdat,
        betragNetto: round2(f.netto),
        bezahlt: round2(f.zahlung),
        offen: round2(f.offen),
        art: dok ? hapakTypZuZahlungsart(dok.typundnr) : 'SCHLUSSRECHNUNG',
        rechnungsNr: f.rnr.trim(),
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
        rechnungsNr: f.rnr.trim(),
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
      projektnummer: proj,
      bezeichnung,
      sammelprojekt: /kleinprojekt/i.test(bezeichnung),
      kunde: kundeName || '(unbekannt)',
      kundenadresse,
      auftragssummeNetto,
      auftragssummeQuelle,
      istKostenStichtag: istKosten,
      startdatum,
      enddatum,
      laeuft: enddatum === null,
      zahlungen,
      anzahlEingangsrechnungen: eingang.length,
      anzahlAusgangsrechnungen: ausgang.length,
    });
  }

  ergebnis.sort((a, b) => a.projektnummer.localeCompare(b.projektnummer));
  return ergebnis;
}
