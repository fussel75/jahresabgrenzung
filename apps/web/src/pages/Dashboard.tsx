import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
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
    return projekte
      .filter((p) => p.status !== 'STORNIERT' && p.status !== 'ANGEBOT')
      // "Noch nicht gestartet" ausblenden: kein Projekt-Start gesetzt und
      // keine einzige Ausgangsrechnung -> faktisch nichts passiert.
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

  const donutDaten = [
    { name: 'Stichjahr', value: ergebnis.summen.auftragssummeStichjahr, fill: '#16a34a' },
    { name: 'Folgejahr', value: ergebnis.summen.auftragssummeFolgejahr, fill: '#f97316' },
  ];

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold text-anthrazit">Zeitachse der Projekte</h2>
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

        <Card>
          <h2 className="mb-3 font-semibold text-anthrazit">Auftragssumme Stichjahr / Folgejahr</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={donutDaten} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {donutDaten.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => euro(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
