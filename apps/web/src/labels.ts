import type {
  Abgrenzungsmethode,
  ProjektStatus,
  Gewerk,
  ZahlungsArt,
  KostenArt,
} from '@jahresabgrenzung/shared';

export const STATUS_LABEL: Record<ProjektStatus, string> = {
  ANGEBOT: 'Angebot',
  BEAUFTRAGT: 'Beauftragt',
  LAUFEND: 'Laufend',
  ABGESCHLOSSEN: 'Abgeschlossen',
  STORNIERT: 'Storniert',
};

/** Statusfarben laut SPEC.md §9 (Tailwind-Klassen). */
export const STATUS_FARBE: Record<ProjektStatus, string> = {
  ANGEBOT: 'bg-gray-200 text-gray-800',
  BEAUFTRAGT: 'bg-blue-200 text-blue-900',
  LAUFEND: 'bg-green-200 text-green-900',
  ABGESCHLOSSEN: 'bg-emerald-700 text-white',
  STORNIERT: 'bg-red-200 text-red-900',
};

export const GEWERK_LABEL: Record<Gewerk, string> = {
  ZIMMEREI: 'Zimmerei',
  DACHDECKEREI: 'Dachdeckerei',
  SHK: 'SHK',
  GEMISCHT: 'Gemischt',
};

export const METHODE_LABEL: Record<Abgrenzungsmethode, string> = {
  COMPLETED_CONTRACT: 'Completed Contract (HGB-Standard)',
  ZEITANTEILIG: 'Zeitanteilig (pro rata temporis)',
  COST_TO_COST: 'Kostenfortschritt (Cost-to-Cost)',
  MANUELL: 'Manueller Fertigstellungsgrad',
};

export const METHODE_KURZ: Record<Abgrenzungsmethode, string> = {
  COMPLETED_CONTRACT: 'Completed Contract',
  ZEITANTEILIG: 'Zeitanteilig',
  COST_TO_COST: 'Cost-to-Cost',
  MANUELL: 'Manuell',
};

/** Methoden mit eingeschränkter HGB-Zulässigkeit (gelbe Warnung). */
export const METHODE_HGB_WARNUNG: Record<Abgrenzungsmethode, boolean> = {
  COMPLETED_CONTRACT: false,
  ZEITANTEILIG: false,
  COST_TO_COST: true,
  MANUELL: true,
};

export const ZAHLUNGSART_LABEL: Record<ZahlungsArt, string> = {
  ANZAHLUNG: 'Anzahlung',
  ABSCHLAG: 'Abschlag',
  SCHLUSSRECHNUNG: 'Schlussrechnung',
  STORNO: 'Storno',
};

export const KOSTENART_LABEL: Record<KostenArt, string> = {
  MATERIAL: 'Material',
  LOHN: 'Lohn',
  SUBUNTERNEHMER: 'Subunternehmer',
  FREMDLEISTUNG: 'Fremdleistung',
  SONSTIGES: 'Sonstiges',
};
