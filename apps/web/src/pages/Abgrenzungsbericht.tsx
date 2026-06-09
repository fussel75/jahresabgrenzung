import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buchungssaetzeCompletedContract,
  DEFAULT_KONTEN,
} from '@jahresabgrenzung/shared';
import { useAppState } from '../state';
import { useAbgrenzung } from '../hooks';
import { euro, prozent } from '../format';
import { METHODE_LABEL, METHODE_KURZ } from '../labels';
import { Card, HgbWarnung, Spinner, LeerHinweis } from '../components/ui';

function ladeCsv(name: string, inhalt: string) {
  const blob = new Blob(['﻿' + inhalt], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const num = (n: number) => String(n.toFixed(2)).replace('.', ',');

export function Abgrenzungsbericht() {
  const { geschaeftsjahre, gewaehltesGjId, methode, einstellungen } = useAppState();
  const { ergebnis, laedt, fehler } = useAbgrenzung();
  const navigate = useNavigate();
  const gj = geschaeftsjahre.find((g) => g.id === gewaehltesGjId);

  const abzugrenzende = useMemo(
    () => ergebnis?.projekte.filter((p) => p.abgrenzungsbedarf) ?? [],
    [ergebnis],
  );

  // Summenzeile bezieht sich auf die angezeigten (abzugrenzenden) Projekte,
  // damit Tabelle und Summe konsistent sind.
  const s = useMemo(() => {
    const init = {
      auftragssummeStichjahr: 0,
      auftragssummeFolgejahr: 0,
      aufwandStichjahr: 0,
      aufwandFolgejahr: 0,
      unfertigeLeistungen: 0,
      arap: 0,
      prap: 0,
    };
    return abzugrenzende.reduce((acc, p) => {
      const a = p.aufteilung;
      acc.auftragssummeStichjahr += a.auftragssummeStichjahr;
      acc.auftragssummeFolgejahr += a.auftragssummeFolgejahr;
      acc.aufwandStichjahr += a.aufwandStichjahr;
      acc.aufwandFolgejahr += a.aufwandFolgejahr;
      acc.unfertigeLeistungen += a.unfertigeLeistungen;
      acc.arap += a.arap;
      acc.prap += a.prap;
      return acc;
    }, init);
  }, [abzugrenzende]);

  if (laedt) return <Spinner />;
  if (fehler) return <LeerHinweis>Fehler: {fehler}</LeerHinweis>;
  if (!ergebnis || !gj) return <LeerHinweis>Kein Geschäftsjahr ausgewählt.</LeerHinweis>;

  function berichtCsv() {
    const kopf = ['Projektnr', 'Bezeichnung', 'Aufwand StJ', 'Aufwand FJ', 'Ertrag StJ', 'Ertrag FJ', 'Unf. Leistungen', 'ARAP', 'PRAP'];
    const zeilen = abzugrenzende.map((p) => {
      const a = p.aufteilung;
      return [p.projektnummer, `"${p.bezeichnung}"`, num(a.aufwandStichjahr), num(a.aufwandFolgejahr), num(a.auftragssummeStichjahr), num(a.auftragssummeFolgejahr), num(a.unfertigeLeistungen), num(a.arap), num(a.prap)].join(';');
    });
    ladeCsv(`abgrenzung_${gj!.jahr}.csv`, [kopf.join(';'), ...zeilen].join('\r\n'));
  }

  function buchungssatzCsv() {
    const konten = {
      kontoUnfertigeLeistung: einstellungen?.kontoUnfertigeLeistung || DEFAULT_KONTEN.kontoUnfertigeLeistung,
      kontoBestandsveraend: einstellungen?.kontoBestandsveraend || DEFAULT_KONTEN.kontoBestandsveraend,
    };
    const kopf = ['Projektnr', 'Text', 'Soll', 'Haben', 'Betrag'];
    const zeilen = abzugrenzende.flatMap((p) =>
      buchungssaetzeCompletedContract(
        { projektId: p.projektId, projektnummer: p.projektnummer, bezeichnung: p.bezeichnung, abgrenzungsbedarf: true, methode: 'COMPLETED_CONTRACT', aufteilung: p.aufteilung },
        konten,
      ).map((b) => [b.projektnummer, `"${b.text}"`, b.sollKonto, b.habenKonto, num(b.betrag)].join(';')),
    );
    ladeCsv(`buchungssaetze_${gj!.jahr}.csv`, [kopf.join(';'), ...zeilen].join('\r\n'));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-anthrazit">Abgrenzungsbericht {gj.jahr}</h1>
          <p className="text-sm text-gray-500">Methode: {METHODE_LABEL[methode]} · {abzugrenzende.length} abzugrenzende Projekte</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/abgrenzung/${gewaehltesGjId}/export.xlsx?methode=${methode}`} className="rounded-lg bg-anthrazit px-3 py-2 text-sm font-semibold text-white hover:bg-dunkelblau">Excel</a>
          <a href={`/api/abgrenzung/${gewaehltesGjId}/export.pdf?methode=${methode}`} className="rounded-lg bg-anthrazit px-3 py-2 text-sm font-semibold text-white hover:bg-dunkelblau">PDF</a>
          <button onClick={berichtCsv} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">Bericht CSV</button>
          <button onClick={buchungssatzCsv} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">Buchungssatz CSV</button>
        </div>
      </div>

      <HgbWarnung methode={methode} />

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="p-3">Projekt</th>
              <th className="p-3 text-right">Anteil StJ</th>
              <th className="p-3 text-right">Aufwand StJ</th>
              <th className="p-3 text-right">Aufwand FJ</th>
              <th className="p-3 text-right">Ertrag StJ</th>
              <th className="p-3 text-right">Ertrag FJ</th>
              <th className="p-3 text-right">Unf. Leist.</th>
              <th className="p-3 text-right">ARAP</th>
              <th className="p-3 text-right">PRAP</th>
            </tr>
          </thead>
          <tbody>
            {abzugrenzende.map((p) => {
              const a = p.aufteilung;
              return (
                <tr key={p.projektId} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50" onClick={() => navigate(`/projekte/${p.projektId}`)}>
                  <td className="p-3"><span className="font-mono text-xs text-gray-500">{p.projektnummer}</span> {p.bezeichnung}</td>
                  <td className="p-3 text-right">{prozent(a.anteilStichjahrProzent)}</td>
                  <td className="p-3 text-right">{euro(a.aufwandStichjahr)}</td>
                  <td className="p-3 text-right">{euro(a.aufwandFolgejahr)}</td>
                  <td className="p-3 text-right">{euro(a.auftragssummeStichjahr)}</td>
                  <td className="p-3 text-right">{euro(a.auftragssummeFolgejahr)}</td>
                  <td className="p-3 text-right">{euro(a.unfertigeLeistungen)}</td>
                  <td className="p-3 text-right">{euro(a.arap)}</td>
                  <td className="p-3 text-right">{euro(a.prap)}</td>
                </tr>
              );
            })}
            {abzugrenzende.length === 0 && (
              <tr><td colSpan={9}><LeerHinweis>Keine abzugrenzenden Projekte in {gj.jahr}.</LeerHinweis></td></tr>
            )}
          </tbody>
          {abzugrenzende.length > 0 && (
            <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
              <tr>
                <td className="p-3">Summe ({methode in METHODE_KURZ ? METHODE_KURZ[methode] : methode})</td>
                <td className="p-3"></td>
                <td className="p-3 text-right">{euro(s.aufwandStichjahr)}</td>
                <td className="p-3 text-right">{euro(s.aufwandFolgejahr)}</td>
                <td className="p-3 text-right">{euro(s.auftragssummeStichjahr)}</td>
                <td className="p-3 text-right">{euro(s.auftragssummeFolgejahr)}</td>
                <td className="p-3 text-right">{euro(s.unfertigeLeistungen)}</td>
                <td className="p-3 text-right">{euro(s.arap)}</td>
                <td className="p-3 text-right">{euro(s.prap)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      <Card className="bg-amber-50 text-sm text-amber-900">
        <strong>Buchungssatz-Vorschlag — Platzhalterkonten.</strong> Vor erstem Einsatz mit
        dem Steuerberater abstimmen und unter Einstellungen anpassen. Aktuell:
        Unfertige Leistungen <code>{einstellungen?.kontoUnfertigeLeistung || DEFAULT_KONTEN.kontoUnfertigeLeistung}</code>,
        Bestandsveränderung <code>{einstellungen?.kontoBestandsveraend || DEFAULT_KONTEN.kontoBestandsveraend}</code>.
        {' '}Buchungssätze werden nur für die Completed-Contract-Methode erzeugt.
      </Card>
      <p className="text-xs text-gray-400">
        Hinweis: Projektliste/Summen verwenden die oben gewählte Methode ({METHODE_KURZ[methode]}),
        die Buchungssätze immer Completed Contract.
      </p>
    </div>
  );
}
