import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { useAppState } from '../state';
import { useAbgrenzung, effektiverZeitraum, projektGestartet } from '../hooks';
import { euro } from '../format';
import { METHODE_LABEL } from '../labels';
import { Card, KpiCard, HgbWarnung, Spinner, LeerHinweis } from '../components/ui';
import { GanttChart, type GanttProjekt } from '../components/GanttChart';

export function Dashboard() {
  const { geschaeftsjahre, gewaehltesGjId, methode } = useAppState();
  const { ergebnis, projekte, laedt, fehler } = useAbgrenzung();
  const navigate = useNavigate();

  const gj = geschaeftsjahre.find((g) => g.id === gewaehltesGjId);

  const abgrenzbar = useMemo(
    () => ergebnis?.projekte.filter((p) => p.abgrenzungsbedarf) ?? [],
    [ergebnis],
  );

  const volumenAbzugrenzen = abgrenzbar.reduce(
    (s, p) => s + p.aufteilung.auftragssummeStichjahr + p.aufteilung.auftragssummeFolgejahr,
    0,
  );
  const anzahlLaufend = projekte.filter((p) => p.status === 'LAUFEND').length;

  const ganttProjekte: GanttProjekt[] = useMemo(() => {
    if (!ergebnis) return [];
    // Konsistenz mit KPIs/Bericht: nur Projekte, die das Backend in die
    // Abgrenzungsberechnung aufgenommen hat (Storniert/Angebot sind dort
    // schon ausgefiltert). Zusätzlich "noch nicht gestartet" blenden wir
    // hier weich aus (kein Projekt-Start UND keine istKosten/Zahlungen).
    const aktive = new Set(ergebnis.projekte.map((p) => p.projektId));
    return projekte
      .filter((p) => aktive.has(p.id))
      .filter(projektGestartet)
      .map((p) => {
        const a = ergebnis.projekte.find((e) => e.projektId === p.id);
        const { start, ende } = effektiverZeitraum(p);
        return {
          id: p.id,
          label: `${p.projektnummer} · ${p.bezeichnung}`,
          kunde: p.kunde,
          start,
          ende,
          volumen: p.auftragssummeNetto,
          anteilStichjahrProzent: a?.aufteilung.anteilStichjahrProzent ?? 100,
          abgrenzungsbetrag: a?.aufteilung.auftragssummeFolgejahr ?? 0,
          abgrenzungsbedarf: a?.abgrenzungsbedarf ?? false,
        };
      });
  }, [projekte, ergebnis]);

  if (laedt) return <Spinner />;
  if (fehler) return <LeerHinweis>Fehler beim Laden: {fehler}</LeerHinweis>;
  if (!gj || !ergebnis) return <LeerHinweis>Kein Geschäftsjahr ausgewählt.</LeerHinweis>;

  // Kompakte Verteilung Stichjahr/Folgejahr (ersetzt den großen Donut).
  const stj = ergebnis.summen.auftragssummeStichjahr;
  const fj = ergebnis.summen.auftragssummeFolgejahr;
  const gesamt = stj + fj;
  const stjProzent = gesamt > 0 ? (stj / gesamt) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-anthrazit">Dashboard {gj.jahr}</h1>
        <p className="text-sm text-gray-500">Methode: {METHODE_LABEL[methode]}</p>
      </div>

      <HgbWarnung methode={methode} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Laufende Projekte" wert={String(anzahlLaufend)} />
        <KpiCard label="Volumen abzugrenzen" wert={euro(volumenAbzugrenzen)} hinweis={`${abgrenzbar.length} Projekte`} />
        <KpiCard label="Unfertige Leistungen" wert={euro(ergebnis.summen.unfertigeLeistungen)} />
        <KpiCard label="ARAP" wert={euro(ergebnis.summen.arap)} />
        <KpiCard label="PRAP" wert={euro(ergebnis.summen.prap)} />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-anthrazit">Zeitachse der Projekte</h2>
        </div>

        {/* Kompakte Verteilung: Auftragssumme Stichjahr vs. Folgejahr */}
        {gesamt > 0 && (
          <div className="mb-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 text-xs text-gray-600">
              <span>Auftragssumme Stichjahr / Folgejahr</span>
              <span>
                <span className="font-semibold text-stichjahr">{euro(stj)}</span>
                {' · '}
                <span className="font-semibold text-folgejahr">{euro(fj)}</span>
              </span>
            </div>
            <div className="flex h-4 w-full overflow-hidden rounded-full" title={`Stichjahr ${euro(stj)} · Folgejahr ${euro(fj)}`}>
              <div className="bg-stichjahr" style={{ width: `${stjProzent}%` }} />
              <div className="flex-1 bg-folgejahr" />
            </div>
          </div>
        )}

        {ganttProjekte.length === 0 ? (
          <LeerHinweis>Keine aktiven Projekte.</LeerHinweis>
        ) : (
          <GanttChart
            projekte={ganttProjekte}
            stichtag={parseISO(gj.ende)}
            onProjektClick={(id) => navigate(`/projekte/${id}`)}
          />
        )}
      </Card>
    </div>
  );
}
