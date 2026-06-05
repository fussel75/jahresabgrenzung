import type { ProjektAbgrenzung } from './abgrenzung.js';

/**
 * Buchungssatz-Vorschlag für die Completed-Contract-Methode.
 *
 * WICHTIG: Platzhalterkonten! Vor erstem Einsatz mit dem Steuerberater
 * abstimmen und unter Einstellungen anpassen (kein Hardcode auf SKR-03).
 */

export interface Buchungssatz {
  projektnummer: string;
  text: string;
  sollKonto: string;
  habenKonto: string;
  betrag: number;
}

export interface KontenConfig {
  kontoUnfertigeLeistung: string; // Default-Beispiel SKR03: 0860
  kontoBestandsveraend: string; // Default-Beispiel SKR03: 8990
}

export const DEFAULT_KONTEN: KontenConfig = {
  kontoUnfertigeLeistung: '0860',
  kontoBestandsveraend: '8990',
};

/**
 * Erzeugt die Buchungssätze (Stichjahr-Aktivierung + Folgejahr-Storno) für ein
 * abzugrenzendes Projekt nach Completed Contract. Basis ist der Wert der
 * aktivierten unfertigen Leistungen (= bis Stichtag angefallene Ist-Kosten).
 */
export function buchungssaetzeCompletedContract(
  projekt: ProjektAbgrenzung,
  konten: KontenConfig = DEFAULT_KONTEN,
): Buchungssatz[] {
  if (!projekt.abgrenzungsbedarf) return [];
  const betrag = projekt.aufteilung.unfertigeLeistungen;
  if (betrag <= 0) return [];

  return [
    {
      projektnummer: projekt.projektnummer,
      text: `Aktivierung unfertige Leistungen ${projekt.projektnummer} (Stichjahr)`,
      sollKonto: konten.kontoUnfertigeLeistung,
      habenKonto: konten.kontoBestandsveraend,
      betrag,
    },
    {
      projektnummer: projekt.projektnummer,
      text: `Storno unfertige Leistungen ${projekt.projektnummer} (Eröffnung Folgejahr)`,
      sollKonto: konten.kontoBestandsveraend,
      habenKonto: konten.kontoUnfertigeLeistung,
      betrag,
    },
  ];
}
