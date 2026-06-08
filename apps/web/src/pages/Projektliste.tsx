import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ProjektStatus, Gewerk } from '@jahresabgrenzung/shared';
import { parseISO } from 'date-fns';
import { api, type Projekt } from '../api';
import { useAppState } from '../state';
import { effektiverZeitraum, istAbzugrenzen } from '../hooks';
import { euro, datum } from '../format';
import { STATUS_LABEL, GEWERK_LABEL } from '../labels';
import { Card, StatusBadge, AbgrenzungsBadge, Spinner, LeerHinweis } from '../components/ui';

type SortFeld = 'projektnummer' | 'bezeichnung' | 'kunde' | 'start' | 'volumen';

export function Projektliste() {
  const { geschaeftsjahre, gewaehltesGjId } = useAppState();
  const gj = geschaeftsjahre.find((g) => g.id === gewaehltesGjId);
  const [projekte, setProjekte] = useState<Projekt[]>([]);
  const [laedt, setLaedt] = useState(true);
  const navigate = useNavigate();

  const [suche, setSuche] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjektStatus | ''>('');
  const [gewerkFilter, setGewerkFilter] = useState<Gewerk | ''>('');
  const [nurAbzugrenzende, setNurAbzugrenzende] = useState(false);
  const [sortFeld, setSortFeld] = useState<SortFeld>('start');
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.projekte().then(setProjekte).finally(() => setLaedt(false));
  }, []);

  const gefiltert = useMemo(() => {
    let liste = projekte.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (gewerkFilter && p.gewerk !== gewerkFilter) return false;
      if (suche) {
        const s = suche.toLowerCase();
        if (
          !p.projektnummer.toLowerCase().includes(s) &&
          !p.bezeichnung.toLowerCase().includes(s) &&
          !p.kunde.toLowerCase().includes(s)
        )
          return false;
      }
      if (nurAbzugrenzende && gj && !istAbzugrenzen(p, parseISO(gj.ende))) return false;
      return true;
    });
    liste = [...liste].sort((a, b) => {
      switch (sortFeld) {
        case 'volumen':
          return b.auftragssummeNetto - a.auftragssummeNetto;
        case 'start':
          return effektiverZeitraum(a).start.getTime() - effektiverZeitraum(b).start.getTime();
        default:
          return String(a[sortFeld]).localeCompare(String(b[sortFeld]));
      }
    });
    return liste;
  }, [projekte, statusFilter, gewerkFilter, suche, nurAbzugrenzende, sortFeld, gj]);

  function toggle(id: string) {
    setAuswahl((alt) => {
      const neu = new Set(alt);
      neu.has(id) ? neu.delete(id) : neu.add(id);
      return neu;
    });
  }

  function csvExport() {
    const zeilen = gefiltert.filter((p) => auswahl.size === 0 || auswahl.has(p.id));
    const kopf = ['Projektnr', 'Bezeichnung', 'Kunde', 'Start', 'Ende', 'Volumen', 'Status'];
    const csv = [
      kopf.join(';'),
      ...zeilen.map((p) => {
        const { start, ende } = effektiverZeitraum(p);
        return [
          p.projektnummer,
          `"${p.bezeichnung}"`,
          `"${p.kunde}"`,
          datum(start),
          datum(ende),
          String(p.auftragssummeNetto).replace('.', ','),
          STATUS_LABEL[p.status],
        ].join(';');
      }),
    ].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'projekte.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (laedt) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-anthrazit">Projekte</h1>
        <div className="flex gap-2">
          <button onClick={csvExport} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
            CSV exportieren {auswahl.size > 0 && `(${auswahl.size})`}
          </button>
          <Link to="/projekte/neu" className="rounded-lg bg-anthrazit px-3 py-2 text-sm font-semibold text-white hover:bg-dunkelblau">
            + Neues Projekt
          </Link>
        </div>
      </div>

      <Card className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-gray-500">
          Suche
          <input
            id="projekt-suche"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Nr., Bezeichnung, Kunde …"
            className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
          />
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjektStatus | '')} className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">Alle</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Gewerk
          <select value={gewerkFilter} onChange={(e) => setGewerkFilter(e.target.value as Gewerk | '')} className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="">Alle</option>
            {Object.entries(GEWERK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs text-gray-500">
          Sortierung
          <select value={sortFeld} onChange={(e) => setSortFeld(e.target.value as SortFeld)} className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="start">Start</option>
            <option value="projektnummer">Projektnr.</option>
            <option value="bezeichnung">Bezeichnung</option>
            <option value="kunde">Kunde</option>
            <option value="volumen">Volumen</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={nurAbzugrenzende} onChange={(e) => setNurAbzugrenzende(e.target.checked)} />
          nur abzugrenzende
        </label>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="p-3"></th>
              <th className="p-3">Projektnr.</th>
              <th className="p-3">Bezeichnung</th>
              <th className="p-3">Kunde</th>
              <th className="p-3">Start</th>
              <th className="p-3">Ende</th>
              <th className="p-3 text-right">Volumen</th>
              <th className="p-3">Status</th>
              <th className="p-3">Abgrenzung</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((p) => {
              const { start, ende } = effektiverZeitraum(p);
              const bedarf = gj ? istAbzugrenzen(p, parseISO(gj.ende)) : false;
              return (
                <tr key={p.id} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50" onClick={() => navigate(`/projekte/${p.id}`)}>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={auswahl.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="p-3 font-mono text-xs">{p.projektnummer}</td>
                  <td className="p-3 font-medium">{p.bezeichnung}</td>
                  <td className="p-3 text-gray-600">{p.kunde}</td>
                  <td className="p-3 whitespace-nowrap">{datum(start)}</td>
                  <td className="p-3 whitespace-nowrap">{datum(ende)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{euro(p.auftragssummeNetto)}</td>
                  <td className="p-3"><StatusBadge status={p.status} /></td>
                  <td className="p-3"><AbgrenzungsBadge bedarf={bedarf} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {gefiltert.length === 0 && <LeerHinweis>Keine Projekte gefunden.</LeerHinweis>}
      </Card>
    </div>
  );
}
