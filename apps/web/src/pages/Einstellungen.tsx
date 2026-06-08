import { useState } from 'react';
import type { Abgrenzungsmethode } from '@jahresabgrenzung/shared';
import { api } from '../api';
import { useAppState } from '../state';
import { METHODE_LABEL } from '../labels';
import { datum } from '../format';
import { Card, LeerHinweis } from '../components/ui';

const METHODEN: Abgrenzungsmethode[] = ['COMPLETED_CONTRACT', 'ZEITANTEILIG', 'COST_TO_COST', 'MANUELL'];

export function Einstellungen() {
  const { geschaeftsjahre, einstellungen, ladeStammdaten } = useAppState();
  const [gespeichert, setGespeichert] = useState<string | null>(null);

  // Einstellungen-Formular
  const [e, setE] = useState({
    standardMethode: einstellungen?.standardMethode ?? 'COMPLETED_CONTRACT',
    steuerberaterName: einstellungen?.steuerberaterName ?? '',
    steuerberaterAdresse: einstellungen?.steuerberaterAdresse ?? '',
    steuerberaterEmail: einstellungen?.steuerberaterEmail ?? '',
    kontoUnfertigeLeistung: einstellungen?.kontoUnfertigeLeistung ?? '',
    kontoBestandsveraend: einstellungen?.kontoBestandsveraend ?? '',
  });

  // Neues Geschäftsjahr
  const [neuesJahr, setNeuesJahr] = useState('');

  async function speichern() {
    await api.einstellungenSpeichern({
      standardMethode: e.standardMethode,
      steuerberaterName: e.steuerberaterName || null,
      steuerberaterAdresse: e.steuerberaterAdresse || null,
      steuerberaterEmail: e.steuerberaterEmail || null,
      kontoUnfertigeLeistung: e.kontoUnfertigeLeistung || null,
      kontoBestandsveraend: e.kontoBestandsveraend || null,
    });
    await ladeStammdaten();
    setGespeichert('Einstellungen gespeichert.');
    setTimeout(() => setGespeichert(null), 2500);
  }

  async function jahrAnlegen() {
    const jahr = Number(neuesJahr);
    if (!jahr) return;
    await api.geschaeftsjahrAnlegen({
      jahr,
      beginn: `${jahr}-01-01`,
      ende: `${jahr}-12-31`,
    });
    setNeuesJahr('');
    await ladeStammdaten();
  }

  async function jahrLoeschen(id: string) {
    await api.geschaeftsjahrLoeschen(id);
    await ladeStammdaten();
  }

  const inp = 'mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-anthrazit">Einstellungen</h1>
      {gespeichert && <p className="text-sm font-medium text-green-700">{gespeichert}</p>}

      <Card>
        <h2 className="mb-3 font-semibold text-anthrazit">Geschäftsjahre</h2>
        <ul className="space-y-1 text-sm">
          {geschaeftsjahre.map((g) => (
            <li key={g.id} className="flex items-center justify-between border-b border-gray-100 py-1">
              <span>{g.jahr} ({datum(g.beginn)} – {datum(g.ende)})</span>
              <button onClick={() => jahrLoeschen(g.id)} className="text-red-500 hover:underline">löschen</button>
            </li>
          ))}
          {geschaeftsjahre.length === 0 && <LeerHinweis>Noch keine Geschäftsjahre.</LeerHinweis>}
        </ul>
        <div className="mt-3 flex gap-2">
          <input type="number" placeholder="z.B. 2028" className="rounded border border-gray-300 px-2 py-1 text-sm" value={neuesJahr} onChange={(ev) => setNeuesJahr(ev.target.value)} />
          <button onClick={jahrAnlegen} className="rounded-lg bg-anthrazit px-3 py-1.5 text-sm font-semibold text-white">Geschäftsjahr anlegen</button>
        </div>
        <p className="mt-1 text-xs text-gray-400">Beginn/Ende werden automatisch auf 01.01.–31.12. gesetzt.</p>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-anthrazit">Standard-Abgrenzungsmethode</h2>
        <select className={inp} value={e.standardMethode} onChange={(ev) => setE({ ...e, standardMethode: ev.target.value as Abgrenzungsmethode })}>
          {METHODEN.map((m) => <option key={m} value={m}>{METHODE_LABEL[m]}</option>)}
        </select>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-anthrazit">Steuerberater (Footer für Exporte)</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-gray-500">Name<input className={inp} value={e.steuerberaterName} onChange={(ev) => setE({ ...e, steuerberaterName: ev.target.value })} /></label>
          <label className="text-xs text-gray-500">E-Mail<input className={inp} value={e.steuerberaterEmail} onChange={(ev) => setE({ ...e, steuerberaterEmail: ev.target.value })} /></label>
          <label className="col-span-full text-xs text-gray-500">Adresse<input className={inp} value={e.steuerberaterAdresse} onChange={(ev) => setE({ ...e, steuerberaterAdresse: ev.target.value })} /></label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-anthrazit">Konten für Buchungssatz-Vorschläge</h2>
        <p className="mb-3 text-xs text-gray-500">Platzhalter — vor Einsatz mit dem Steuerberater abstimmen (kein Hardcode auf SKR-03).</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-gray-500">Konto Unfertige Leistungen<input className={inp} placeholder="z.B. 0860" value={e.kontoUnfertigeLeistung} onChange={(ev) => setE({ ...e, kontoUnfertigeLeistung: ev.target.value })} /></label>
          <label className="text-xs text-gray-500">Konto Bestandsveränderung<input className={inp} placeholder="z.B. 8990" value={e.kontoBestandsveraend} onChange={(ev) => setE({ ...e, kontoBestandsveraend: ev.target.value })} /></label>
        </div>
      </Card>

      <button onClick={speichern} className="rounded-lg bg-anthrazit px-5 py-2 font-semibold text-white hover:bg-dunkelblau">Speichern</button>
    </div>
  );
}
