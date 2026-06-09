import { useState } from 'react';
import { api, type HapakTestErgebnis } from '../api';
import { Card, LeerHinweis } from '../components/ui';

/** Erwartete CSV-Spalten (Semikolon-getrennt, Kopfzeile). */
const SPALTEN = [
  'projektnummer',
  'bezeichnung',
  'kunde',
  'startdatumGeplant',
  'enddatumGeplant',
  'auftragssummeNetto',
  'gesamtkostenGeplant',
  'status',
  'gewerk',
] as const;

type Zeile = Record<(typeof SPALTEN)[number], string>;

function parseCsv(text: string): Zeile[] {
  const zeilen = text.trim().split(/\r?\n/);
  if (zeilen.length < 2) return [];
  const kopf = zeilen[0].split(';').map((s) => s.trim());
  return zeilen.slice(1).map((z) => {
    const werte = z.split(';');
    const obj: Record<string, string> = {};
    kopf.forEach((k, i) => (obj[k] = (werte[i] ?? '').trim().replace(/^"|"$/g, '')));
    return obj as Zeile;
  });
}

export function Import() {
  const [vorschau, setVorschau] = useState<Zeile[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;
    const reader = new FileReader();
    reader.onload = () => setVorschau(parseCsv(String(reader.result)));
    reader.readAsText(datei, 'utf-8');
  }

  async function importieren() {
    let ok = 0;
    let fehlerhaft = 0;
    for (const z of vorschau) {
      try {
        await api.projektAnlegen({
          projektnummer: z.projektnummer,
          bezeichnung: z.bezeichnung,
          kunde: z.kunde,
          startdatumGeplant: z.startdatumGeplant,
          enddatumGeplant: z.enddatumGeplant,
          auftragssummeNetto: Number(z.auftragssummeNetto.replace(',', '.')),
          gesamtkostenGeplant: Number(z.gesamtkostenGeplant.replace(',', '.')),
          status: z.status || 'BEAUFTRAGT',
          gewerk: z.gewerk || 'GEMISCHT',
        });
        ok++;
      } catch {
        fehlerhaft++;
      }
    }
    setStatus(`${ok} importiert, ${fehlerhaft} fehlerhaft.`);
    setVorschau([]);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-anthrazit">Datenimport</h1>

      <Card>
        <h2 className="font-semibold text-anthrazit">CSV-Import für Projekte</h2>
        <p className="mt-1 text-sm text-gray-600">
          Semikolon-getrennte Datei mit Kopfzeile. Erwartete Spalten:
        </p>
        <code className="mt-2 block overflow-x-auto rounded bg-gray-100 p-2 text-xs">
          {SPALTEN.join(';')}
        </code>
        <input type="file" accept=".csv,text/csv" onChange={dateiGewaehlt} className="mt-3 text-sm" />
        {status && <p className="mt-2 text-sm font-medium text-green-700">{status}</p>}
      </Card>

      {vorschau.length > 0 && (
        <Card className="overflow-x-auto">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-anthrazit">Vorschau ({vorschau.length} Zeilen)</h2>
            <button onClick={importieren} className="rounded-lg bg-anthrazit px-4 py-2 text-sm font-semibold text-white hover:bg-dunkelblau">
              {vorschau.length} Projekte importieren
            </button>
          </div>
          <table className="w-full text-xs">
            <thead className="border-b text-left text-gray-500">
              <tr>{SPALTEN.map((s) => <th key={s} className="p-2">{s}</th>)}</tr>
            </thead>
            <tbody>
              {vorschau.map((z, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {SPALTEN.map((s) => <td key={s} className="p-2">{z[s]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <HapakKarte />
    </div>
  );
}

function HapakKarte() {
  const [laedt, setLaedt] = useState(false);
  const [ergebnis, setErgebnis] = useState<HapakTestErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function testen() {
    setLaedt(true);
    setFehler(null);
    setErgebnis(null);
    try {
      setErgebnis(await api.hapakTest());
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-anthrazit">HAPAK-Anbindung (Synology/NAS)</h2>
        <button
          onClick={testen}
          disabled={laedt}
          className="rounded-lg bg-anthrazit px-3 py-2 text-sm font-semibold text-white hover:bg-dunkelblau disabled:opacity-50"
        >
          {laedt ? 'Teste …' : 'Verbindung testen (read-only)'}
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Liest read-only über die Synology-FileStation-API. Der Test meldet sich an, liest den
        Daten-Ordner und zeigt die Spalten von <code>DOKUMENT.DBF</code> — es wird nichts gespeichert.
      </p>

      {fehler && <p className="mt-3 text-sm text-red-600">Fehler: {fehler}</p>}

      {ergebnis && (
        <div className="mt-4 space-y-4">
          <ul className="space-y-1 text-sm">
            {ergebnis.schritte.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span>{s.ok ? '✅' : '❌'}</span>
                <span className="font-medium">{s.schritt}:</span>
                <span className="text-gray-600">{s.info}</span>
              </li>
            ))}
          </ul>

          {ergebnis.vorschau && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-xs text-gray-500">
                Vorschau {ergebnis.vorschau.felder.length} Felder · erste{' '}
                {ergebnis.vorschau.zeilen.length} von {ergebnis.vorschau.anzahlGesamt} Datensätzen
              </p>
              <table className="w-full text-xs">
                <thead className="border-b bg-gray-50 text-left text-gray-500">
                  <tr>
                    {ergebnis.vorschau.felder.map((f) => (
                      <th key={f} className="p-1 whitespace-nowrap">{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ergebnis.vorschau.zeilen.map((z, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      {ergebnis.vorschau!.felder.map((f) => (
                        <td key={f} className="max-w-[14rem] truncate p-1" title={String(z[f] ?? '')}>
                          {formatWert(z[f])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!ergebnis && !fehler && (
        <LeerHinweis>
          Noch nicht getestet. Voraussetzung: die Variablen <code>HAPAK_NAS_ID</code>,{' '}
          <code>HAPAK_NAS_USER</code>, <code>HAPAK_NAS_PASS</code> sind auf dem Server gesetzt.
        </LeerHinweis>
      )}
    </Card>
  );
}

function formatWert(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
