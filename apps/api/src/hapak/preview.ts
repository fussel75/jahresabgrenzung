import { join } from 'node:path';
import {
  hapakConfigAusEnv,
  login,
  logout,
  listOrdner,
  downloadDatei,
  tempVerzeichnis,
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
 * Read-only-Verbindungstest: meldet sich am NAS an, liest den Daten-Ordner,
 * lädt DOKUMENT.DBF (+ ggf. Memo) und parst die ersten Datensätze.
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
  schritte.push({
    schritt: 'Konfiguration',
    ok: true,
    info: `Server ${config.baseUrl}, Basis-Pfad "${config.basisPfad}"`,
  });

  let sid: string | undefined;
  try {
    sid = await login(config);
    schritte.push({ schritt: 'Anmeldung (FileStation)', ok: true, info: 'erfolgreich' });
  } catch (e) {
    schritte.push({ schritt: 'Anmeldung (FileStation)', ok: false, info: (e as Error).message });
    return { ok: false, schritte };
  }

  try {
    const datenPfad = `${config.basisPfad}/Daten`;
    const dateien = await listOrdner(config, sid, datenPfad);
    schritte.push({
      schritt: 'Ordner lesen',
      ok: true,
      info: `${dateien.length} Einträge in "${datenPfad}"`,
    });

    const tmp = await tempVerzeichnis();
    const dbfZiel = join(tmp, 'DOKUMENT.DBF');
    await downloadDatei(config, sid, `${datenPfad}/DOKUMENT.DBF`, dbfZiel);
    try {
      await downloadDatei(config, sid, `${datenPfad}/DOKUMENT.FPT`, join(tmp, 'DOKUMENT.FPT'));
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
  } catch (e) {
    schritte.push({ schritt: 'Daten lesen', ok: false, info: (e as Error).message });
    return { ok: false, schritte };
  } finally {
    if (sid) await logout(config, sid);
  }
}
