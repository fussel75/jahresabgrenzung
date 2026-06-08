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
