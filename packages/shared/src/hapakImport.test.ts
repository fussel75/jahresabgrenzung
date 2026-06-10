import { describe, it, expect } from 'vitest';
import {
  mappeHapakImport,
  type HapakDokRow,
  type HapakFibuRow,
  type HapakAdrRow,
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
    netto: 0, zahlung: 0, offen: 0, belegdat: null, ...over,
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
    expect(r[0].projektnummer).toBe('PX1');
    expect(r[0].kunde).toBe('COBET GmbH');
    expect(r[0].bezeichnung).toBe('Neubau MFH');
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
    expect(z.find((x) => x.rechnungsNr === 'RY17')?.art).toBe('ABSCHLAG');
    expect(z.find((x) => x.rechnungsNr === 'RY40')?.art).toBe('SCHLUSSRECHNUNG');
    // Ende = Schlussrechnungsdatum, läuft = false
    expect(r[0].enddatum).toEqual(d('2027-01-15'));
    expect(r[0].laeuft).toBe(false);
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

  it('Auftragssumme-Heuristik: Auftragsbestätigung hat Vorrang vor Angebot', () => {
    const dokumente = [
      dok({ name: 'PX1', projname: 'PX1', betreff: 'BV', datum: d('2024-01-01') }),
      dok({ name: 'A1', projname: 'PX1', typundnr: 'Angebot 24-00006', netto: 60000, datum: d('2024-01-05') }),
      dok({ name: 'AB1', projname: 'PX1', typundnr: 'Auftragsbestätigung 24-00006', netto: 65000, datum: d('2024-01-10') }),
    ];
    const r = mappeHapakImport(dokumente, [], adr, { abJahr: 2024 });
    expect(r[0].auftragssummeNetto).toBe(65000);
    expect(r[0].auftragssummeQuelle).toBe('Auftragsbestätigung');
  });

  it('Auftragssumme fällt auf Ausgangsrechnungen zurück, wenn kein Angebot/AB', () => {
    const fibu = [
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'R1', netto: 20000, belegdat: d('2026-02-01') }),
      fib({ art: 'RA', typ: 'HR', ktr: 'PX1', rnr: 'R2', netto: 15000, belegdat: d('2026-06-01') }),
    ];
    const r = mappeHapakImport([], fibu, adr, { abJahr: 2024 });
    expect(r[0].auftragssummeNetto).toBe(35000);
    expect(r[0].auftragssummeQuelle).toBe('Ausgangsrechnungen');
  });

  it('Gutschrift (HG) wird negativ als STORNO erfasst', () => {
    const fibu = [
      fib({ art: 'RA', typ: 'HG', ktr: 'PX1', rnr: 'G1', netto: 5000, zahlung: 5000, belegdat: d('2026-05-01') }),
    ];
    const r = mappeHapakImport([], fibu, adr, { abJahr: 2024 });
    expect(r[0].zahlungen[0].art).toBe('STORNO');
    expect(r[0].zahlungen[0].betragNetto).toBe(-5000);
  });
});
