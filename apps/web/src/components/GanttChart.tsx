import { useMemo, useRef, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachYearOfInterval,
  format,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { euro, datum as fmtDatum, prozent } from '../format';

export interface GanttProjekt {
  id: string;
  label: string;
  kunde: string;
  start: Date;
  ende: Date;
  volumen: number;
  anteilStichjahrProzent: number;
  abgrenzungsbetrag: number;
  abgrenzungsbedarf: boolean;
}

type Skala = 'tag' | 'woche' | 'monat' | 'jahr';
const PX_PRO_TAG: Record<Skala, number> = { tag: 16, woche: 6, monat: 2.2, jahr: 0.6 };

const LEFT_PAD = 8;
const ROW_H = 30;
const AXIS_H = 26;

interface Props {
  projekte: GanttProjekt[];
  /** Stichtag (Ende Geschäftsjahr); der Jahreswechsel ist Stichtag + 1 Tag. */
  stichtag: Date;
  heute?: Date;
  onProjektClick?: (id: string) => void;
}

export function GanttChart({ projekte, stichtag, heute = new Date(), onProjektClick }: Props) {
  // Default-Skala: Jahr, wenn der Gesamtzeitraum > 18 Monate ist; sonst Woche.
  const spannMonate = useMemo(() => {
    if (projekte.length === 0) return 0;
    const min = Math.min(...projekte.map((p) => p.start.getTime()));
    const max = Math.max(...projekte.map((p) => p.ende.getTime()));
    return (max - min) / (1000 * 60 * 60 * 24 * 30);
  }, [projekte]);
  const [skala, setSkala] = useState<Skala>(spannMonate > 18 ? 'jahr' : 'woche');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; p: GanttProjekt } | null>(null);

  const pxProTag = PX_PRO_TAG[skala];

  const { start, ende, breite, monate, jahre } = useMemo(() => {
    const jahreswechsel = addDays(stichtag, 1);
    const starts = projekte.map((p) => p.start.getTime());
    const enden = projekte.map((p) => p.ende.getTime());
    const minStart = new Date(Math.min(jahreswechsel.getTime(), ...starts));
    const maxEnde = new Date(Math.max(jahreswechsel.getTime(), ...enden));
    const s = addDays(minStart, -10);
    const e = addDays(maxEnde, 10);
    const tage = differenceInCalendarDays(e, s);
    const monate = eachMonthOfInterval({ start: s, end: e });
    const jahre = eachYearOfInterval({ start: s, end: e });
    return { start: s, ende: e, breite: tage * pxProTag + LEFT_PAD * 2, monate, jahre };
  }, [projekte, stichtag, pxProTag]);

  const hoehe = projekte.length * ROW_H + AXIS_H + 8;
  const xFor = (d: Date) => LEFT_PAD + differenceInCalendarDays(d, start) * pxProTag;

  const jahreswechselX = xFor(addDays(stichtag, 1));
  const heuteX = xFor(heute);
  const heuteSichtbar = heute >= start && heute <= ende;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">Zeitachse:</span>
        {(['tag', 'woche', 'monat', 'jahr'] as Skala[]).map((s) => (
          <button
            key={s}
            onClick={() => setSkala(s)}
            className={`rounded px-2 py-0.5 capitalize ${
              skala === s ? 'bg-anthrazit text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-stichjahr" /> Stichjahr</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-folgejahr" /> Folgejahr</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-[2px] bg-jahreswechsel" /> Jahreswechsel</span>
        </span>
      </div>

      <ScrollSync breite={Math.max(breite, 320)}>
        <svg width={Math.max(breite, 320)} height={hoehe} className="block">
          {/* Achsen-Beschriftung: Monate (bei feiner Skala) oder Jahre (bei Jahres-Skala) */}
          {skala !== 'jahr' &&
            monate.map((m, i) => {
              const x = xFor(m);
              return (
                <g key={`m${i}`}>
                  <line x1={x} y1={AXIS_H} x2={x} y2={hoehe} stroke="#f1f5f9" strokeWidth={1} />
                  <text x={x + 3} y={16} fontSize={11} fill="#94a3b8">
                    {format(m, 'MMM yy', { locale: de })}
                  </text>
                </g>
              );
            })}
          {skala === 'jahr' &&
            jahre.map((j, i) => {
              const x = xFor(j);
              return (
                <g key={`y${i}`}>
                  <line x1={x} y1={AXIS_H} x2={x} y2={hoehe} stroke="#e2e8f0" strokeWidth={1} />
                  <text x={x + 4} y={16} fontSize={12} fontWeight={600} fill="#475569">
                    {format(j, 'yyyy', { locale: de })}
                  </text>
                </g>
              );
            })}

          {/* Jahreswechsel-Linie (rot) mit lesbarem Label-Hintergrund */}
          <line
            x1={jahreswechselX}
            y1={0}
            x2={jahreswechselX}
            y2={hoehe}
            stroke="#dc2626"
            strokeWidth={2}
          />
          <rect
            x={jahreswechselX + 3}
            y={AXIS_H - 18}
            width={84}
            height={14}
            rx={2}
            fill="#dc2626"
          />
          <text x={jahreswechselX + 6} y={AXIS_H - 7} fontSize={11} fontWeight={700} fill="#fff">
            Jahreswechsel
          </text>

          {/* Heute-Marker (gestrichelt) */}
          {heuteSichtbar && (
            <line
              x1={heuteX}
              y1={AXIS_H}
              x2={heuteX}
              y2={hoehe}
              stroke="#475569"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}

          {/* Projektbalken */}
          {projekte.map((p, i) => {
            const y = AXIS_H + i * ROW_H + 6;
            const x1 = xFor(p.start);
            const x2 = xFor(p.ende);
            const w = Math.max(x2 - x1, 3);
            const gruenW = p.abgrenzungsbedarf ? (w * p.anteilStichjahrProzent) / 100 : w;
            const barH = ROW_H - 12;
            return (
              <g
                key={p.id}
                className="cursor-pointer"
                onMouseEnter={(e) =>
                  setTooltip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, p })
                }
                onMouseLeave={() => setTooltip(null)}
                onClick={() => onProjektClick?.(p.id)}
              >
                {/* Folgejahr-Hintergrund (orange) */}
                <rect x={x1} y={y} width={w} height={barH} rx={4} fill="#f97316" />
                {/* Stichjahr-Anteil (grün) */}
                {gruenW > 0 && (
                  <rect x={x1} y={y} width={gruenW} height={barH} rx={4} fill="#16a34a" />
                )}
                <text x={x1 + 6} y={y + barH - 5} fontSize={11} fill="#fff" className="pointer-events-none">
                  {p.label.length > 28 ? p.label.slice(0, 27) + '…' : p.label}
                </text>
              </g>
            );
          })}
        </svg>

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded-lg bg-anthrazit px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
          >
            <div className="font-bold">{tooltip.p.label}</div>
            <div className="text-gray-300">{tooltip.p.kunde}</div>
            <div className="mt-1">
              {fmtDatum(tooltip.p.start)} – {fmtDatum(tooltip.p.ende)}
            </div>
            <div>Volumen: {euro(tooltip.p.volumen)}</div>
            {tooltip.p.abgrenzungsbedarf && (
              <>
                <div>Anteil Stichjahr: {prozent(tooltip.p.anteilStichjahrProzent)}</div>
                <div>Abgrenzung: {euro(tooltip.p.abgrenzungsbetrag)}</div>
              </>
            )}
          </div>
        )}
      </ScrollSync>
    </div>
  );
}

/**
 * Wrapper, der zwei horizontale Scrollleisten (oben + unten) synchron hält.
 * Spart das Scrollen ans untere Ende — gerade bei langen Projektlisten wichtig.
 */
function ScrollSync({ children, breite }: { children: React.ReactNode; breite: number }) {
  const oben = useRef<HTMLDivElement>(null);
  const unten = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<{ p?: GanttProjekt | null } | null>(null);
  void tooltipRef;

  const sync = (a: React.RefObject<HTMLDivElement>, b: React.RefObject<HTMLDivElement>) => () => {
    if (a.current && b.current) b.current.scrollLeft = a.current.scrollLeft;
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* obere Scrollleiste — spiegelt die untere */}
      <div ref={oben} onScroll={sync(oben, unten)} className="overflow-x-auto">
        <div style={{ width: breite, height: 1 }} />
      </div>
      <div ref={unten} onScroll={sync(unten, oben)} className="relative overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
