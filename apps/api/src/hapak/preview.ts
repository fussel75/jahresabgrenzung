import { join } from 'node:path';
import {
  hapakConfigAusEnv,
  anmelden,
  logout,
  listOrdner,
  downloadDatei,
  tempVerzeichnis,
  type HapakSession,
} from './client.js';
import { dbfVorschau, type DbfVorschau } from './dbf.js';

export interface TestSchritt {
  schritt: string;
  ok: boolean;
  info: string;
}

export interface HapakTestErgebnis {
  ok: boolean;
  schritte: TestSchritt[];
  vorschau?: DbfVorschau;
}

/**
 * Read-only-Verbindungstest: löst die Adresse auf, meldet sich an, liest den
 * Daten-Ordner, lädt DOKUMENT.DBF und parst die ersten Datensätze.
 * Speichert NICHTS — dient nur der Diagnose und der Spalten-Vorschau.
 */
export async function hapakVerbindungstest(): Promise<HapakTestErgebnis> {
  const schritte: TestSchritt[] = [];
  const { config, fehlend } = hapakConfigAusEnv();
  if (!config) {
    schritte.push({
      schritt: 'Konfiguration',
      ok: false,
      info: `Fehlende Umgebungsvariablen: ${fehlend.join(', ')}`,
    });
    return { ok: false, schritte };
  }
  const ziel = config.directUrl ?? `QuickConnect "${config.quickConnectId}"`;
  schritte.push({
    schritt: 'Konfiguration',
    ok: true,
    info: `Ziel ${ziel}, Basis-Pfad "${config.basisPfad}"`,
  });

  // Auflösen + Anmelden (probiert mehrere Adressen).
  const { session, versuche } = await anmelden(config);
  if (!session) {
    schritte.push({
      schritt: 'Anmeldung (FileStation)',
      ok: false,
      info: `Keine Adresse erfolgreich. Versuche: ${versuche.join(' | ')}`,
    });
    return { ok: false, schritte };
  }
  schritte.push({
    schritt: 'Anmeldung (FileStation)',
    ok: true,
    info: `verbunden über ${new URL(session.baseUrl).host}`,
  });

  try {
    return await leseDokumentVorschau(session, config.basisPfad, schritte);
  } catch (e) {
    schritte.push({ schritt: 'Daten lesen', ok: false, info: (e as Error).message });
    return { ok: false, schritte };
  } finally {
    await logout(session);
  }
}

async function leseDokumentVorschau(
  session: HapakSession,
  basisPfad: string,
  schritte: TestSchritt[],
): Promise<HapakTestErgebnis> {
  const datenPfad = `${basisPfad}/Daten`;
  const dateien = await listOrdner(session, datenPfad);
  schritte.push({
    schritt: 'Ordner lesen',
    ok: true,
    info: `${dateien.length} Einträge in "${datenPfad}"`,
  });

  const tmp = await tempVerzeichnis();
  const dbfZiel = join(tmp, 'DOKUMENT.DBF');
  await downloadDatei(session, `${datenPfad}/DOKUMENT.DBF`, dbfZiel);
  try {
    await downloadDatei(session, `${datenPfad}/DOKUMENT.FPT`, join(tmp, 'DOKUMENT.FPT'));
  } catch {
    /* Memo-Datei evtl. nicht vorhanden — kein Fehler */
  }
  schritte.push({ schritt: 'DOKUMENT.DBF laden', ok: true, info: 'heruntergeladen' });

  const vorschau = await dbfVorschau(dbfZiel, 10);
  schritte.push({
    schritt: 'DBF parsen (CP1252)',
    ok: true,
    info: `${vorschau.anzahlGesamt} Datensätze, ${vorschau.felder.length} Felder`,
  });

  return { ok: true, schritte, vorschau };
}
