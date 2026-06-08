import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Abgrenzungsmethode } from '@jahresabgrenzung/shared';
import { api, type Geschaeftsjahr, type Einstellungen } from './api';

interface AppState {
  geschaeftsjahre: Geschaeftsjahr[];
  einstellungen: Einstellungen | null;
  gewaehltesGjId: string | null;
  setGewaehltesGjId: (id: string) => void;
  methode: Abgrenzungsmethode;
  setMethode: (m: Abgrenzungsmethode) => void;
  ladeStammdaten: () => Promise<void>;
  geladen: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [geschaeftsjahre, setGeschaeftsjahre] = useState<Geschaeftsjahr[]>([]);
  const [einstellungen, setEinstellungen] = useState<Einstellungen | null>(null);
  const [gewaehltesGjId, setGewaehltesGjId] = useState<string | null>(null);
  const [methode, setMethode] = useState<Abgrenzungsmethode>('COMPLETED_CONTRACT');
  const [geladen, setGeladen] = useState(false);

  async function ladeStammdaten() {
    const [gj, einst] = await Promise.all([api.geschaeftsjahre(), api.einstellungen()]);
    setGeschaeftsjahre(gj);
    setEinstellungen(einst);
    setMethode(einst.standardMethode);
    // Default: laufendes Jahr, sonst neuestes.
    const aktuell = gj.find((g) => g.jahr === new Date().getFullYear()) ?? gj[0];
    setGewaehltesGjId((vorher) => vorher ?? aktuell?.id ?? null);
    setGeladen(true);
  }

  useEffect(() => {
    ladeStammdaten().catch((e) => {
      console.error(e);
      setGeladen(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wert = useMemo<AppState>(
    () => ({
      geschaeftsjahre,
      einstellungen,
      gewaehltesGjId,
      setGewaehltesGjId,
      methode,
      setMethode,
      ladeStammdaten,
      geladen,
    }),
    [geschaeftsjahre, einstellungen, gewaehltesGjId, methode, geladen],
  );

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState muss innerhalb von AppStateProvider stehen');
  return ctx;
}
