import { useEffect, useState } from 'react';
import { parseISO } from 'date-fns';
import type { AbgrenzungsErgebnis, ProjektBerechnung } from '@jahresabgrenzung/shared';
import { api, type Projekt } from './api';
import { useAppState } from './state';

/** Lädt Abgrenzungsergebnis + Projektliste für das gewählte GJ und die Methode. */
export function useAbgrenzung() {
  const { gewaehltesGjId, methode } = useAppState();
  const [ergebnis, setErgebnis] = useState<AbgrenzungsErgebnis | null>(null);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (!gewaehltesGjId) return;
    let aktiv = true;
    setLaedt(true);
    setFehler(null);
    Promise.all([api.abgrenzung(gewaehltesGjId, methode), api.projekte()])
      .then(([erg, proj]) => {
        if (!aktiv) return;
        setErgebnis(erg);
        setProjekte(proj);
      })
      .catch((e) => aktiv && setFehler(e.message))
      .finally(() => aktiv && setLaedt(false));
    return () => {
      aktiv = false;
    };
  }, [gewaehltesGjId, methode]);

  return { ergebnis, projekte, laedt, fehler };
}

/**
 * Maßgeblicher Zeitraum für Anzeige/Abgrenzung.
 * Start-Priorität: manueller Projekt-Start -> Ist -> Plan (= HAPAK-Anlage).
 */
export function effektiverZeitraum(p: Projekt): { start: Date; ende: Date } {
  return {
    start: parseISO(p.projektStartManuell ?? p.startdatumIst ?? p.startdatumGeplant),
    ende: parseISO(p.enddatumIst ?? p.enddatumGeplant),
  };
}

/**
 * "Echt begonnen": Projekt-Start gesetzt ODER bereits Ist-Kosten ODER
 * Zahlungen vorhanden. (Die Listen-API liefert nicht immer Zahlungen mit;
 * istKostenStichtag > 0 ist ein zuverlässiges Signal, dass etwas passiert ist.)
 */
export function projektGestartet(p: Projekt): boolean {
  if (p.projektStartManuell) return true;
  if (p.istKostenStichtag > 0) return true;
  return (p.zahlungen?.length ?? 0) > 0;
}

/** Abgrenzungsbedarf: Start ≤ Stichtag UND Ende > Stichtag (Ende des GJ). */
export function istAbzugrenzen(p: Projekt, gjEnde: Date): boolean {
  if (p.status === 'STORNIERT') return false;
  const { start, ende } = effektiverZeitraum(p);
  return start <= gjEnde && ende > gjEnde;
}

/** Projekt (API-Form) -> Berechnungs-Eingabe für die geteilte Abgrenzungslogik. */
export function projektZuBerechnung(p: Projekt): ProjektBerechnung {
  return {
    id: p.id,
    projektnummer: p.projektnummer,
    bezeichnung: p.bezeichnung,
    startdatumGeplant: parseISO(p.startdatumGeplant),
    enddatumGeplant: parseISO(p.enddatumGeplant),
    startdatumIst: p.startdatumIst ? parseISO(p.startdatumIst) : null,
    enddatumIst: p.enddatumIst ? parseISO(p.enddatumIst) : null,
    auftragssummeNetto: p.auftragssummeNetto,
    gesamtkostenGeplant: p.gesamtkostenGeplant,
    istKostenStichtag: p.istKostenStichtag,
    fertigstellungGradManuell: p.fertigstellungGradManuell ?? null,
    status: p.status,
    zahlungen: (p.zahlungen ?? []).map((z) => ({
      datum: parseISO(z.datum),
      betragNetto: z.betragNetto,
      art: z.art,
    })),
  };
}
