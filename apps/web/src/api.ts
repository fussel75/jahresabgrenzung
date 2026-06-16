import type {
  Abgrenzungsmethode,
  ProjektStatus,
  Gewerk,
  ZahlungsArt,
  KostenArt,
  AbgrenzungsErgebnis,
} from '@jahresabgrenzung/shared';

// --- API-nahe Typen (serialisiert, Beträge als number) ---

export interface Zahlung {
  id: string;
  projektId: string;
  datum: string;
  betragNetto: number;
  art: ZahlungsArt;
  rechnungsNr?: string | null;
  beschreibung?: string | null;
}

export interface Kostenposition {
  id: string;
  projektId: string;
  datum: string;
  betragNetto: number;
  art: KostenArt;
  rechnungsNr?: string | null;
  beschreibung?: string | null;
}

export interface Szenario {
  id: string;
  name: string;
  beschreibung?: string | null;
  methode: Abgrenzungsmethode;
  kostenartenAktiv?: string | null;
  anzahlProjekte: number;
  erstelltAm: string;
  geaendertAm: string;
}

export interface Projekt {
  id: string;
  projektnummer: string;
  bezeichnung: string;
  kunde: string;
  kundenadresse?: string | null;
  startdatumGeplant: string;
  enddatumGeplant: string;
  startdatumIst?: string | null;
  enddatumIst?: string | null;
  projektStartManuell?: string | null;
  auftragssummeNetto: number;
  gesamtkostenGeplant: number;
  istKostenStichtag: number;
  fertigstellungGradManuell?: number | null;
  status: ProjektStatus;
  gewerk: Gewerk;
  notizen?: string | null;
  zahlungen?: Zahlung[];
  kostenpositionen?: Kostenposition[];
}

export interface Geschaeftsjahr {
  id: string;
  jahr: number;
  beginn: string;
  ende: string;
  abgeschlossen: boolean;
}

export interface Einstellungen {
  id: string;
  standardMethode: Abgrenzungsmethode;
  steuerberaterName?: string | null;
  steuerberaterAdresse?: string | null;
  steuerberaterEmail?: string | null;
  kontoUnfertigeLeistung?: string | null;
  kontoBestandsveraend?: string | null;
  kostenartenAktiv?: string | null;
}

export interface HapakTestSchritt {
  schritt: string;
  ok: boolean;
  info: string;
}

export interface HapakTestErgebnis {
  ok: boolean;
  schritte: HapakTestSchritt[];
  vorschau?: {
    felder: string[];
    anzahlGesamt: number;
    zeilen: Record<string, unknown>[];
  };
}

export interface ImportProjekt {
  projektnummer: string;
  projname: string;
  bezeichnung: string;
  kunde: string;
  kundenadresse?: string;
  auftragssummeNetto: number;
  auftragssummeQuelle: string;
  istKostenStichtag: number;
  lohnKosten: number;
  lohnStunden: number;
  startdatum: string | null;
  enddatum: string | null;
  laeuft: boolean;
  sammelprojekt: boolean;
  anzahlEingangsrechnungen: number;
  anzahlAusgangsrechnungen: number;
  zahlungen: unknown[];
}

export interface HapakVorschauErgebnis {
  ok: boolean;
  fehler?: string;
  abJahr: number;
  stichtag: string | null;
  projekte: ImportProjekt[];
}

export interface HapakUebernahmeErgebnis {
  ok: boolean;
  uebernommen: number;
  fehler: number;
  details: Array<{
    projname: string;
    projektnummer: string;
    aktion: 'neu' | 'aktualisiert' | 'fehler';
    fehler?: string;
  }>;
}

// --- Fetch-Wrapper ---

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: Array<{ feld: string; nachricht: string }>,
  ) {
    super(message);
  }
}

async function request<T>(pfad: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${pfad}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const daten = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiError(res.status, daten?.fehler ?? res.statusText, daten?.issues);
  }
  return daten as T;
}

export const api = {
  // Projekte
  projekte: (params?: Record<string, string>) =>
    request<Projekt[]>(`/projekte${params ? '?' + new URLSearchParams(params) : ''}`),
  projekt: (id: string) => request<Projekt>(`/projekte/${id}`),
  projektAnlegen: (daten: unknown) =>
    request<Projekt>('/projekte', { method: 'POST', body: JSON.stringify(daten) }),
  projektAendern: (id: string, daten: unknown) =>
    request<Projekt>(`/projekte/${id}`, { method: 'PUT', body: JSON.stringify(daten) }),
  projektLoeschen: (id: string) => request<void>(`/projekte/${id}`, { method: 'DELETE' }),
  zahlungAnlegen: (projektId: string, daten: unknown) =>
    request<Zahlung>(`/projekte/${projektId}/zahlungen`, {
      method: 'POST',
      body: JSON.stringify(daten),
    }),
  zahlungLoeschen: (id: string) => request<void>(`/zahlungen/${id}`, { method: 'DELETE' }),
  kostenpositionAnlegen: (projektId: string, daten: unknown) =>
    request<Kostenposition>(`/projekte/${projektId}/kostenpositionen`, {
      method: 'POST',
      body: JSON.stringify(daten),
    }),
  kostenpositionLoeschen: (id: string) =>
    request<void>(`/kostenpositionen/${id}`, { method: 'DELETE' }),
  kostenpositionAendern: (id: string, daten: { art?: KostenArt; beschreibung?: string | null; rechnungsNr?: string | null }) =>
    request<Kostenposition>(`/kostenpositionen/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(daten),
    }),

  // Geschäftsjahre
  geschaeftsjahre: () => request<Geschaeftsjahr[]>('/geschaeftsjahre'),
  geschaeftsjahrAnlegen: (daten: unknown) =>
    request<Geschaeftsjahr>('/geschaeftsjahre', { method: 'POST', body: JSON.stringify(daten) }),
  geschaeftsjahrLoeschen: (id: string) =>
    request<void>(`/geschaeftsjahre/${id}`, { method: 'DELETE' }),

  // Einstellungen
  einstellungen: () => request<Einstellungen>('/einstellungen'),
  einstellungenSpeichern: (daten: unknown) =>
    request<Einstellungen>('/einstellungen', { method: 'PUT', body: JSON.stringify(daten) }),

  // Abgrenzung
  abgrenzung: (geschaeftsjahrId: string, methode: Abgrenzungsmethode) =>
    request<AbgrenzungsErgebnis>(`/abgrenzung/${geschaeftsjahrId}?methode=${methode}`),

  // HAPAK — liefert das Diagnose-Ergebnis auch bei Fehlern (HTTP 502).
  hapakTest: async (): Promise<HapakTestErgebnis> => {
    const res = await fetch('/api/import/hapak/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    const daten = text ? JSON.parse(text) : null;
    if (daten && Array.isArray(daten.schritte)) return daten as HapakTestErgebnis;
    throw new ApiError(res.status, daten?.fehler ?? res.statusText);
  },

  hapakVorschau: async (abJahr: number, stichtag: string | null): Promise<HapakVorschauErgebnis> => {
    const res = await fetch('/api/import/hapak/vorschau', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abJahr, stichtag }),
    });
    const text = await res.text();
    const daten = text ? JSON.parse(text) : null;
    if (daten && Array.isArray(daten.projekte)) return daten as HapakVorschauErgebnis;
    throw new ApiError(res.status, daten?.fehler ?? res.statusText);
  },

  // Szenarien
  szenarien: () => request<Szenario[]>('/szenarien'),
  szenarioSpeichern: (daten: { name: string; beschreibung?: string | null; methode: string }) =>
    request<Szenario>('/szenarien', { method: 'POST', body: JSON.stringify(daten) }),
  szenarioAktualisieren: (id: string, methode: string) =>
    request<{ ok: boolean; anzahlProjekte: number }>(
      `/szenarien/${id}/aktualisieren`,
      { method: 'POST', body: JSON.stringify({ methode }) },
    ),
  szenarioAnwenden: (id: string) =>
    request<{ ok: boolean; projekteAktualisiert: number; methode: string }>(
      `/szenarien/${id}/anwenden`,
      { method: 'POST' },
    ),
  szenarioLoeschen: (id: string) => request<void>(`/szenarien/${id}`, { method: 'DELETE' }),

  hapakUebernehmen: async (
    abJahr: number,
    stichtag: string | null,
    projnames: string[],
  ): Promise<HapakUebernahmeErgebnis> => {
    const res = await fetch('/api/import/hapak/uebernahme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abJahr, stichtag, projnames }),
    });
    const text = await res.text();
    const daten = text ? JSON.parse(text) : null;
    if (daten && Array.isArray(daten.details)) return daten as HapakUebernahmeErgebnis;
    throw new ApiError(res.status, daten?.fehler ?? res.statusText);
  },
};
