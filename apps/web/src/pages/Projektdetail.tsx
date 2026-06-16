import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  ALLE_METHODEN,
  ALLE_KOSTENARTEN,
  berechneAlleMethoden,
  parseAktiveKostenarten,
  type KostenArt,
} from '@jahresabgrenzung/shared';
import { api, type Projekt } from '../api';
import { useAppState } from '../state';
import { effektiverZeitraum, projektZuBerechnung, istAbzugrenzen } from '../hooks';
import { euro, datum, prozent, rechnungsnummer } from '../format';
import {
  METHODE_KURZ,
  METHODE_HGB_WARNUNG,
  ZAHLUNGSART_LABEL,
  KOSTENART_LABEL,
  GEWERK_LABEL,
  STATUS_LABEL,
} from '../labels';
import { Card, StatusBadge, AbgrenzungsBadge, HgbWarnung, Spinner, LeerHinweis } from '../components/ui';
import { GanttChart } from '../components/GanttChart';
import { GeldInput } from '../components/GeldInput';

export function Projektdetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { geschaeftsjahre, gewaehltesGjId, methode, einstellungen } = useAppState();
  const gj = geschaeftsjahre.find((g) => g.id === gewaehltesGjId);
  const aktiveArten = parseAktiveKostenarten(einstellungen?.kostenartenAktiv);

  const [projekt, setProjekt] = useState<Projekt | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [bearbeiten, setBearbeiten] = useState(false);

  // Schieberegler "Manueller Grad" (0–100 %): rechnet den Methodenvergleich
  // live beim Ziehen um und speichert entprellt nach dem Loslassen.
  const [gradProzent, setGradProzent] = useState(0);
  const [gradGespeichert, setGradGespeichert] = useState(false);
  const gradTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function laden() {
    if (!id) return;
    const p = await api.projekt(id);
    setProjekt(p);
    setGradProzent(Math.round((p.fertigstellungGradManuell ?? 0) * 100));
    setLaedt(false);
  }
  useEffect(() => {
    laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function gradZiehen(prozentNeu: number) {
    setGradProzent(prozentNeu);
    setGradGespeichert(false);
    if (gradTimer.current) clearTimeout(gradTimer.current);
    gradTimer.current = setTimeout(async () => {
      if (!id) return;
      await api.projektAendern(id, { fertigstellungGradManuell: prozentNeu / 100 });
      setProjekt((alt) => (alt ? { ...alt, fertigstellungGradManuell: prozentNeu / 100 } : alt));
      setGradGespeichert(true);
      setTimeout(() => setGradGespeichert(false), 2000);
    }, 600);
  }

  const vergleich = useMemo(() => {
    if (!projekt || !gj) return null;
    const input = projektZuBerechnung(projekt);
    // Globaler Kostenarten-Schalter (Einstellungen) auch hier anwenden.
    input.kostenpositionen = input.kostenpositionen?.filter(
      (k) => !k.art || aktiveArten.has(k.art as KostenArt),
    );
    // Schieberegler-Wert live einrechnen (auch vor dem Speichern).
    input.fertigstellungGradManuell = gradProzent / 100;
    return berechneAlleMethoden(input, {
      jahr: gj.jahr,
      beginn: parseISO(gj.beginn),
      ende: parseISO(gj.ende),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projekt, gj, einstellungen?.kostenartenAktiv, gradProzent]);

  if (laedt) return <Spinner />;
  if (!projekt) return <LeerHinweis>Projekt nicht gefunden.</LeerHinweis>;

  const { start, ende } = effektiverZeitraum(projekt);
  const bedarf = gj ? istAbzugrenzen(projekt, parseISO(gj.ende)) : false;
  // Alle Methoden null => Projekt ist für das gewählte GJ nicht relevant
  // (z.B. vor dem GJ abgeschlossen, Status Angebot/Storniert).
  const ausserhalbGj = vergleich !== null && ALLE_METHODEN.every((m) => !vergleich[m]);

  // Ist-Kosten stichtagsgenau zum gewählten GJ (aus datierten Kostenpositionen,
  // gefiltert auf aktive Kostenarten; Fallback auf den pauschalen Feldwert).
  const istKostenAnzeige =
    gj && (projekt.kostenpositionen?.length ?? 0) > 0
      ? projekt.kostenpositionen!
          .filter((k) => parseISO(k.datum) <= parseISO(gj.ende))
          .filter((k) => aktiveArten.has(k.art as KostenArt))
          .reduce((s, k) => s + k.betragNetto, 0)
      : projekt.istKostenStichtag;

  // Kostenarten-Zusammenfassung bis GJ-Ende (inaktive Arten werden markiert).
  const kostenJeArt = gj
    ? ALLE_KOSTENARTEN.map((art) => ({
        art,
        summe: (projekt.kostenpositionen ?? [])
          .filter((k) => k.art === art && parseISO(k.datum) <= parseISO(gj.ende))
          .reduce((s, k) => s + k.betragNetto, 0),
        aktiv: aktiveArten.has(art),
      })).filter((x) => x.summe !== 0)
    : [];

  const diagrammDaten = vergleich
    ? ALLE_METHODEN.map((m) => ({
        name: METHODE_KURZ[m],
        Stichjahr: vergleich[m]?.aufteilung.auftragssummeStichjahr ?? 0,
        Folgejahr: vergleich[m]?.aufteilung.auftragssummeFolgejahr ?? 0,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:underline">← Zurück</button>
          <h1 className="text-2xl font-bold text-anthrazit">
            {projekt.projektnummer} · {projekt.bezeichnung}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={projekt.status} />
            <AbgrenzungsBadge bedarf={bedarf} />
          </div>
        </div>
        <button
          onClick={() => setBearbeiten((b) => !b)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          {bearbeiten ? 'Abbrechen' : 'Bearbeiten'}
        </button>
      </div>

      {bearbeiten ? (
        <StammdatenForm projekt={projekt} onGespeichert={() => { setBearbeiten(false); laden(); }} />
      ) : (
        <Card>
          <h2 className="mb-3 font-semibold text-anthrazit">Stammdaten</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
            <Feld label="Kunde" wert={projekt.kunde} />
            <Feld label="Gewerk" wert={GEWERK_LABEL[projekt.gewerk]} />
            <Feld label="Auftragssumme (netto)" wert={euro(projekt.auftragssummeNetto)} />
            <Feld
              label="Projekt-Start"
              wert={projekt.projektStartManuell ? datum(projekt.projektStartManuell) : '— (nicht gesetzt)'}
            />
            <Feld
              label="Ende (voraussichtlich)"
              wert={`${datum(projekt.enddatumGeplant)}${projekt.enddatumIst ? '' : ' — maßgeblich, solange kein Ist-Ende'}`}
            />
            <Feld label="Ende (tatsächlich)" wert={projekt.enddatumIst ? datum(projekt.enddatumIst) : '– (Projekt läuft)'} />
            <Feld
              label="Gesamtkosten (kalkuliert)"
              wert={`${euro(projekt.gesamtkostenGeplant)} — bei abgeschlossenen Projekten = tatsächliche`}
            />
            <Feld
              label={gj ? `Ist-Kosten bis 31.12.${gj.jahr}` : 'Ist-Kosten'}
              wert={euro(istKostenAnzeige)}
            />
            <Feld label="Manueller Grad" wert={projekt.fertigstellungGradManuell != null ? prozent(projekt.fertigstellungGradManuell * 100) : '–'} />
            <Feld
              label="HAPAK-Anlage"
              wert={`${datum(projekt.startdatumGeplant)} (informativ)`}
            />
          </dl>
          {projekt.notizen && <p className="mt-3 text-sm text-gray-600">{projekt.notizen}</p>}
        </Card>
      )}

      {/* Zeitstrahl des Projekts */}
      {gj && (
        <Card>
          <h2 className="mb-3 font-semibold text-anthrazit">Zeitstrahl</h2>
          <GanttChart
            projekte={[{
              id: projekt.id,
              label: projekt.bezeichnung,
              kunde: projekt.kunde,
              start,
              ende,
              volumen: projekt.auftragssummeNetto,
              anteilStichjahrProzent: vergleich?.[methode]?.aufteilung.anteilStichjahrProzent ?? 100,
              abgrenzungsbetrag: vergleich?.[methode]?.aufteilung.auftragssummeFolgejahr ?? 0,
              abgrenzungsbedarf: bedarf,
            }]}
            stichtag={parseISO(gj.ende)}
          />
        </Card>
      )}

      {/* Abgrenzungs-Vergleich aller 4 Methoden */}
      {vergleich && ausserhalbGj && (
        <Card>
          <h2 className="mb-3 font-semibold text-anthrazit">Abgrenzung — Methodenvergleich {gj?.jahr}</h2>
          <LeerHinweis>
            Dieses Projekt ist für das Geschäftsjahr {gj?.jahr} nicht relevant — es wurde
            vor dem {gj?.jahr ? `01.01.${gj.jahr}` : 'Geschäftsjahresbeginn'} abgeschlossen
            (oder hat den Status Angebot/Storniert). Wähle oben das Geschäftsjahr, über dessen
            Jahreswechsel das Projekt lief (hier: {datum(ende)} → davor liegendes Jahr).
          </LeerHinweis>
        </Card>
      )}
      {vergleich && !ausserhalbGj && (
        <Card>
          <h2 className="mb-3 font-semibold text-anthrazit">Abgrenzung — Methodenvergleich {gj?.jahr}</h2>
          <HgbWarnung methode={methode} />

          {/* Schieberegler: manueller Fertigstellungsgrad, live + Auto-Speichern */}
          {bedarf && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-gray-50 p-3">
              <span className="text-sm font-medium text-gray-700">Manueller Grad</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={gradProzent}
                onChange={(e) => gradZiehen(Number(e.target.value))}
                className="h-2 min-w-[140px] flex-1 cursor-pointer accent-anthrazit"
                aria-label="Manueller Fertigstellungsgrad in Prozent"
              />
              <span className="w-14 text-right text-sm font-semibold text-anthrazit">{gradProzent} %</span>
              <span className={`text-xs ${gradGespeichert ? 'text-green-600' : 'text-gray-400'}`}>
                {gradGespeichert ? '✓ gespeichert' : 'wirkt auf Zeile „Manuell" — speichert automatisch'}
              </span>
            </div>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-2">Methode</th>
                  <th className="p-2 text-right">Anteil StJ</th>
                  <th className="p-2 text-right">Ertrag StJ</th>
                  <th className="p-2 text-right">Ertrag FJ</th>
                  <th className="p-2 text-right">Aufwand StJ</th>
                  <th className="p-2 text-right">Unf. Leist.</th>
                  <th className="p-2 text-right">Anzahlungen</th>
                </tr>
              </thead>
              <tbody>
                {ALLE_METHODEN.map((m) => {
                  const a = vergleich[m]?.aufteilung;
                  if (!a) return null;
                  return (
                    <tr key={m} className={`border-b border-gray-100 ${m === methode ? 'bg-amber-50' : ''}`}>
                      <td className="p-2 font-medium">
                        {METHODE_KURZ[m]}
                        {METHODE_HGB_WARNUNG[m] && <span title="HGB nur eingeschränkt zulässig"> ⚠️</span>}
                      </td>
                      <td className="p-2 text-right">{prozent(a.anteilStichjahrProzent)}</td>
                      <td className="p-2 text-right">{euro(a.auftragssummeStichjahr)}</td>
                      <td className="p-2 text-right">{euro(a.auftragssummeFolgejahr)}</td>
                      <td className="p-2 text-right">{euro(a.aufwandStichjahr)}</td>
                      <td className="p-2 text-right">{euro(a.unfertigeLeistungen)}</td>
                      <td className="p-2 text-right">{euro(a.erhalteneAnzahlungen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={diagrammDaten}>
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v: number) => euro(v)} />
                <Legend />
                <Bar dataKey="Stichjahr" stackId="a" fill="#16a34a" />
                <Bar dataKey="Folgejahr" stackId="a" fill="#f97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Zahlungen & Kostenpositionen */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Zahlungen projekt={projekt} onAenderung={laden} />
        <Kostenpositionen projekt={projekt} onAenderung={laden} zusammenfassung={kostenJeArt} />
      </div>
    </div>
  );
}

function Feld({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{wert}</dd>
    </div>
  );
}

function isoTag(d: string) {
  return d.slice(0, 10);
}

function StammdatenForm({ projekt, onGespeichert }: { projekt: Projekt; onGespeichert: () => void }) {
  const [f, setF] = useState({
    bezeichnung: projekt.bezeichnung,
    kunde: projekt.kunde,
    auftragssummeNetto: projekt.auftragssummeNetto,
    gesamtkostenGeplant: projekt.gesamtkostenGeplant,
    istKostenStichtag: projekt.istKostenStichtag,
    projektStartManuell: projekt.projektStartManuell ? isoTag(projekt.projektStartManuell) : '',
    enddatumGeplant: isoTag(projekt.enddatumGeplant),
    enddatumIst: projekt.enddatumIst ? isoTag(projekt.enddatumIst) : '',
    fertigstellungGradManuell: projekt.fertigstellungGradManuell ?? '',
    status: projekt.status,
    notizen: projekt.notizen ?? '',
  });
  const [fehler, setFehler] = useState<string | null>(null);

  async function speichern() {
    try {
      await api.projektAendern(projekt.id, {
        bezeichnung: f.bezeichnung,
        kunde: f.kunde,
        auftragssummeNetto: Number(f.auftragssummeNetto),
        gesamtkostenGeplant: Number(f.gesamtkostenGeplant),
        istKostenStichtag: Number(f.istKostenStichtag),
        projektStartManuell: f.projektStartManuell || null,
        enddatumGeplant: f.enddatumGeplant || undefined,
        enddatumIst: f.enddatumIst || null,
        fertigstellungGradManuell: f.fertigstellungGradManuell === '' ? null : Number(f.fertigstellungGradManuell),
        status: f.status,
        notizen: f.notizen || null,
      });
      onGespeichert();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  const inp = 'mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm';
  return (
    <Card>
      <h2 className="mb-3 font-semibold text-anthrazit">Stammdaten bearbeiten</h2>
      {fehler && <p className="mb-2 text-sm text-red-600">{fehler}</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-xs text-gray-500">Bezeichnung<input className={inp} value={f.bezeichnung} onChange={(e) => setF({ ...f, bezeichnung: e.target.value })} /></label>
        <label className="text-xs text-gray-500">Kunde<input className={inp} value={f.kunde} onChange={(e) => setF({ ...f, kunde: e.target.value })} /></label>
        <label className="text-xs text-gray-500">
          Auftragssumme netto (€)
          <GeldInput className={inp} value={Number(f.auftragssummeNetto)} onChange={(n) => setF({ ...f, auftragssummeNetto: n as never })} />
        </label>
        <label className="text-xs text-gray-500">
          Gesamtkosten kalkuliert (€)
          <GeldInput className={inp} value={Number(f.gesamtkostenGeplant)} onChange={(n) => setF({ ...f, gesamtkostenGeplant: n as never })} />
          <span className="mt-0.5 block text-[10px] text-gray-400">
            Erwarteter Gesamtaufwand (Basis für Cost-to-Cost). Bei abgeschlossenen Projekten = tatsächliche Gesamtkosten.
          </span>
        </label>
        <label className="text-xs text-gray-500">
          Ist-Kosten gesamt (€)
          <GeldInput className={inp} value={Number(f.istKostenStichtag)} onChange={(n) => setF({ ...f, istKostenStichtag: n as never })} />
          <span className="mt-0.5 block text-[10px] text-gray-400">
            Nur Fallback — liegen Kostenpositionen (Belege) vor, rechnet die App stichtagsgenau aus ihnen.
          </span>
        </label>
        <label className="text-xs text-gray-500">
          Projekt-Start
          <input type="date" lang="de-DE" className={inp} value={f.projektStartManuell} onChange={(e) => setF({ ...f, projektStartManuell: e.target.value })} />
          <span className="mt-0.5 block text-[10px] text-gray-400">Echter Baubeginn — leer = Projekt gilt als noch nicht gestartet.</span>
        </label>
        <label className="text-xs text-gray-500">
          Voraussichtliches Ende
          <input type="date" lang="de-DE" className={inp} value={f.enddatumGeplant} onChange={(e) => setF({ ...f, enddatumGeplant: e.target.value })} />
          <span className="mt-0.5 block text-[10px] text-gray-400">
            Bei laufenden Projekten maßgeblich für die Abgrenzung. Wird vom HAPAK-Import nicht überschrieben.
          </span>
        </label>
        <label className="text-xs text-gray-500">
          Tatsächliches Ende
          <input type="date" lang="de-DE" className={inp} value={f.enddatumIst} onChange={(e) => setF({ ...f, enddatumIst: e.target.value })} />
          <span className="mt-0.5 block text-[10px] text-gray-400">
            Hat Vorrang, sobald gesetzt (kommt sonst automatisch mit der Schlussrechnung aus HAPAK).
          </span>
        </label>
        <label className="text-xs text-gray-500">Manueller Grad (0–1)<input type="number" step="0.05" min="0" max="1" className={inp} value={f.fertigstellungGradManuell} onChange={(e) => setF({ ...f, fertigstellungGradManuell: e.target.value as never })} /></label>
        <label className="text-xs text-gray-500">Status
          <select className={inp} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as never })}>
            {(['ANGEBOT', 'BEAUFTRAGT', 'LAUFEND', 'ABGESCHLOSSEN', 'STORNIERT'] as const).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="col-span-full text-xs text-gray-500">Notizen<textarea className={inp} value={f.notizen} onChange={(e) => setF({ ...f, notizen: e.target.value })} /></label>
      </div>
      <button onClick={speichern} className="mt-4 rounded-lg bg-anthrazit px-4 py-2 text-sm font-semibold text-white hover:bg-dunkelblau">Speichern</button>
    </Card>
  );
}

function Zahlungen({ projekt, onAenderung }: { projekt: Projekt; onAenderung: () => void }) {
  const [datumF, setDatumF] = useState('');
  const [betrag, setBetrag] = useState(0);
  const [art, setArt] = useState('ANZAHLUNG');

  async function hinzufuegen() {
    if (!datumF || !betrag) return;
    await api.zahlungAnlegen(projekt.id, { datum: datumF, betragNetto: betrag, art });
    setDatumF(''); setBetrag(0);
    onAenderung();
  }
  async function loeschen(id: string) {
    await api.zahlungLoeschen(id);
    onAenderung();
  }

  const inp = 'rounded border border-gray-300 px-2 py-1 text-sm';
  return (
    <Card>
      <h2 className="mb-3 font-semibold text-anthrazit">Zahlungen</h2>
      <table className="w-full text-sm">
        <tbody>
          {(projekt.zahlungen ?? []).map((z) => (
            <tr key={z.id} className="border-b border-gray-100">
              <td className="py-1 whitespace-nowrap">{datum(z.datum)}</td>
              <td className="py-1">{ZAHLUNGSART_LABEL[z.art]}</td>
              <td className="py-1 font-mono text-xs text-gray-600" title="Rechnungsnummer">{rechnungsnummer(z.rechnungsNr, z.datum) || '—'}</td>
              <td className="py-1 text-right">{euro(z.betragNetto)}</td>
              <td className="py-1 text-right"><button onClick={() => loeschen(z.id)} className="-my-1 rounded px-2 py-1 text-red-500 hover:bg-red-50" title="Eintrag löschen">×</button></td>
            </tr>
          ))}
          {(projekt.zahlungen ?? []).length === 0 && <tr><td className="py-2 text-gray-400" colSpan={5}>Keine Zahlungen erfasst.</td></tr>}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-2">
        <input type="date" lang="de-DE" className={inp} value={datumF} onChange={(e) => setDatumF(e.target.value)} />
        <GeldInput className={`${inp} w-28`} value={betrag} onChange={setBetrag} />
        <select className={inp} value={art} onChange={(e) => setArt(e.target.value)}>
          {Object.entries(ZAHLUNGSART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={hinzufuegen} className="rounded bg-anthrazit px-3 py-1 text-sm text-white">+</button>
      </div>
    </Card>
  );
}

interface KostenartSumme {
  art: KostenArt;
  summe: number;
  aktiv: boolean;
}

function Kostenpositionen({
  projekt,
  onAenderung,
  zusammenfassung,
}: {
  projekt: Projekt;
  onAenderung: () => void;
  zusammenfassung: KostenartSumme[];
}) {
  const [datumF, setDatumF] = useState('');
  const [betrag, setBetrag] = useState(0);
  const [art, setArt] = useState('MATERIAL');
  const [offen, setOffen] = useState<Set<KostenArt>>(new Set());

  async function hinzufuegen() {
    if (!datumF || !betrag) return;
    await api.kostenpositionAnlegen(projekt.id, { datum: datumF, betragNetto: betrag, art });
    setDatumF(''); setBetrag(0);
    onAenderung();
  }
  async function loeschen(id: string) {
    await api.kostenpositionLoeschen(id);
    onAenderung();
  }

  // Gruppierung nach Kostenart (Summenzeile, ausklappbar zu den Einzelbuchungen).
  const aktivByArt = new Map(zusammenfassung.map((z) => [z.art, z.aktiv]));
  const gruppen = ALLE_KOSTENARTEN.map((a) => {
    const eintraege = (projekt.kostenpositionen ?? [])
      .filter((k) => k.art === a)
      .sort((x, y) => x.datum.localeCompare(y.datum));
    return {
      art: a,
      eintraege,
      summe: eintraege.reduce((s, k) => s + k.betragNetto, 0),
      aktiv: aktivByArt.get(a) ?? true,
    };
  }).filter((g) => g.eintraege.length > 0);

  function toggleGruppe(a: KostenArt) {
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(a)) neu.delete(a);
      else neu.add(a);
      return neu;
    });
  }
  const alleOffen = gruppen.length > 0 && gruppen.every((g) => offen.has(g.art));

  const inp = 'rounded border border-gray-300 px-2 py-1 text-sm';
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-anthrazit">Kostenpositionen</h2>
        {gruppen.length > 0 && (
          <button
            onClick={() => setOffen(alleOffen ? new Set() : new Set(gruppen.map((g) => g.art)))}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            {alleOffen ? 'Alle zuklappen' : 'Alle aufklappen'}
          </button>
        )}
      </div>

      {gruppen.length === 0 && (
        <p className="py-2 text-sm text-gray-400">Keine Kostenpositionen erfasst.</p>
      )}

      <div className="divide-y divide-gray-100">
        {gruppen.map((g) => (
          <div key={g.art}>
            {/* Summenzeile je Kostenart — Klick klappt die Einzelbuchungen auf */}
            <button
              onClick={() => toggleGruppe(g.art)}
              className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-gray-50"
              title={g.aktiv ? 'wird eingerechnet' : 'in den Einstellungen deaktiviert — wird NICHT eingerechnet'}
            >
              <span className="w-4 text-gray-400">{offen.has(g.art) ? '▾' : '▸'}</span>
              <span className={`font-medium ${g.aktiv ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                {KOSTENART_LABEL[g.art]}
              </span>
              <span className="text-xs text-gray-400">
                ({g.eintraege.length} {g.eintraege.length === 1 ? 'Buchung' : 'Buchungen'})
              </span>
              <span className={`ml-auto font-semibold ${g.aktiv ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                {euro(g.summe)}
              </span>
            </button>

            {offen.has(g.art) && (
              <table className="mb-2 w-full text-sm">
                <tbody>
                  {g.eintraege.map((k) => (
                    <tr key={k.id} className="border-b border-gray-50">
                      <td className="w-24 py-1 pl-6 align-top whitespace-nowrap text-gray-600">{datum(k.datum)}</td>
                      <td className="w-28 py-1 pr-2 align-top whitespace-nowrap font-mono text-xs text-gray-600" title="Rechnungsnummer (im HAPAK nachschlagen)">
                        {rechnungsnummer(k.rechnungsNr, k.datum) || '—'}
                      </td>
                      <td className="max-w-0 truncate py-1 pr-2 text-gray-500" title={k.beschreibung ?? ''}>
                        {k.beschreibung || '—'}
                      </td>
                      <td className="py-1 text-right align-top whitespace-nowrap">{euro(k.betragNetto)}</td>
                      <td className="w-8 py-1 text-right align-top">
                        <button onClick={() => loeschen(k.id)} className="-my-1 rounded px-2 py-1 text-red-500 hover:bg-red-50" title="Eintrag löschen">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input type="date" lang="de-DE" className={inp} value={datumF} onChange={(e) => setDatumF(e.target.value)} />
        <GeldInput className={`${inp} w-28`} value={betrag} onChange={setBetrag} />
        <select className={inp} value={art} onChange={(e) => setArt(e.target.value)}>
          {Object.entries(KOSTENART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={hinzufuegen} className="rounded bg-anthrazit px-3 py-1 text-sm text-white">+</button>
      </div>
    </Card>
  );
}
