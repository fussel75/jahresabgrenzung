import { join } from 'node:path';
import {
  mappeHapakImport,
  type ImportProjekt,
  type HapakDokRow,
  type HapakFibuRow,
  type HapakAdrRow,
} from '@jahresabgrenzung/shared';
import {
  hapakConfigAusEnv,
  anmelden,
  logout,
  downloadDatei,
  tempVerzeichnis,
  type HapakSession,
} from './client.js';
import { dbfAlle } from './dbf.js';

export interface VorschauErgebnis {
  ok: boolean;
  fehler?: string;
  abJahr: number;
  stichtag: string | null;
  projekte: ImportProjekt[];
}

const S = (v: unknown): string => (v == null ? '' : String(v).trim());
const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const D = (v: unknown): Date | null => (v instanceof Date ? v : null);

async function ladeDbf(
  session: HapakSession,
  datenPfad: string,
  name: string,
  tmp: string,
): Promise<Record<string, unknown>[]> {
  const ziel = join(tmp, name);
  await downloadDatei(session, `${datenPfad}/${name}`, ziel);
  // Memo-Datei (.FPT) mitnehmen, falls vorhanden.
  const fpt = name.replace(/\.DBF$/i, '.FPT');
  try {
    await downloadDatei(session, `${datenPfad}/${fpt}`, join(tmp, fpt));
  } catch {
    /* optional */
  }
  return dbfAlle(ziel);
}

/**
 * Lädt DOKUMENT/FIBUZWO/ADRESSEN read-only vom NAS, mappt sie zu Import-
 * Projekten (ab `abJahr`, bis `stichtag`). Speichert NICHTS.
 */
export async function hapakImportVorschau(
  abJahr: number,
  stichtag: Date | null,
): Promise<VorschauErgebnis> {
  const basis = { ok: false as const, abJahr, stichtag: stichtag?.toISOString() ?? null, projekte: [] };

  const { config } = hapakConfigAusEnv();
  if (!config) return { ...basis, fehler: 'NAS-Zugang nicht konfiguriert (HAPAK_NAS_*).' };

  const { session } = await anmelden(config);
  if (!session) return { ...basis, fehler: 'Anmeldung am NAS fehlgeschlagen.' };

  try {
    const datenPfad = `${config.basisPfad}/Daten`;
    const fibuPfad = `${config.basisPfad}/Fibu`;
    const adrPfad = `${config.basisPfad}/Adressen`;
    const tmp = await tempVerzeichnis();

    const [dokRoh, fibuRoh, adrRoh] = await Promise.all([
      ladeDbf(session, datenPfad, 'DOKUMENT.DBF', tmp),
      ladeDbf(session, fibuPfad, 'FIBUZWO.DBF', tmp),
      ladeDbf(session, adrPfad, 'ADRESSEN.DBF', tmp),
    ]);

    const dokumente: HapakDokRow[] = dokRoh.map((r) => ({
      id: S(r.ID), name: S(r.NAME), projname: S(r.PROJNAME), kunde: S(r.KUNDE),
      kundesuch: S(r.KUNDESUCH), typundnr: S(r.TYPUNDNR), betreff: S(r.BETREFF),
      datum: D(r.DATUM), netto: N(r.NETTO),
    }));
    const fibu: HapakFibuRow[] = fibuRoh.map((r) => ({
      art: S(r.ART), typ: S(r.TYP), rnr: S(r.RNR), ktr: S(r.KTR), adrNr: S(r.ADR_NR),
      adrSuch: S(r.ADR_SUCH), betreff: S(r.BETREFF), netto: N(r.NETTO),
      zahlung: N(r.ZAHLUNG), offen: N(r.OFFEN), belegdat: D(r.BELEGDAT),
      kontoG: S(r.KONTO_G),
    }));
    const adressen: HapakAdrRow[] = adrRoh.map((r) => ({
      kuNr: S(r.KU_NR), name: S(r.NAME), name2: S(r.NAME2), strasse: S(r.STRASSE),
      plz: S(r.PLZ), ort: S(r.ORT),
    }));

    const projekte = mappeHapakImport(dokumente, fibu, adressen, { abJahr, stichtag });
    return { ok: true, abJahr, stichtag: stichtag?.toISOString() ?? null, projekte };
  } catch (e) {
    return { ...basis, fehler: (e as Error).message };
  } finally {
    await logout(session);
  }
}
