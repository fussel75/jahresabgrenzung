import type { ReactNode } from 'react';
import type { ProjektStatus, Abgrenzungsmethode } from '@jahresabgrenzung/shared';
import { STATUS_LABEL, STATUS_FARBE, METHODE_HGB_WARNUNG } from '../labels';

export function StatusBadge({ status }: { status: ProjektStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_FARBE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function AbgrenzungsBadge({ bedarf }: { bedarf: boolean }) {
  return bedarf ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
      ● abzugrenzen
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
      ○ nein
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function KpiCard({ label, wert, hinweis }: { label: string; wert: string; hinweis?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-2xl font-bold text-anthrazit">{wert}</span>
      {hinweis && <span className="text-xs text-gray-400">{hinweis}</span>}
    </Card>
  );
}

/** Gelbe HGB-Warnung für Cost-to-Cost / Manuell (SPEC.md §4). */
export function HgbWarnung({ methode }: { methode: Abgrenzungsmethode }) {
  if (!METHODE_HGB_WARNUNG[methode]) return null;
  return (
    <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>⚠️ HGB-Hinweis:</strong> Diese Methode ist nach HGB nur in engen Grenzen
      zulässig (vgl. IDW RS HFA 38). Verwendung ausschließlich für interne Analyse,{' '}
      <strong>nicht</strong> als Buchungsgrundlage ohne Rücksprache mit dem Steuerberater.
    </div>
  );
}

export function LeerHinweis({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500">
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="p-8 text-center text-gray-400">Lädt …</div>;
}
