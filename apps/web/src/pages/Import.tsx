import { useState } from 'react';
import { api, type HapakTestErgebnis, type ImportProjekt } from '../api';
import { euro, datum } from '../format';
import { useAppState } from '../state';
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
  const { geschaeftsjahre, gewaehltesGjId } = useAppState();
  const gj = geschaeftsjahre.find((g) => g.id === gewaehltesGjId);
  const [laedt, setLaedt] = useState(false);
  const [ergebnis, setErgebnis] = useState<HapakTestErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const [vorProjekte, setVorProjekte] = useState<ImportProjekt[] | null>(null);
  const [vorLaedt, setVorLaedt] = useState(false);
  const [vorFehler, setVorFehler] = useState<string | null>(null);

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

  async function vorschauLaden() {
    setVorLaedt(true);
    setVorFehler(null);
    setVorProjekte(null);
    try {
      const r = await api.hapakVorschau(2024, gj?.ende ?? null);
      setVorProjekte(r.projekte);
    } catch (e) {
      setVorFehler((e as Error).message);
    } finally {
      setVorLaedt(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-anthrazit">HAPAK-Anbindung (Synology/NAS)</h2>
        <div className="flex gap-2">
          <button
            onClick={testen}
            disabled={laedt}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            {laedt ? 'Teste …' : 'Verbindung testen'}
          </button>
          <button
            onClick={vorschauLaden}
            disabled={vorLaedt}
            className="rounded-lg bg-anthrazit px-3 py-2 text-sm font-semibold text-white hover:bg-dunkelblau disabled:opacity-50"
          >
            {vorLaedt ? 'Lädt Projekte …' : 'Projekte-Vorschau (ab 2024)'}
          </button>
        </div>
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

      {vorFehler && <p className="mt-3 text-sm text-red-600">Vorschau-Fehler: {vorFehler}</p>}

      {vorProjekte && (
        <div className="mt-5">
          <p className="mb-2 text-sm text-gray-600">
            <strong>{vorProjekte.length} Projekte</strong> aus HAPAK (ab 2024
            {gj ? `, Stichtag ${datum(gj.ende)}` : ''}) — <em>Vorschau, noch nichts gespeichert.</em>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="p-2">Projektnr.</th>
                  <th className="p-2">Bezeichnung</th>
                  <th className="p-2">Kunde</th>
                  <th className="p-2 text-right">Auftragssumme</th>
                  <th className="p-2 text-right">istKosten</th>
                  <th className="p-2 text-right">AR/ER</th>
                  <th className="p-2">Zeitraum</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {vorProjekte.map((p) => (
                  <tr key={p.projektnummer} className="border-b border-gray-100">
                    <td className="p-2 font-mono">{p.projektnummer}</td>
                    <td className="p-2">
                      {p.bezeichnung}
                      {p.sammelprojekt && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">Sammelprojekt</span>
                      )}
                    </td>
                    <td className="p-2">{p.kunde}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {euro(p.auftragssummeNetto)}
                      <span className="block text-[10px] text-gray-400">{p.auftragssummeQuelle}</span>
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">{euro(p.istKostenStichtag)}</td>
                    <td className="p-2 text-right">{p.anzahlAusgangsrechnungen}/{p.anzahlEingangsrechnungen}</td>
                    <td className="p-2 whitespace-nowrap">
                      {datum(p.startdatum)} – {p.enddatum ? datum(p.enddatum) : '…'}
                    </td>
                    <td className="p-2">
                      {p.laeuft ? (
                        <span className="rounded bg-green-100 px-1.5 text-green-800">läuft</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-1.5 text-gray-600">fertig</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Übernahme in die App (Speichern) baue ich als nächsten Schritt — erst prüfst du hier die Vorschau.
          </p>
        </div>
      )}

      {!ergebnis && !fehler && !vorProjekte && !vorFehler && (
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
