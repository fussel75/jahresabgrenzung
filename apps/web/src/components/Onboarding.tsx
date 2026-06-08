import { useState } from 'react';

const KEY = 'jab_onboarding_gesehen';

export function Onboarding() {
  const [offen, setOffen] = useState(() => localStorage.getItem(KEY) !== '1');
  if (!offen) return null;

  function schliessen() {
    localStorage.setItem(KEY, '1');
    setOffen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-anthrazit">Willkommen zur Jahresabgrenzung</h2>
        <p className="mt-2 text-sm text-gray-600">
          Die App berechnet für Bauvorhaben über den Jahreswechsel die periodengerechte
          Abgrenzung von Aufwand und Ertrag. Vier Methoden stehen zur Auswahl:
        </p>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          <li>
            <strong>Completed Contract (Standard):</strong> Gewinn erst bei Fertigstellung;
            bis dahin werden Kosten als unfertige Leistungen aktiviert. HGB-konform.
          </li>
          <li>
            <strong>Zeitanteilig:</strong> Aufteilung nach Tagen der Projektlaufzeit – für
            interne Vergleichs- und Cashflow-Rechnung.
          </li>
          <li>
            <strong>Cost-to-Cost:</strong> Fortschritt = Ist-Kosten ÷ geplante Gesamtkosten.
            Nach HGB nur eingeschränkt zulässig.
          </li>
          <li>
            <strong>Manueller Grad:</strong> Subjektive Einschätzung des Fertigstellungsgrades.
            Ebenfalls nur eingeschränkt zulässig.
          </li>
        </ul>
        <button
          onClick={schliessen}
          className="mt-5 w-full rounded-lg bg-anthrazit py-2 font-semibold text-white hover:bg-dunkelblau"
        >
          Verstanden, los geht's
        </button>
      </div>
    </div>
  );
}
