import { useEffect, useState } from 'react';
import { parseDE, zahlDE } from '../format';

/**
 * Geldeingabefeld im deutschen Format (1.234,56). Erlaubt während des Tippens
 * Zwischenstände; beim Verlassen (Blur) wird der Wert hübsch reformatiert.
 * Liefert über onChange immer eine number (oder 0 bei leer).
 */
export function GeldInput({
  value,
  onChange,
  className = '',
  placeholder = '0,00',
  disabled,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(zahlDE(value ?? 0));

  // Wenn der Wert von außen wechselt (z.B. neues Projekt), Anzeige aktualisieren.
  useEffect(() => {
    setText(zahlDE(value ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      lang="de-DE"
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        const n = parseDE(v);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        const n = parseDE(text);
        if (Number.isFinite(n)) setText(zahlDE(n));
      }}
    />
  );
}
