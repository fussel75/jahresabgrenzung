import { DBFFile } from 'dbffile';

/** DBF-Vorschau (read-only): Spaltennamen + erste Datensätze, CP1252-kodiert. */
export interface DbfVorschau {
  felder: string[];
  anzahlGesamt: number;
  zeilen: Record<string, unknown>[];
}

export async function dbfVorschau(localPfad: string, limit = 10): Promise<DbfVorschau> {
  // readMode 'loose' toleriert kleine Formatabweichungen; CP1252 = HAPAK-Encoding.
  const dbf = await DBFFile.open(localPfad, { encoding: 'cp1252', readMode: 'loose' });
  const felder = dbf.fields.map((f) => f.name);
  const zeilen = (await dbf.readRecords(limit)) as Record<string, unknown>[];
  return { felder, anzahlGesamt: dbf.recordCount, zeilen };
}

/** Liest alle Datensätze einer DBF (CP1252). */
export async function dbfAlle(localPfad: string): Promise<Record<string, unknown>[]> {
  const dbf = await DBFFile.open(localPfad, { encoding: 'cp1252', readMode: 'loose' });
  return (await dbf.readRecords(dbf.recordCount)) as Record<string, unknown>[];
}
