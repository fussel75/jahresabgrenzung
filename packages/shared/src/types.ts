import { z } from 'zod';

/**
 * Gemeinsame Domänen-Typen und Zod-Schemas.
 *
 * Diese Typen spiegeln das Prisma-Datenmodell (siehe `prisma/schema.prisma`),
 * sind aber bewusst von Prisma entkoppelt: Die Abgrenzungslogik arbeitet auf
 * reinen `number`/`Date`-Werten, damit sie ohne Datenbank testbar ist.
 */

// --- Enums (als const-Objekte + Union-Types, damit sie ohne TS-`enum` auskommen) ---

export const ProjektStatus = {
  ANGEBOT: 'ANGEBOT',
  BEAUFTRAGT: 'BEAUFTRAGT',
  LAUFEND: 'LAUFEND',
  ABGESCHLOSSEN: 'ABGESCHLOSSEN',
  STORNIERT: 'STORNIERT',
} as const;
export type ProjektStatus = (typeof ProjektStatus)[keyof typeof ProjektStatus];

export const Gewerk = {
  ZIMMEREI: 'ZIMMEREI',
  DACHDECKEREI: 'DACHDECKEREI',
  SHK: 'SHK',
  GEMISCHT: 'GEMISCHT',
} as const;
export type Gewerk = (typeof Gewerk)[keyof typeof Gewerk];

export const ZahlungsArt = {
  ANZAHLUNG: 'ANZAHLUNG',
  ABSCHLAG: 'ABSCHLAG',
  SCHLUSSRECHNUNG: 'SCHLUSSRECHNUNG',
  STORNO: 'STORNO',
} as const;
export type ZahlungsArt = (typeof ZahlungsArt)[keyof typeof ZahlungsArt];

export const KostenArt = {
  MATERIAL: 'MATERIAL',
  LOHN: 'LOHN',
  SUBUNTERNEHMER: 'SUBUNTERNEHMER',
  FREMDLEISTUNG: 'FREMDLEISTUNG',
  SONSTIGES: 'SONSTIGES',
} as const;
export type KostenArt = (typeof KostenArt)[keyof typeof KostenArt];

export const ALLE_KOSTENARTEN: KostenArt[] = [
  'MATERIAL',
  'LOHN',
  'SUBUNTERNEHMER',
  'FREMDLEISTUNG',
  'SONSTIGES',
];

/**
 * Parst die Einstellung "kostenartenAktiv" (CSV, z.B. "MATERIAL,LOHN").
 * Null/leer = alle Kostenarten aktiv.
 */
export function parseAktiveKostenarten(csv: string | null | undefined): Set<KostenArt> {
  const s = (csv ?? '').trim();
  if (!s) return new Set(ALLE_KOSTENARTEN);
  const teile = s
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t): t is KostenArt => (ALLE_KOSTENARTEN as string[]).includes(t));
  return teile.length > 0 ? new Set(teile) : new Set(ALLE_KOSTENARTEN);
}

export const Abgrenzungsmethode = {
  COMPLETED_CONTRACT: 'COMPLETED_CONTRACT',
  ZEITANTEILIG: 'ZEITANTEILIG',
  COST_TO_COST: 'COST_TO_COST',
  MANUELL: 'MANUELL',
} as const;
export type Abgrenzungsmethode =
  (typeof Abgrenzungsmethode)[keyof typeof Abgrenzungsmethode];

export const ALLE_METHODEN: Abgrenzungsmethode[] = [
  Abgrenzungsmethode.COMPLETED_CONTRACT,
  Abgrenzungsmethode.ZEITANTEILIG,
  Abgrenzungsmethode.COST_TO_COST,
  Abgrenzungsmethode.MANUELL,
];

// --- Zod-Schemas (geteilt zwischen API und Frontend) ---

const isoDate = z.coerce.date();
const geldBetrag = z.number().finite();

export const zahlungSchema = z.object({
  datum: isoDate,
  betragNetto: geldBetrag,
  art: z.nativeEnum(ZahlungsArt),
  rechnungsNr: z.string().optional().nullable(),
  beschreibung: z.string().optional().nullable(),
});
export type ZahlungInput = z.infer<typeof zahlungSchema>;

export const kostenpositionSchema = z.object({
  datum: isoDate,
  betragNetto: geldBetrag,
  art: z.nativeEnum(KostenArt),
  beschreibung: z.string().optional().nullable(),
});
export type KostenpositionInput = z.infer<typeof kostenpositionSchema>;

export const projektBaseSchema = z.object({
  projektnummer: z.string().min(1, 'Projektnummer erforderlich'),
  bezeichnung: z.string().min(1, 'Bezeichnung erforderlich'),
  kunde: z.string().min(1, 'Kunde erforderlich'),
  kundenadresse: z.string().optional().nullable(),
  startdatumGeplant: isoDate,
  enddatumGeplant: isoDate,
  startdatumIst: isoDate.optional().nullable(),
  enddatumIst: isoDate.optional().nullable(),
  projektStartManuell: isoDate.optional().nullable(),
  auftragssummeNetto: geldBetrag.nonnegative(),
  gesamtkostenGeplant: geldBetrag.nonnegative(),
  istKostenStichtag: geldBetrag.nonnegative().default(0),
  fertigstellungGradManuell: z.number().min(0).max(1).optional().nullable(),
  status: z.nativeEnum(ProjektStatus),
  gewerk: z.nativeEnum(Gewerk),
  notizen: z.string().optional().nullable(),
});

/** Vollständiges Schema für Neuanlage (mit Plausibilitätsprüfung). */
export const projektSchema = projektBaseSchema.refine(
  (p) => p.enddatumGeplant >= p.startdatumGeplant,
  {
    message: 'Geplantes Enddatum muss nach dem Startdatum liegen',
    path: ['enddatumGeplant'],
  },
);
export type ProjektInputDTO = z.infer<typeof projektSchema>;

/** Teil-Update: alle Felder optional. */
export const projektUpdateSchema = projektBaseSchema.partial();
export type ProjektUpdateDTO = z.infer<typeof projektUpdateSchema>;

export const geschaeftsjahrSchema = z
  .object({
    jahr: z.number().int(),
    beginn: isoDate,
    ende: isoDate,
    abgeschlossen: z.boolean().default(false),
  })
  .refine((g) => g.ende > g.beginn, {
    message: 'Ende des Geschäftsjahres muss nach dem Beginn liegen',
    path: ['ende'],
  });
export type GeschaeftsjahrInputDTO = z.infer<typeof geschaeftsjahrSchema>;

export const einstellungenSchema = z.object({
  standardMethode: z.nativeEnum(Abgrenzungsmethode).default('COMPLETED_CONTRACT'),
  steuerberaterName: z.string().optional().nullable(),
  steuerberaterAdresse: z.string().optional().nullable(),
  steuerberaterEmail: z.string().email().optional().nullable(),
  kontoUnfertigeLeistung: z.string().optional().nullable(),
  kontoBestandsveraend: z.string().optional().nullable(),
  kostenartenAktiv: z.string().optional().nullable(),
});
export type EinstellungenInput = z.infer<typeof einstellungenSchema>;
