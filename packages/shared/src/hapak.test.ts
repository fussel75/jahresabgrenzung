import { describe, it, expect } from 'vitest';
import {
  mapHapakDokumentTyp,
  parseProjektnummer,
  istSammelprojekt,
  berechneAbschlagDeltas,
  anzeigeBelegnummer,
} from './hapak.js';

const d = (iso: string) => new Date(`${iso}T00:00:00`);

describe('mapHapakDokumentTyp', () => {
  it('erkennt Abschlag/Schluss/Gutschrift am Prefix', () => {
    expect(mapHapakDokumentTyp('Abschlagsrechnung Nr. 1')).toBe('ABSCHLAGSRECHNUNG');
    expect(mapHapakDokumentTyp('Schlussrechnung')).toBe('SCHLUSSRECHNUNG');
    expect(mapHapakDokumentTyp('Gutschrift 7')).toBe('GUTSCHRIFT');
  });

  it('erkennt normale Rechnung, aber Abschlag in Klammern hat Vorrang', () => {
    expect(mapHapakDokumentTyp('Rechnung 25-00047')).toBe('RECHNUNG');
    expect(mapHapakDokumentTyp('Rechnung 25-00047 (1. Abschlagsrechnung)')).toBe(
      'ABSCHLAGSRECHNUNG',
    );
  });

  it('ID=5 kennzeichnet Eingangsrechnung (auch bei TYPUNDNR "rechnung")', () => {
    expect(mapHapakDokumentTyp('Rechnung Lieferant', '5')).toBe('EINGANGSRECHNUNG');
    expect(mapHapakDokumentTyp('', 5)).toBe('EINGANGSRECHNUNG');
  });

  it('liefert null für Nicht-Rechnungs-Dokumente', () => {
    expect(mapHapakDokumentTyp('Angebot 25-00047')).toBeNull();
    expect(mapHapakDokumentTyp('Auftragsbestätigung')).toBeNull();
    expect(mapHapakDokumentTyp('')).toBeNull();
  });
});

describe('parseProjektnummer', () => {
  it('parst JJ-NNNNN mit und ohne Bindestrich', () => {
    expect(parseProjektnummer('25-00001')).toEqual({ jahr: 25, lfdNr: 1, normalisiert: '25-00001' });
    expect(parseProjektnummer('26-00032')).toEqual({ jahr: 26, lfdNr: 32, normalisiert: '26-00032' });
    expect(parseProjektnummer('2600032')).toEqual({ jahr: 26, lfdNr: 32, normalisiert: '26-00032' });
  });

  it('liefert null für Ungültiges', () => {
    expect(parseProjektnummer('RZZ26000032')).toBeNull();
    expect(parseProjektnummer('abc')).toBeNull();
    expect(parseProjektnummer('')).toBeNull();
    expect(parseProjektnummer(null)).toBeNull();
  });
});

describe('istSammelprojekt', () => {
  it('erkennt JJ-00001 als Sammelprojekt', () => {
    expect(istSammelprojekt('25-00001')).toBe(true);
    expect(istSammelprojekt('26-00001')).toBe(true);
  });
  it('normale Projekte sind kein Sammelprojekt', () => {
    expect(istSammelprojekt('25-00047')).toBe(false);
    expect(istSammelprojekt('26-00002')).toBe(false);
  });
});

describe('berechneAbschlagDeltas (kumulativ -> echter Betrag)', () => {
  it('berechnet Deltas aus der kumulativen Kette', () => {
    const r = berechneAbschlagDeltas([
      { dokumentnummer: 'A1', datum: d('2026-03-01'), kumulativeNetto: 10000 },
      { dokumentnummer: 'A2', datum: d('2026-06-01'), kumulativeNetto: 25000 },
      { dokumentnummer: 'A3', datum: d('2026-09-01'), kumulativeNetto: 40000 },
    ]);
    expect(r.map((x) => x.deltaNetto)).toEqual([10000, 15000, 15000]);
  });

  it('sortiert unsortierte Eingaben nach Datum', () => {
    const r = berechneAbschlagDeltas([
      { dokumentnummer: 'A3', datum: d('2026-09-01'), kumulativeNetto: 40000 },
      { dokumentnummer: 'A1', datum: d('2026-03-01'), kumulativeNetto: 10000 },
      { dokumentnummer: 'A2', datum: d('2026-06-01'), kumulativeNetto: 25000 },
    ]);
    expect(r.map((x) => x.dokumentnummer)).toEqual(['A1', 'A2', 'A3']);
    expect(r.map((x) => x.deltaNetto)).toEqual([10000, 15000, 15000]);
  });

  it('erste Abschlagsrechnung = ihr eigener kumulativer Betrag', () => {
    const r = berechneAbschlagDeltas([
      { dokumentnummer: 'A1', datum: d('2026-03-01'), kumulativeNetto: 8000 },
    ]);
    expect(r[0].deltaNetto).toBe(8000);
  });
});

describe('anzeigeBelegnummer (HAPAK-Schluessel -> menschliche Belegnummer)', () => {
  it('PZZ/RZZ-Format: Praefix + 2-stelliges Jahr im Schluessel', () => {
    // Verifiziert am echten Beispiel "Rechnung 25-00053" (Ben Ritter, 10.07.2025).
    expect(anzeigeBelegnummer('RZZ25000053')).toBe('25-00053');
    expect(anzeigeBelegnummer('PZZ25000003')).toBe('25-00003');
    expect(anzeigeBelegnummer('PZZ26000010')).toBe('26-00010');
  });

  it('altes Format (Buchstabe = Jahr): Jahr aus Belegdatum ableiten', () => {
    // "AL00008" (2011), "RY00017" (2024) — Jahr steckt im Buchstaben.
    expect(anzeigeBelegnummer('AL00008', d('2011-04-29'))).toBe('11-00008');
    expect(anzeigeBelegnummer('RY00017', d('2024-02-02'))).toBe('24-00017');
    expect(anzeigeBelegnummer('PY00002', d('2024-04-02'))).toBe('24-00002');
  });

  it('ohne Datum bleibt das Jahr leer (Fallback: nur lfd. Nummer)', () => {
    expect(anzeigeBelegnummer('RY00017')).toBe('00017');
  });

  it('rein numerische Eingabe = Lieferanten-Rechnungsnr -> unveraendert', () => {
    // Echte Beispiele aus dem Rechnungseingangsbuch (Holz Junge, GC Gruppe etc.):
    expect(anzeigeBelegnummer('644397', d('2025-04-12'))).toBe('644397');
    expect(anzeigeBelegnummer('645206', d('2025-05-03'))).toBe('645206');
    expect(anzeigeBelegnummer('718874', d('2011-04-28'))).toBe('718874');
    // 5-stellige Lieferanten-Nr ohne Buchstaben: weiterhin unangetastet.
    expect(anzeigeBelegnummer('25008', d('2025-05-09'))).toBe('25008');
  });

  it('leerer/ungueltiger Input', () => {
    expect(anzeigeBelegnummer('')).toBe('');
    expect(anzeigeBelegnummer(null)).toBe('');
    expect(anzeigeBelegnummer('abc/123')).toBe('abc/123');
  });
});
