import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Abgrenzungsmethode } from '@jahresabgrenzung/shared';
import { useAppState } from '../state';
import { METHODE_LABEL } from '../labels';
import { Onboarding } from './Onboarding';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projekte', label: 'Projekte', end: false },
  { to: '/abgrenzung', label: 'Abgrenzungsbericht', end: false },
  { to: '/import', label: 'Import', end: false },
  { to: '/einstellungen', label: 'Einstellungen', end: false },
];

const METHODEN: Abgrenzungsmethode[] = [
  'COMPLETED_CONTRACT',
  'ZEITANTEILIG',
  'COST_TO_COST',
  'MANUELL',
];

export function Layout() {
  const { geschaeftsjahre, gewaehltesGjId, setGewaehltesGjId, methode, setMethode } = useAppState();
  const navigate = useNavigate();

  // Tastatur-Shortcuts: N = neues Projekt, / = Projektsuche, E = Abgrenzungsbericht/Export
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ziel = e.target as HTMLElement;
      if (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.tagName === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') {
        navigate('/projekte/neu');
      } else if (e.key === '/') {
        e.preventDefault();
        navigate('/projekte');
        setTimeout(() => document.getElementById('projekt-suche')?.focus(), 50);
      } else if (e.key === 'e' || e.key === 'E') {
        navigate('/abgrenzung');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Onboarding />
      <header className="bg-anthrazit text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">Jahresabgrenzung</span>
            <span className="hidden text-xs text-gray-300 sm:inline">FriStD-Bau ZuB</span>
          </div>
          {/* Auf Mobile: eine wischbare Zeile statt Umbruch über mehrere Zeilen. */}
          <nav className="-mx-3 flex gap-1 overflow-x-auto whitespace-nowrap px-3 sm:mx-0 sm:ml-6 sm:flex-wrap sm:overflow-visible sm:px-0">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `shrink-0 rounded px-3 py-2 text-sm font-medium sm:py-1.5 ${
                    isActive ? 'bg-white/20' : 'text-gray-200 hover:bg-white/10'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
        {/* Kontext-Leiste: Geschäftsjahr + Methode (global) */}
        <div className="border-t border-white/10 bg-dunkelblau">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-sm sm:px-4">
            <label className="flex items-center gap-2">
              <span className="text-gray-300">Geschäftsjahr</span>
              <select
                value={gewaehltesGjId ?? ''}
                onChange={(e) => setGewaehltesGjId(e.target.value)}
                className="rounded bg-white px-2 py-1 text-gray-900"
              >
                {geschaeftsjahre.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.jahr}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-gray-300">Methode</span>
              <select
                value={methode}
                onChange={(e) => setMethode(e.target.value as Abgrenzungsmethode)}
                className="rounded bg-white px-2 py-1 text-gray-900"
              >
                {METHODEN.map((m) => (
                  <option key={m} value={m}>
                    {METHODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <span className="ml-auto hidden text-xs text-gray-400 md:inline">
              Shortcuts: N = neu · / = Suche · E = Bericht
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
