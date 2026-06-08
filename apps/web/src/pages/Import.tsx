import { useState } from 'react';
import { api } from '../api';
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

      <Card>
        <h2 className="font-semibold text-anthrazit">HAPAK-Import (DBF)</h2>
        <LeerHinweis>
          Schnittstelle ist vorbereitet (Endpoint <code>POST /api/import/hapak</code>),
          aber in V1 bewusst noch nicht aktiv. Die tatsächliche HAPAK-Integration
          erfolgt als optionaler späterer Schritt.
        </LeerHinweis>
      </Card>
    </div>
  );
}
