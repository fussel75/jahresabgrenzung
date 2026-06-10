import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { STATUS_LABEL, GEWERK_LABEL } from '../labels';
import { Card } from '../components/ui';
import { GeldInput } from '../components/GeldInput';

const leer = {
  projektnummer: '',
  bezeichnung: '',
  kunde: '',
  kundenadresse: '',
  startdatumGeplant: '',
  enddatumGeplant: '',
  auftragssummeNetto: '',
  gesamtkostenGeplant: '',
  istKostenStichtag: '0',
  status: 'BEAUFTRAGT',
  gewerk: 'ZIMMEREI',
  notizen: '',
};

export function ProjektNeu() {
  const navigate = useNavigate();
  const [f, setF] = useState(leer);
  const [issues, setIssues] = useState<Array<{ feld: string; nachricht: string }>>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  function set<K extends keyof typeof leer>(k: K, v: string) {
    setF((alt) => ({ ...alt, [k]: v }));
  }

  async function speichern() {
    setIssues([]);
    setFehler(null);
    try {
      const neu = await api.projektAnlegen({
        ...f,
        auftragssummeNetto: Number(f.auftragssummeNetto),
        gesamtkostenGeplant: Number(f.gesamtkostenGeplant),
        istKostenStichtag: Number(f.istKostenStichtag || 0),
        kundenadresse: f.kundenadresse || null,
        notizen: f.notizen || null,
      });
      navigate(`/projekte/${neu.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.issues) setIssues(e.issues);
      setFehler((e as Error).message);
    }
  }

  const inp = 'mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm';
  const fehlerFuer = (feld: string) => issues.find((i) => i.feld === feld)?.nachricht;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-anthrazit">Neues Projekt</h1>
      {fehler && <p className="text-sm text-red-600">{fehler}</p>}
      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Feld label="Projektnummer *" fehler={fehlerFuer('projektnummer')}>
            <input className={inp} value={f.projektnummer} onChange={(e) => set('projektnummer', e.target.value)} />
          </Feld>
          <Feld label="Bezeichnung *" fehler={fehlerFuer('bezeichnung')}>
            <input className={inp} value={f.bezeichnung} onChange={(e) => set('bezeichnung', e.target.value)} />
          </Feld>
          <Feld label="Kunde *" fehler={fehlerFuer('kunde')}>
            <input className={inp} value={f.kunde} onChange={(e) => set('kunde', e.target.value)} />
          </Feld>
          <Feld label="Kundenadresse">
            <input className={inp} value={f.kundenadresse} onChange={(e) => set('kundenadresse', e.target.value)} />
          </Feld>
          <Feld label="Start geplant *" fehler={fehlerFuer('startdatumGeplant')}>
            <input type="date" lang="de-DE" className={inp} value={f.startdatumGeplant} onChange={(e) => set('startdatumGeplant', e.target.value)} />
          </Feld>
          <Feld label="Ende geplant *" fehler={fehlerFuer('enddatumGeplant')}>
            <input type="date" lang="de-DE" className={inp} value={f.enddatumGeplant} onChange={(e) => set('enddatumGeplant', e.target.value)} />
          </Feld>
          <Feld label="Auftragssumme netto (€) *" fehler={fehlerFuer('auftragssummeNetto')}>
            <GeldInput className={inp} value={Number(f.auftragssummeNetto)} onChange={(n) => set('auftragssummeNetto', String(n))} />
          </Feld>
          <Feld label="Geplante Gesamtkosten (€) *" fehler={fehlerFuer('gesamtkostenGeplant')}>
            <GeldInput className={inp} value={Number(f.gesamtkostenGeplant)} onChange={(n) => set('gesamtkostenGeplant', String(n))} />
          </Feld>
          <Feld label="Ist-Kosten (Stichtag, €)">
            <GeldInput className={inp} value={Number(f.istKostenStichtag)} onChange={(n) => set('istKostenStichtag', String(n))} />
          </Feld>
          <Feld label="Status">
            <select className={inp} value={f.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Feld>
          <Feld label="Gewerk">
            <select className={inp} value={f.gewerk} onChange={(e) => set('gewerk', e.target.value)}>
              {Object.entries(GEWERK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Feld>
          <Feld label="Notizen">
            <input className={inp} value={f.notizen} onChange={(e) => set('notizen', e.target.value)} />
          </Feld>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={speichern} className="rounded-lg bg-anthrazit px-4 py-2 text-sm font-semibold text-white hover:bg-dunkelblau">Projekt anlegen</button>
          <button onClick={() => navigate('/projekte')} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Abbrechen</button>
        </div>
        <p className="mt-3 text-xs text-gray-400">Bulk-Import von CSV/Excel siehe Menüpunkt „Import".</p>
      </Card>
    </div>
  );
}

function Feld({ label, fehler, children }: { label: string; fehler?: string; children: React.ReactNode }) {
  return (
    <label className="text-xs text-gray-500">
      {label}
      {children}
      {fehler && <span className="mt-0.5 block text-red-600">{fehler}</span>}
    </label>
  );
}
