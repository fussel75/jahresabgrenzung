import { differenceInCalendarDays } from 'date-fns';
import {
  Abgrenzungsmethode,
  ProjektStatus,
  ZahlungsArt,
  type ZahlungInput,
} from './types.js';

/**
 * Abgrenzungslogik (Kernstück, HGB-orientiert).
 *
 * Pro Projekt und Stichtag (31.12. des Geschäftsjahres) wird für jede der vier
 * Methoden berechnet, wie sich Aufwand und Ertrag auf Stichjahr und Folgejahr
 * verteilen und welche Bilanzpositionen daraus entstehen.
 *
 * Die Funktionen arbeiten auf reinen `number`/`Date`-Werten (entkoppelt von
 * Prisma), damit sie ohne Datenbank getestet werden können.
 *
 * --- Festgelegte Semantik (im Zweifel pragmatisch, siehe README) ---
 *
 * Maßgebliche Daten: Ist-Datum wenn vorhanden, sonst Plan-Datum
 *   (effektiverStart = startdatumIst ?? startdatumGeplant, analog Ende).
 *
 * Abgrenzungsbedarf: effektiverStart ≤ Stichtag UND effektivesEnde > Stichtag.
 *
 * STORNIERTe Projekte werden vollständig ausgeschlossen (liefern `null`).
 *
 * Bilanzpositionen werden einheitlich abgeleitet:
 *   unfertigeLeistungen = max(0, istKosten − aufwandStichjahr)
 *   arap                = max(0, aufwandStichjahr − istKosten)
 *   erhalteneAnzahlungen= Summe Anzahlungen/Abschläge bis Stichtag (− Storni)
 *   prap                = max(0, erhalteneAnzahlungen − ertragStichjahr)
 */

// --- Ein-/Ausgabe-Typen ---------------------------------------------------

export interface ProjektBerechnung {
  id: string;
  projektnummer: string;
  bezeichnung: string;
  startdatumGeplant: Date;
  enddatumGeplant: Date;
  startdatumIst?: Date | null;
  enddatumIst?: Date | null;
  /** Manuell gepflegter "Projekt-Start" (Baubeginn). Hat Vorrang vor HAPAK-Anlage. */
  projektStartManuell?: Date | null;
  auftragssummeNetto: number;
  gesamtkostenGeplant: number;
  istKostenStichtag: number;
  fertigstellungGradManuell?: number | null;
  status: ProjektStatus;
  zahlungen?: Array<Pick<ZahlungInput, 'datum' | 'betragNetto' | 'art'>>;
}

export interface GeschaeftsjahrBerechnung {
  jahr: number;
  beginn: Date; // i.d.R. 01.01.
  ende: Date; // Stichtag, i.d.R. 31.12.
}

export interface Aufteilung {
  anteilStichjahrProzent: number;
  auftragssummeStichjahr: number;
  auftragssummeFolgejahr: number;
  aufwandStichjahr: number;
  aufwandFolgejahr: number;
  unfertigeLeistungen: number;
  arap: number;
  prap: number;
  erhalteneAnzahlungen: number;
}

export interface ProjektAbgrenzung {
  projektId: string;
  projektnummer: string;
  bezeichnung: string;
  abgrenzungsbedarf: boolean;
  methode: Abgrenzungsmethode;
  aufteilung: Aufteilung;
}

export interface AbgrenzungsSummen {
  auftragssummeStichjahr: number;
  auftragssummeFolgejahr: number;
  aufwandStichjahr: number;
  aufwandFolgejahr: number;
  unfertigeLeistungen: number;
  arap: number;
  prap: number;
  erhalteneAnzahlungen: number;
}

export interface AbgrenzungsErgebnis {
  geschaeftsjahr: { jahr: number; beginn: string; ende: string };
  methode: Abgrenzungsmethode;
  summen: AbgrenzungsSummen;
  projekte: Array<{
    projektId: string;
    projektnummer: string;
    bezeichnung: string;
    abgrenzungsbedarf: boolean;
    aufteilung: Aufteilung;
  }>;
}

// --- Hilfsfunktionen ------------------------------------------------------

/** Auf Cent kaufmännisch runden (vermeidet Float-Artefakte). */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Anzahl Tage von `von` bis `bis`, **inklusive** beider Endtage. */
export function differenzInTagen(von: Date, bis: Date): number {
  return differenceInCalendarDays(bis, von) + 1;
}

/**
 * Maßgeblicher Start (Priorität): manueller Projekt-Start -> Ist -> Plan.
 * `startdatumGeplant` ist bei HAPAK-Importen das HAPAK-Anlagedatum, also nicht
 * der echte Baubeginn — daher zuletzt.
 */
export function effektiverStart(p: ProjektBerechnung): Date {
  return p.projektStartManuell ?? p.startdatumIst ?? p.startdatumGeplant;
}

/** Maßgebliches Ende: Ist vor Plan. */
export function effektivesEnde(p: ProjektBerechnung): Date {
  return p.enddatumIst ?? p.enddatumGeplant;
}

/**
 * Hat das Projekt zum Stichtag Abgrenzungsbedarf?
 * Start ≤ Stichtag UND Ende > Stichtag (läuft über den Jahreswechsel).
 */
export function hatAbgrenzungsbedarf(
  p: ProjektBerechnung,
  gj: GeschaeftsjahrBerechnung,
): boolean {
  const start = effektiverStart(p);
  const ende = effektivesEnde(p);
  return start <= gj.ende && ende > gj.ende;
}

export interface Zeitanteil {
  tageGesamt: number;
  tageStichjahr: number;
  anteil: number; // 0..1
}

/**
 * Zeitanteil (pro rata temporis) des Projekts, der ins Stichjahr fällt.
 * tageStichjahr = (min(Ende, Stichtag) − max(Start, Beginn GJ)) inkl. Endtage.
 */
export function zeitanteilStichjahr(
  start: Date,
  ende: Date,
  gj: GeschaeftsjahrBerechnung,
): Zeitanteil {
  const tageGesamt = differenzInTagen(start, ende);
  const fensterStart = start > gj.beginn ? start : gj.beginn;
  const fensterEnde = ende < gj.ende ? ende : gj.ende;
  const tageStichjahr =
    fensterEnde < fensterStart ? 0 : differenzInTagen(fensterStart, fensterEnde);
  const anteil = tageGesamt > 0 ? tageStichjahr / tageGesamt : 0;
  return { tageGesamt, tageStichjahr, anteil };
}

/** Bis zum Stichtag vereinnahmte Anzahlungen/Abschläge (abzüglich Storni). */
export function erhalteneAnzahlungenBisStichtag(
  p: ProjektBerechnung,
  gj: GeschaeftsjahrBerechnung,
): number {
  if (!p.zahlungen || p.zahlungen.length === 0) return 0;
  let summe = 0;
  for (const z of p.zahlungen) {
    if (z.datum > gj.ende) continue;
    if (z.art === ZahlungsArt.ANZAHLUNG || z.art === ZahlungsArt.ABSCHLAG) {
      summe += z.betragNetto;
    } else if (z.art === ZahlungsArt.STORNO) {
      summe -= z.betragNetto;
    }
    // SCHLUSSRECHNUNG bleibt unberücksichtigt (Realisierung erst bei Abnahme).
  }
  return Math.max(0, round2(summe));
}

/** Fertigstellungsgrad aus Kostenfortschritt; division-by-zero-sicher. */
export function fertigstellungsgradKosten(
  istKosten: number,
  gesamtkosten: number,
): number {
  if (!gesamtkosten || gesamtkosten <= 0) return 0;
  const grad = istKosten / gesamtkosten;
  if (!Number.isFinite(grad)) return 0;
  return Math.min(1, Math.max(0, grad));
}

// --- Kernberechnung -------------------------------------------------------

/**
 * Berechnet die Abgrenzung für ein einzelnes Projekt nach gewählter Methode.
 * Liefert `null`, wenn das Projekt ausgeschlossen ist (Status STORNIERT).
 */
export function berechneProjektAbgrenzung(
  p: ProjektBerechnung,
  gj: GeschaeftsjahrBerechnung,
  methode: Abgrenzungsmethode,
): ProjektAbgrenzung | null {
  // Stornierte und reine Angebote (noch nicht beauftragt) gehören nicht in
  // die Abgrenzung — kein Vertrag, kein Aufwand, kein Ertrag.
  if (p.status === ProjektStatus.STORNIERT || p.status === ProjektStatus.ANGEBOT) return null;

  // Vor dem Geschäftsjahr abgeschlossen: gehört in eine frühere Periode und
  // darf weder Ertrag noch Aufwand in dieses GJ einbringen.
  if (effektivesEnde(p) < gj.beginn) return null;

  const start = effektiverStart(p);
  const ende = effektivesEnde(p);
  const abgrenzungsbedarf = hatAbgrenzungsbedarf(p, gj);

  const A = p.auftragssummeNetto;
  const GK = p.gesamtkostenGeplant;
  const IK = p.istKostenStichtag;
  const erhAnz = erhalteneAnzahlungenBisStichtag(p, gj);

  // Standardwerte: Projekt liegt komplett in einer Periode.
  let anteil: number;
  let auftragssummeStichjahr: number;
  let aufwandStichjahr: number;

  if (!abgrenzungsbedarf) {
    // Kein Jahreswechsel berührt: alles fällt in genau eine Periode.
    const komplettImStichjahr = ende <= gj.ende;
    if (komplettImStichjahr) {
      // Projekt (geplant/ist) endet bis zum Stichtag -> Stichjahr.
      anteil = 1;
      auftragssummeStichjahr = A;
      aufwandStichjahr = IK > 0 ? IK : GK;
    } else {
      // Projekt beginnt erst nach dem Stichtag -> Folgejahr.
      anteil = 0;
      auftragssummeStichjahr = 0;
      aufwandStichjahr = 0;
    }
  } else {
    switch (methode) {
      case Abgrenzungsmethode.COMPLETED_CONTRACT: {
        // Realisierung erst bei Fertigstellung: kein Ertrag/Aufwand im Stichjahr.
        // Bis zum Stichtag angefallene Kosten werden als unfertige Leistungen
        // aktiviert (siehe Bilanzableitung unten).
        anteil = 0;
        auftragssummeStichjahr = 0;
        aufwandStichjahr = 0;
        break;
      }
      case Abgrenzungsmethode.ZEITANTEILIG: {
        const za = zeitanteilStichjahr(start, ende, gj);
        anteil = za.anteil;
        auftragssummeStichjahr = A * anteil;
        // Anwendung auf die geplanten Gesamtkosten (pro rata temporis).
        aufwandStichjahr = GK * anteil;
        break;
      }
      case Abgrenzungsmethode.COST_TO_COST: {
        const grad = fertigstellungsgradKosten(IK, GK);
        anteil = grad;
        auftragssummeStichjahr = A * grad;
        aufwandStichjahr = IK; // tatsächlich angefallene Kosten
        break;
      }
      case Abgrenzungsmethode.MANUELL: {
        const grad = Math.min(1, Math.max(0, p.fertigstellungGradManuell ?? 0));
        anteil = grad;
        auftragssummeStichjahr = A * grad;
        aufwandStichjahr = IK; // wie Cost-to-Cost, aber subjektiver Grad
        break;
      }
      default: {
        const _exhaustive: never = methode;
        throw new Error(`Unbekannte Methode: ${String(_exhaustive)}`);
      }
    }
  }

  const auftragssummeFolgejahr = A - auftragssummeStichjahr;

  // Aufwand Folgejahr: bei Completed Contract wird der gesamte (geplante)
  // Aufwand erst bei Fertigstellung im Folgejahr wirksam; sonst der Rest.
  let aufwandFolgejahr: number;
  if (abgrenzungsbedarf && methode === Abgrenzungsmethode.COMPLETED_CONTRACT) {
    aufwandFolgejahr = GK;
  } else {
    aufwandFolgejahr = Math.max(0, GK - aufwandStichjahr);
  }

  // --- Bilanzpositionen einheitlich ableiten ---
  const unfertigeLeistungen = Math.max(0, IK - aufwandStichjahr);
  const arap = Math.max(0, aufwandStichjahr - IK);
  const prap = Math.max(0, erhAnz - auftragssummeStichjahr);

  const aufteilung: Aufteilung = {
    anteilStichjahrProzent: round2(anteil * 100),
    auftragssummeStichjahr: round2(auftragssummeStichjahr),
    auftragssummeFolgejahr: round2(auftragssummeFolgejahr),
    aufwandStichjahr: round2(aufwandStichjahr),
    aufwandFolgejahr: round2(aufwandFolgejahr),
    unfertigeLeistungen: round2(unfertigeLeistungen),
    arap: round2(arap),
    prap: round2(prap),
    erhalteneAnzahlungen: round2(erhAnz),
  };

  return {
    projektId: p.id,
    projektnummer: p.projektnummer,
    bezeichnung: p.bezeichnung,
    abgrenzungsbedarf,
    methode,
    aufteilung,
  };
}

/**
 * Berechnet die Abgrenzung für eine Liste von Projekten und aggregiert die
 * Summen. STORNIERTe Projekte werden ausgeschlossen.
 */
export function berechneAbgrenzung(
  projekte: ProjektBerechnung[],
  gj: GeschaeftsjahrBerechnung,
  methode: Abgrenzungsmethode,
): AbgrenzungsErgebnis {
  const ergebnisse = projekte
    .map((p) => berechneProjektAbgrenzung(p, gj, methode))
    .filter((e): e is ProjektAbgrenzung => e !== null);

  const summen: AbgrenzungsSummen = {
    auftragssummeStichjahr: 0,
    auftragssummeFolgejahr: 0,
    aufwandStichjahr: 0,
    aufwandFolgejahr: 0,
    unfertigeLeistungen: 0,
    arap: 0,
    prap: 0,
    erhalteneAnzahlungen: 0,
  };

  for (const e of ergebnisse) {
    const a = e.aufteilung;
    summen.auftragssummeStichjahr += a.auftragssummeStichjahr;
    summen.auftragssummeFolgejahr += a.auftragssummeFolgejahr;
    summen.aufwandStichjahr += a.aufwandStichjahr;
    summen.aufwandFolgejahr += a.aufwandFolgejahr;
    summen.unfertigeLeistungen += a.unfertigeLeistungen;
    summen.arap += a.arap;
    summen.prap += a.prap;
    summen.erhalteneAnzahlungen += a.erhalteneAnzahlungen;
  }

  // Summen auf Cent runden.
  (Object.keys(summen) as Array<keyof AbgrenzungsSummen>).forEach((k) => {
    summen[k] = round2(summen[k]);
  });

  return {
    geschaeftsjahr: {
      jahr: gj.jahr,
      beginn: gj.beginn.toISOString(),
      ende: gj.ende.toISOString(),
    },
    methode,
    summen,
    projekte: ergebnisse.map((e) => ({
      projektId: e.projektId,
      projektnummer: e.projektnummer,
      bezeichnung: e.bezeichnung,
      abgrenzungsbedarf: e.abgrenzungsbedarf,
      aufteilung: e.aufteilung,
    })),
  };
}

/** Berechnet alle vier Methoden für ein Projekt (für den Vergleichs-Tab). */
export function berechneAlleMethoden(
  p: ProjektBerechnung,
  gj: GeschaeftsjahrBerechnung,
): Record<Abgrenzungsmethode, ProjektAbgrenzung | null> {
  return {
    COMPLETED_CONTRACT: berechneProjektAbgrenzung(
      p,
      gj,
      Abgrenzungsmethode.COMPLETED_CONTRACT,
    ),
    ZEITANTEILIG: berechneProjektAbgrenzung(p, gj, Abgrenzungsmethode.ZEITANTEILIG),
    COST_TO_COST: berechneProjektAbgrenzung(p, gj, Abgrenzungsmethode.COST_TO_COST),
    MANUELL: berechneProjektAbgrenzung(p, gj, Abgrenzungsmethode.MANUELL),
  };
}
