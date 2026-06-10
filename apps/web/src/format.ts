import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

/** Deutsches Währungsformat: 1.234,56 € */
const euroFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

export function euro(wert: number | null | undefined): string {
  return euroFormatter.format(wert ?? 0);
}

/** Prozent mit einer Nachkommastelle: 50,8 % */
const prozentFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function prozent(wert: number | null | undefined): string {
  return `${prozentFormatter.format(wert ?? 0)} %`;
}

/** Datum TT.MM.JJJJ */
export function datum(wert: string | Date | null | undefined): string {
  if (!wert) return '–';
  const d = typeof wert === 'string' ? parseISO(wert) : wert;
  return format(d, 'dd.MM.yyyy', { locale: de });
}

/** Zahl im deutschen Format ohne Währung: 1.234,56 oder leerstring bei null. */
export function zahlDE(wert: number | null | undefined): string {
  if (wert == null || !Number.isFinite(wert)) return '';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(wert);
}

/**
 * Parst eine deutsch eingegebene Zahl (1.234,56 oder 1234,56 oder 1234.56).
 * Leere Eingabe -> 0; nicht parsbares -> NaN.
 */
export function parseDE(text: string): number {
  const s = (text ?? '').trim();
  if (!s) return 0;
  // Wenn beide Trenner vorkommen, ist '.' Tausender und ',' Dezimal (de-DE).
  // Sonst gilt ',' immer als Dezimaltrenner; '.' wird (vorsichtig) als
  // Tausendertrenner behandelt, wenn es nicht das letzte Trennzeichen ist.
  const hatKomma = s.includes(',');
  const hatPunkt = s.includes('.');
  let norm = s;
  if (hatKomma && hatPunkt) {
    norm = s.replace(/\./g, '').replace(',', '.');
  } else if (hatKomma) {
    norm = s.replace(/\./g, '').replace(',', '.');
  } else if (hatPunkt) {
    // Heuristik: ist nach dem letzten '.' noch 1-2 Stellen -> Dezimaltrenner,
    // sonst Tausendertrenner und am Ende keine Dezimalstelle.
    const idx = s.lastIndexOf('.');
    const nach = s.length - idx - 1;
    if (nach === 1 || nach === 2) norm = s.replace(/\.(?=.*\.)/g, '');
    else norm = s.replace(/\./g, '');
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}
