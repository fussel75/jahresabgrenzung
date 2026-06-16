import type { Projekt, Zahlung, Kostenposition } from '@prisma/client';
import {
  type ProjektBerechnung,
  type ProjektStatus,
  type ZahlungsArt,
} from '@jahresabgrenzung/shared';
import { dec } from './helpers.js';

type ProjektMitRelationen = Projekt & {
  zahlungen?: Zahlung[];
  kostenpositionen?: Kostenposition[];
};

/** Prisma-Projekt -> reine Berechnungs-Eingabe für die Abgrenzungslogik. */
export function toBerechnung(p: ProjektMitRelationen): ProjektBerechnung {
  return {
    id: p.id,
    projektnummer: p.projektnummer,
    bezeichnung: p.bezeichnung,
    startdatumGeplant: p.startdatumGeplant,
    enddatumGeplant: p.enddatumGeplant,
    startdatumIst: p.startdatumIst,
    enddatumIst: p.enddatumIst,
    projektStartManuell: p.projektStartManuell,
    auftragssummeNetto: dec(p.auftragssummeNetto),
    gesamtkostenGeplant: dec(p.gesamtkostenGeplant),
    istKostenStichtag: dec(p.istKostenStichtag),
    fertigstellungGradManuell: p.fertigstellungGradManuell,
    status: p.status as ProjektStatus,
    zahlungen: (p.zahlungen ?? []).map((z) => ({
      datum: z.datum,
      betragNetto: dec(z.betragNetto),
      art: z.art as ZahlungsArt,
    })),
    kostenpositionen: (p.kostenpositionen ?? []).map((k) => ({
      datum: k.datum,
      betragNetto: dec(k.betragNetto),
      art: k.art,
    })),
  };
}

/** Projekt für die JSON-Antwort aufbereiten (Decimal -> number). */
export function serializeProjekt(p: ProjektMitRelationen) {
  return {
    ...p,
    auftragssummeNetto: dec(p.auftragssummeNetto),
    gesamtkostenGeplant: dec(p.gesamtkostenGeplant),
    istKostenStichtag: dec(p.istKostenStichtag),
    zahlungen: p.zahlungen?.map(serializeZahlung),
    kostenpositionen: p.kostenpositionen?.map(serializeKostenposition),
  };
}

export function serializeZahlung(z: Zahlung) {
  return { ...z, betragNetto: dec(z.betragNetto) };
}

export function serializeKostenposition(k: Kostenposition) {
  return { ...k, betragNetto: dec(k.betragNetto) };
}
// rechnungsNr ist nun fester Bestandteil; durch ...k bereits enthalten.
