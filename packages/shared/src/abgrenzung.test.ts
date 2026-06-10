import { describe, it, expect } from 'vitest';
import {
  Abgrenzungsmethode,
  ProjektStatus,
  Gewerk,
  ZahlungsArt,
} from './types.js';
import {
  berechneProjektAbgrenzung,
  berechneAbgrenzung,
  berechneAlleMethoden,
  hatAbgrenzungsbedarf,
  effektivesEnde,
  zeitanteilStichjahr,
  differenzInTagen,
  type ProjektBerechnung,
  type GeschaeftsjahrBerechnung,
} from './abgrenzung.js';

/** Lokales Datum (TZ-unabhängig): Monat 1-basiert. */
const d = (jahr: number, monat: number, tag: number) =>
  new Date(jahr, monat - 1, tag);

/** Geschäftsjahr 2026: 01.01.2026 – 31.12.2026 (Stichtag). */
const GJ2026: GeschaeftsjahrBerechnung = {
  jahr: 2026,
  beginn: d(2026, 1, 1),
  ende: d(2026, 12, 31),
};

/** Schaltjahr 2024: 01.01.2024 – 31.12.2024. */
const GJ2024: GeschaeftsjahrBerechnung = {
  jahr: 2024,
  beginn: d(2024, 1, 1),
  ende: d(2024, 12, 31),
};

/** Basis-Projekt; per Override anpassbar. */
function projekt(over: Partial<ProjektBerechnung> = {}): ProjektBerechnung {
  return {
    id: 'p1',
    projektnummer: '2026-001',
    bezeichnung: 'Testprojekt',
    startdatumGeplant: d(2026, 1, 1),
    enddatumGeplant: d(2026, 12, 31),
    startdatumIst: null,
    enddatumIst: null,
    auftragssummeNetto: 100000,
    gesamtkostenGeplant: 80000,
    istKostenStichtag: 0,
    fertigstellungGradManuell: null,
    status: ProjektStatus.LAUFEND,
    zahlungen: [],
    ...over,
  };
}

describe('Hilfsfunktionen', () => {
  it('differenzInTagen zählt inklusive beider Endtage', () => {
    expect(differenzInTagen(d(2026, 1, 1), d(2026, 1, 1))).toBe(1);
    expect(differenzInTagen(d(2026, 1, 1), d(2026, 1, 31))).toBe(31);
  });
});

// --- Testfall 1 ----------------------------------------------------------
describe('Testfall 1: Projekt komplett im Stichjahr (kein Abgrenzungsbedarf)', () => {
  const p = projekt({
    startdatumGeplant: d(2026, 3, 1),
    enddatumGeplant: d(2026, 9, 30),
  });

  it('hat keinen Abgrenzungsbedarf', () => {
    expect(hatAbgrenzungsbedarf(p, GJ2026)).toBe(false);
  });

  it('weist Auftragssumme vollständig dem Stichjahr zu', () => {
    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.COMPLETED_CONTRACT)!;
    expect(r.abgrenzungsbedarf).toBe(false);
    expect(r.aufteilung.anteilStichjahrProzent).toBe(100);
    expect(r.aufteilung.auftragssummeStichjahr).toBe(100000);
    expect(r.aufteilung.auftragssummeFolgejahr).toBe(0);
  });
});

// --- Testfall 2 ----------------------------------------------------------
describe('Testfall 2: Projekt komplett im Folgejahr (kein Abgrenzungsbedarf)', () => {
  const p = projekt({
    startdatumGeplant: d(2027, 2, 1),
    enddatumGeplant: d(2027, 8, 1),
  });

  it('hat keinen Abgrenzungsbedarf', () => {
    expect(hatAbgrenzungsbedarf(p, GJ2026)).toBe(false);
  });

  it('weist Auftragssumme vollständig dem Folgejahr zu', () => {
    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.ZEITANTEILIG)!;
    expect(r.abgrenzungsbedarf).toBe(false);
    expect(r.aufteilung.anteilStichjahrProzent).toBe(0);
    expect(r.aufteilung.auftragssummeStichjahr).toBe(0);
    expect(r.aufteilung.auftragssummeFolgejahr).toBe(100000);
  });
});

// --- Testfall 3 ----------------------------------------------------------
describe('Testfall 3: Projekt über Jahreswechsel — alle 4 Methoden', () => {
  // 01.11.2026 – 28.02.2027, A=100.000, GK=80.000, IK=20.000
  const p = projekt({
    startdatumGeplant: d(2026, 11, 1),
    enddatumGeplant: d(2027, 2, 28),
    auftragssummeNetto: 100000,
    gesamtkostenGeplant: 80000,
    istKostenStichtag: 20000,
    fertigstellungGradManuell: 0.5,
  });

  it('erkennt Abgrenzungsbedarf', () => {
    expect(hatAbgrenzungsbedarf(p, GJ2026)).toBe(true);
  });

  it('Completed Contract: kein Ertrag/Aufwand im Stichjahr, Kosten aktiviert', () => {
    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.COMPLETED_CONTRACT)!;
    expect(r.aufteilung.anteilStichjahrProzent).toBe(0);
    expect(r.aufteilung.auftragssummeStichjahr).toBe(0);
    expect(r.aufteilung.auftragssummeFolgejahr).toBe(100000);
    expect(r.aufteilung.aufwandStichjahr).toBe(0);
    expect(r.aufteilung.aufwandFolgejahr).toBe(80000);
    expect(r.aufteilung.unfertigeLeistungen).toBe(20000);
  });

  it('Zeitanteilig: pro rata temporis (61 von 120 Tagen)', () => {
    const za = zeitanteilStichjahr(p.startdatumGeplant, p.enddatumGeplant, GJ2026);
    expect(za.tageStichjahr).toBe(61);
    expect(za.tageGesamt).toBe(120);

    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.ZEITANTEILIG)!;
    expect(r.aufteilung.anteilStichjahrProzent).toBe(50.83);
    expect(r.aufteilung.auftragssummeStichjahr).toBe(50833.33);
    expect(r.aufteilung.aufwandStichjahr).toBe(40666.67);
  });

  it('Cost-to-Cost: Fertigstellungsgrad 25% aus Ist-Kosten', () => {
    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.COST_TO_COST)!;
    expect(r.aufteilung.anteilStichjahrProzent).toBe(25);
    expect(r.aufteilung.auftragssummeStichjahr).toBe(25000);
    expect(r.aufteilung.aufwandStichjahr).toBe(20000);
    expect(r.aufteilung.unfertigeLeistungen).toBe(0);
  });

  it('Manuell: subjektiver Fertigstellungsgrad 50%', () => {
    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.MANUELL)!;
    expect(r.aufteilung.anteilStichjahrProzent).toBe(50);
    expect(r.aufteilung.auftragssummeStichjahr).toBe(50000);
    expect(r.aufteilung.aufwandStichjahr).toBe(20000);
  });

  it('berechneAlleMethoden liefert alle vier Ergebnisse', () => {
    const alle = berechneAlleMethoden(p, GJ2026);
    expect(Object.keys(alle)).toHaveLength(4);
    expect(alle.COMPLETED_CONTRACT?.aufteilung.auftragssummeStichjahr).toBe(0);
    expect(alle.COST_TO_COST?.aufteilung.auftragssummeStichjahr).toBe(25000);
  });
});

// --- Testfall 4 ----------------------------------------------------------
describe('Testfall 4: Projekt mit Anzahlungen', () => {
  const p = projekt({
    startdatumGeplant: d(2026, 11, 1),
    enddatumGeplant: d(2027, 2, 28),
    istKostenStichtag: 15000,
    zahlungen: [
      { datum: d(2026, 6, 1), betragNetto: 30000, art: ZahlungsArt.ANZAHLUNG },
      { datum: d(2026, 10, 1), betragNetto: 10000, art: ZahlungsArt.ABSCHLAG },
      // Nach Stichtag -> darf NICHT mitgezählt werden:
      { datum: d(2027, 1, 15), betragNetto: 5000, art: ZahlungsArt.ABSCHLAG },
    ],
  });

  it('passiviert erhaltene Anzahlungen bis zum Stichtag (Completed Contract)', () => {
    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.COMPLETED_CONTRACT)!;
    expect(r.aufteilung.erhalteneAnzahlungen).toBe(40000);
    // Kein Ertrag realisiert -> komplette Anzahlung als PRAP/Verbindlichkeit:
    expect(r.aufteilung.prap).toBe(40000);
  });

  it('berücksichtigt Storni und ignoriert Zahlungen nach dem Stichtag', () => {
    const pMitStorno = projekt({
      ...p,
      zahlungen: [
        ...p.zahlungen!,
        { datum: d(2026, 11, 1), betragNetto: 5000, art: ZahlungsArt.STORNO },
      ],
    });
    const r = berechneProjektAbgrenzung(
      pMitStorno,
      GJ2026,
      Abgrenzungsmethode.COMPLETED_CONTRACT,
    )!;
    expect(r.aufteilung.erhalteneAnzahlungen).toBe(35000);
  });
});

// --- Testfall 5 ----------------------------------------------------------
describe('Testfall 5: Projekt ohne Ist-Kosten (Cost-to-Cost, Division durch 0)', () => {
  const p = projekt({
    startdatumGeplant: d(2026, 11, 1),
    enddatumGeplant: d(2027, 2, 28),
    gesamtkostenGeplant: 0,
    istKostenStichtag: 0,
  });

  it('liefert endliche Werte ohne NaN/Infinity', () => {
    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.COST_TO_COST)!;
    expect(Number.isFinite(r.aufteilung.anteilStichjahrProzent)).toBe(true);
    expect(Number.isFinite(r.aufteilung.auftragssummeStichjahr)).toBe(true);
    expect(r.aufteilung.anteilStichjahrProzent).toBe(0);
    expect(r.aufteilung.auftragssummeStichjahr).toBe(0);
    expect(r.aufteilung.aufwandStichjahr).toBe(0);
  });

  it('liefert auch bei Ist-Kosten ohne Gesamtkosten keine Infinity', () => {
    const p2 = projekt({ ...p, istKostenStichtag: 5000 });
    const r = berechneProjektAbgrenzung(p2, GJ2026, Abgrenzungsmethode.COST_TO_COST)!;
    expect(Number.isFinite(r.aufteilung.auftragssummeStichjahr)).toBe(true);
    expect(r.aufteilung.anteilStichjahrProzent).toBe(0);
  });
});

// --- Zusatz: Angebot wird ausgeschlossen ---------------------------------
describe('Status ANGEBOT (noch nicht beauftragt) wird ausgeschlossen', () => {
  const p = projekt({
    startdatumGeplant: d(2026, 11, 1),
    enddatumGeplant: d(2027, 2, 28),
    status: ProjektStatus.ANGEBOT,
  });
  it('liefert null', () => {
    expect(
      berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.COMPLETED_CONTRACT),
    ).toBeNull();
  });
});

// --- Testfall 6 ----------------------------------------------------------
describe('Testfall 6: Projekt mit Status STORNIERT (wird ausgeschlossen)', () => {
  const p = projekt({
    startdatumGeplant: d(2026, 11, 1),
    enddatumGeplant: d(2027, 2, 28),
    status: ProjektStatus.STORNIERT,
    istKostenStichtag: 20000,
  });

  it('einzelnes Projekt liefert null', () => {
    expect(
      berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.COMPLETED_CONTRACT),
    ).toBeNull();
  });

  it('wird in Liste und Summen nicht berücksichtigt', () => {
    const aktiv = projekt({
      id: 'p2',
      startdatumGeplant: d(2026, 11, 1),
      enddatumGeplant: d(2027, 2, 28),
      istKostenStichtag: 10000,
    });
    const erg = berechneAbgrenzung(
      [p, aktiv],
      GJ2026,
      Abgrenzungsmethode.COMPLETED_CONTRACT,
    );
    expect(erg.projekte).toHaveLength(1);
    expect(erg.projekte[0].projektId).toBe('p2');
    expect(erg.summen.unfertigeLeistungen).toBe(10000);
  });
});

// --- Testfall 7 ----------------------------------------------------------
describe('Testfall 7: enddatumIst vor enddatumGeplant', () => {
  // Geplant über Jahreswechsel, aber Ist-Fertigstellung noch im Stichjahr.
  const p = projekt({
    startdatumGeplant: d(2026, 10, 1),
    enddatumGeplant: d(2027, 2, 15),
    enddatumIst: d(2026, 12, 20),
    istKostenStichtag: 18000,
  });

  it('verwendet das Ist-Enddatum', () => {
    expect(effektivesEnde(p)).toEqual(d(2026, 12, 20));
  });

  it('hat dadurch keinen Abgrenzungsbedarf mehr (im Stichjahr fertig)', () => {
    expect(hatAbgrenzungsbedarf(p, GJ2026)).toBe(false);
    const r = berechneProjektAbgrenzung(p, GJ2026, Abgrenzungsmethode.COMPLETED_CONTRACT)!;
    expect(r.abgrenzungsbedarf).toBe(false);
    expect(r.aufteilung.auftragssummeStichjahr).toBe(100000);
  });
});

// --- Testfall 8 ----------------------------------------------------------
describe('Testfall 8: Schaltjahr-Tagesberechnung', () => {
  it('zählt den Schalttag (29.02.2024) korrekt mit', () => {
    // 01.02.2024 – 01.03.2024 umfasst 29 Februartage + 1 = 30 Tage.
    expect(differenzInTagen(d(2024, 2, 1), d(2024, 3, 1))).toBe(30);
    // Im Nicht-Schaltjahr 2023 dagegen nur 29 Tage.
    expect(differenzInTagen(d(2023, 2, 1), d(2023, 3, 1))).toBe(29);
  });

  it('berechnet den Stichjahr-Anteil im Schaltjahr leap-aware', () => {
    // Projekt 15.02.2024 – 15.03.2025 im Geschäftsjahr 2024 (Schaltjahr).
    const p = projekt({
      startdatumGeplant: d(2024, 2, 15),
      enddatumGeplant: d(2025, 3, 15),
      auftragssummeNetto: 100000,
      gesamtkostenGeplant: 50000,
    });
    expect(hatAbgrenzungsbedarf(p, GJ2024)).toBe(true);

    const za = zeitanteilStichjahr(p.startdatumGeplant, p.enddatumGeplant, GJ2024);
    // 15.02.2024 – 31.12.2024 inkl. Schalttag = 321 Tage.
    expect(za.tageStichjahr).toBe(321);

    const r = berechneProjektAbgrenzung(p, GJ2024, Abgrenzungsmethode.ZEITANTEILIG)!;
    expect(r.aufteilung.anteilStichjahrProzent).toBe(
      Number(((321 / za.tageGesamt) * 100).toFixed(2)),
    );
  });
});

// --- Aggregation / Summen -------------------------------------------------
describe('Summenbildung über mehrere Projekte', () => {
  it('aggregiert Bilanzpositionen korrekt (Completed Contract)', () => {
    const a = projekt({
      id: 'a',
      startdatumGeplant: d(2026, 11, 1),
      enddatumGeplant: d(2027, 3, 1),
      istKostenStichtag: 20000,
    });
    const b = projekt({
      id: 'b',
      startdatumGeplant: d(2026, 12, 1),
      enddatumGeplant: d(2027, 4, 1),
      istKostenStichtag: 30000,
    });
    const erg = berechneAbgrenzung([a, b], GJ2026, Abgrenzungsmethode.COMPLETED_CONTRACT);
    expect(erg.summen.unfertigeLeistungen).toBe(50000);
    expect(erg.summen.auftragssummeFolgejahr).toBe(200000);
    expect(erg.methode).toBe('COMPLETED_CONTRACT');
  });
});

// Stelle sicher, dass Gewerk-Enum exportiert ist (Smoke-Test für types-Barrel).
describe('types-Barrel', () => {
  it('exportiert Gewerk', () => {
    expect(Gewerk.ZIMMEREI).toBe('ZIMMEREI');
  });
});
