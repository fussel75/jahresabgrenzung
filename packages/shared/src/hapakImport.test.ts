import { describe, it, expect } from 'vitest';
import {
  mappeHapakImport,
  anzeigeNummer,
  aggregiereLohnJeProjekt,
  type HapakDokRow,
  type HapakFibuRow,
  type HapakAdrRow,
  type HapakLohnRow,
} from './hapakImport.js';

const d = (iso: string) => new Date(`${iso}T00:00:00`);

function dok(over: Partial<HapakDokRow>): HapakDokRow {
  return {
    id: '1', name: '', projname: '', kunde: '', kundesuch: '', typundnr: '',
    betreff: '', datum: null, netto: 0, ...over,
  };
}
function fib(over: Partial<HapakFibuRow>): HapakFibuRow {
  return {
    art: 'RA', typ: 'HR', rnr: '', ktr: '', adrNr: '', adrSuch: '', betreff: '',
    netto: 0, zahlung: 0, offen: 0, belegdat: null, kontoG: '', ...over,
  };
}
const adr: HapakAdrRow[] = [
  { kuNr: '11248', name: 'COBET GmbH', name2: '', strasse: 'Bauweg 1', plz: '22000', ort: 'Hamburg' },
];

describe('mappeHapakImport', () => {
  it('gruppiert nach PROJNAME/KTR und filtert ab Jahr', () => {
    const dokumente = [
      dok({ name: 'PX1', projname: 'PX1', kunde: '11248', betreff: 'Neubau MFH', datum: d('2024-01-10') }),
      // Altprojekt vor 2024 -> wird gefiltert
      dok({ name: 'PX9', projname: 'PX9', kunde: '11248', betreff: 'Alt', datum: d('2019-01-10') }),
    ];
    const fibu = [
      fib({ art: 'RE', typ: 'HR', ktr: 'PX1', netto: 1000, belegdat: d('2024-02-01') }),
      fib({ art: 'RE', typ: 'HR', ktr: 'PX9', netto: 500, belegdat: d('2019-02-01') }),
    ];
    const r = mappeHapakImport(dokumente, fibu, adr, { abJahr: 2024 });
    expect(r).toHaveLength(1);
    expect(r[0].projname).toBe('PX1');
    expect(r[0].projektnummer).toBe('24-00001'); // Anzeige-Nummer
    expect(r[0].kunde).toBe('COBET GmbH');
    expect(r[0].bezeichnung).toBe('Neubau MFH');
  });

  it('anzeigeNummer rekonstruiert JJ-NNNNN aus PROJNAME + Jahr', () => {
    expect(anzeigeNummer('PZZ25000003', d('2025-02-12'))).toBe('25-00003');
    expect(anzeigeNummer('PY00002', d('2024-04-02'))).toBe('24-00002');
    expect(anzeigeNummer('PX00006', d('2023-10-17'))).toBe('23-00006');
    expect(anzeigeNummer('PV00003', d('2021-01-01'))).toBe('21-00003');
  });

  it('istKosten = Summe Eingangsrechnungen (RE/HR), Stichtag begrenzt', () => {
    const fibu = [
      fib({ art: 'RE', typ: 'HR', ktr: 'PX1', netto: 1000, belegdat: d('2026-03-01') }),
      fib({ art: 'RE', typ: 'HR', ktr: 'PX1', netto: 2000, belegdat: d('2026-11-01') }),
      // nach Stichtag -> nicht gezählt
      fib({ art: 'RE', typ: 'HR', ktr: 'PX1', netto: 9999, belegdat: d('2027-02-01') }),
      // Zahlungsbuchung (ZA) -> kein Aufwand
      fib({ art: 'RE', typ: 'ZA', ktr: 'PX1', netto: 1234, belegdat: d('2026-03-05') }),
    ];
    const r = mappeHapakImport([], fibu, adr, { abJahr: 2024, stichtag: d('2026-12-31') });
    expect(r[0].istKostenStichtag).toBe(3000);
    expect(r[0].anzahlEingangsrechnungen).toBe(3);
  });

  it('Ausgangsrechnungen -> Zahlungen mit Typ aus verknüpftem Dokument', () => {
    const dokumente = [
      dok({ name: 'PX1', projname: 'PX1', betreff: 'BV', datum: d('2026-01-01') }),
      dok({ name: 'RY17', projname: 'PX1', typundnr: 'Rechnung 26-00017 (1. Abschlagsrechnung)', datum: d('2026-02-01') }),
      dok({ name: 'RY40', projname: 'PX1', typundnr: 'Schlussrechnung 26-00040', datum: d('2027-01-15') }),
    ];
    const fibu = [
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'RY17', netto: 50000, zahlung: 50000, belegdat: d('2026-02-01') }),
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'RY40', netto: 30000, zahlung: 0, offen: 30000, belegdat: d('2027-01-15') }),
    ];
    const r = mappeHapakImport(dokumente, fibu, adr, { abJahr: 2024 });
    const z = r[0].zahlungen;
    expect(z).toHaveLength(2);
    // Rechnungsnummern werden ins menschliche Anzeigeformat gewandelt
    // (RY17 mit Belegdatum 02/2026 -> "26-00017").
    expect(z.find((x) => x.rechnungsNr === '26-00017')?.art).toBe('ABSCHLAG');
    expect(z.find((x) => x.rechnungsNr === '27-00040')?.art).toBe('SCHLUSSRECHNUNG');
    // Ende = Schlussrechnungsdatum, läuft = false
    expect(r[0].enddatum).toEqual(d('2027-01-15'));
    expect(r[0].laeuft).toBe(false);
  });

  it('"Rechnung" (ohne Abschlag/Schluss) wird als RECHNUNG erfasst, nicht als SCHLUSSRECHNUNG', () => {
    // Echtes Beispiel: 25-00032, 25-00045, 26-00045 sind im Projekt Farmsener
    // Landstr. ganz normale Einzelrechnungen, keine Schlussrechnungen.
    const dokumente = [
      dok({ name: 'R32', projname: 'PX1', typundnr: 'Rechnung 25-00032', datum: d('2025-04-17') }),
      dok({ name: 'R45', projname: 'PX1', typundnr: 'Rechnung 25-00045', datum: d('2025-06-04') }),
    ];
    const fibu = [
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'R32', netto: 2500, belegdat: d('2025-04-17') }),
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'R45', netto: 325, belegdat: d('2025-06-04') }),
    ];
    const r = mappeHapakImport(dokumente, fibu, adr, { abJahr: 2024 });
    expect(r[0].zahlungen.every((z) => z.art === 'RECHNUNG')).toBe(true);
    // Projekt gilt trotzdem als laufend (keine echte Schlussrechnung).
    expect(r[0].laeuft).toBe(true);
  });

  it('Fallback ohne Dokument-Zuordnung ergibt RECHNUNG (nicht SCHLUSSRECHNUNG)', () => {
    // FIBU-Eintrag ohne passendes Dokument in DOKUMENT.DBF
    const fibu = [
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'UNBEKANNT', netto: 5000, belegdat: d('2026-03-01') }),
    ];
    const r = mappeHapakImport([], fibu, adr, { abJahr: 2024 });
    expect(r[0].zahlungen[0].art).toBe('RECHNUNG');
    expect(r[0].laeuft).toBe(true);
  });

  it('ohne Schlussrechnung gilt das Projekt als laufend', () => {
    const dokumente = [
      dok({ name: 'RY17', projname: 'PX1', typundnr: 'Rechnung 26-00017 (1. Abschlagsrechnung)', datum: d('2026-02-01') }),
    ];
    const fibu = [
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'RY17', netto: 50000, belegdat: d('2026-02-01') }),
    ];
    const r = mappeHapakImport(dokumente, fibu, adr, { abJahr: 2024 });
    expect(r[0].laeuft).toBe(true);
    expect(r[0].enddatum).toBeNull();
  });

  it('Auftragssumme = Summe der Ausgangsrechnungen (Angebote werden ignoriert)', () => {
    // Fall Ben Ritter: ein 160k-Gewerk-Angebot, aber real nur 1 Rechnung über 8.000.
    const dokumente = [
      dok({ name: 'PX1', projname: 'PX1', betreff: 'Neubau EFH', datum: d('2025-01-01') }),
      dok({ name: 'A1', projname: 'PX1', typundnr: 'Angebot 25-00006', netto: 160000, datum: d('2025-01-05') }),
      dok({ name: 'R53', projname: 'PX1', typundnr: 'Rechnung 25-00053', datum: d('2025-07-10') }),
    ];
    const fibu = [
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'R53', netto: 8000, belegdat: d('2025-07-10') }),
    ];
    const r = mappeHapakImport(dokumente, fibu, adr, { abJahr: 2024 });
    expect(r[0].auftragssummeNetto).toBe(8000);
    expect(r[0].auftragssummeQuelle).toBe('Ausgangsrechnungen');
  });

  it('Kostenart wird aus dem Aufwandskonto abgeleitet (SKR04)', () => {
    const fibu = [
      fib({ art: 'RE', typ: 'HR', ktr: 'PX1', rnr: 'E1', netto: 1000, kontoG: '5400', belegdat: d('2026-02-01') }),
      fib({ art: 'RE', typ: 'HR', ktr: 'PX1', rnr: 'E2', netto: 2000, kontoG: '5900', belegdat: d('2026-03-01') }),
      fib({ art: 'RE', typ: 'HR', ktr: 'PX1', rnr: 'E3', netto: 300, kontoG: '6815', belegdat: d('2026-04-01') }),
    ];
    const r = mappeHapakImport([], fibu, adr, { abJahr: 2024 });
    const arten = Object.fromEntries(r[0].kostenpositionen.map((k) => [k.rechnungsNr, k.art]));
    expect(arten.E1).toBe('MATERIAL');
    expect(arten.E2).toBe('FREMDLEISTUNG');
    expect(arten.E3).toBe('SONSTIGES');
  });

  it('Gutschrift (HG): STORNO-Zahlung negativ und mindert die Auftragssumme', () => {
    const fibu = [
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'R1', netto: 10000, belegdat: d('2026-02-01') }),
      fib({ art: 'RA', typ: 'HG', ktr: 'PX1', rnr: 'G1', netto: 2000, zahlung: 2000, belegdat: d('2026-05-01') }),
    ];
    const r = mappeHapakImport([], fibu, adr, { abJahr: 2024 });
    expect(r[0].auftragssummeNetto).toBe(8000);
    const storno = r[0].zahlungen.find((z) => z.art === 'STORNO');
    expect(storno?.betragNetto).toBe(-2000);
  });
});

describe('aggregiereLohnJeProjekt (Lohnbuch -> monatliche Kostenpositionen)', () => {
  function lohn(over: Partial<HapakLohnRow>): HapakLohnRow {
    return { ktr: 'PX1', tag: null, minuten: 480, pause: 0, satzEk: 30, storno: false, ...over };
  }

  it('aggregiert monatlich: Stunden x Satz, Pause abgezogen, Datum = Monatsletzter', () => {
    const rows = [
      lohn({ tag: d('2026-11-03'), minuten: 570, pause: 30 }), // 9h x 30 = 270
      lohn({ tag: d('2026-11-10'), minuten: 480 }), // 8h x 30 = 240
      lohn({ tag: d('2026-12-01'), minuten: 480 }), // anderer Monat
    ];
    const m = aggregiereLohnJeProjekt(rows);
    const px1 = m.get('PX1')!;
    expect(px1).toHaveLength(2);
    expect(px1[0].betragNetto).toBe(510);
    expect(px1[0].stunden).toBe(17);
    expect(px1[0].datum).toEqual(new Date(2026, 10, 30)); // 30.11.2026
    expect(px1[0].art).toBe('LOHN');
    expect(px1[0].beschreibung).toContain('11/2026');
  });

  it('filtert Storno, fehlendes KTR und Belege nach dem Stichtag', () => {
    const rows = [
      lohn({ tag: d('2026-11-03') }),
      lohn({ tag: d('2026-11-04'), storno: true }),
      lohn({ tag: d('2026-11-05'), ktr: '' }),
      lohn({ tag: d('2027-01-10') }), // nach Stichtag
    ];
    const m = aggregiereLohnJeProjekt(rows, d('2026-12-31'));
    expect(m.get('PX1')).toHaveLength(1);
    expect(m.get('PX1')![0].betragNetto).toBe(240);
  });

  it('fliesst in mappeHapakImport ein: istKosten = Eingangsrechnungen + Lohn', () => {
    const fibu = [
      fib({ art: 'RE', typ: 'HR', ktr: 'PX1', netto: 1000, kontoG: '5400', belegdat: d('2026-02-01') }),
    ];
    const lohnRows = [lohn({ tag: d('2026-03-15'), minuten: 600, satzEk: 25 })]; // 10h x 25 = 250
    const r = mappeHapakImport([], fibu, adr, { abJahr: 2024, lohn: lohnRows });
    expect(r[0].istKostenStichtag).toBe(1250);
    expect(r[0].lohnKosten).toBe(250);
    expect(r[0].lohnStunden).toBe(10);
    expect(r[0].kostenpositionen.filter((k) => k.art === 'LOHN')).toHaveLength(1);
  });

  it('Projekt nur mit Lohnbuchungen (ohne Rechnungen) erscheint trotzdem', () => {
    const lohnRows = [lohn({ ktr: 'PNEU', tag: d('2026-05-02') })];
    const r = mappeHapakImport([], [], adr, { abJahr: 2024, lohn: lohnRows });
    expect(r.map((p) => p.projname)).toContain('PNEU');
  });
});
