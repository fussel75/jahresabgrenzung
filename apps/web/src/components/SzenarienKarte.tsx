import { useEffect, useState } from 'react';
import { api, type Szenario } from '../api';
import { useAppState } from '../state';
import { METHODE_KURZ } from '../labels';
import { datum } from '../format';
import { Card } from './ui';

/**
 * Karte fuer die Verwaltung von Szenarien (gespeicherte Snapshots der
 * Was-waere-wenn-Stellhebel: Methode, Kostenarten, Grad + voraussichtliches
 * Ende pro Projekt).
 *
 * - "Aktuellen Stand speichern": prompt nach Name -> POST /szenarien
 * - Liste: Anwenden / Aktualisieren / Loeschen je Eintrag
 */
export function SzenarienKarte() {
  const { methode, ladeStammdaten } = useAppState();
  const [liste, setListe] = useState<Szenario[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function laden() {
    setLaedt(true);
    try {
      setListe(await api.szenarien());
    } finally {
      setLaedt(false);
    }
  }
  useEffect(() => {
    laden();
  }, []);

  function info(text: string) {
    setMeldung(text);
    setFehler(null);
    setTimeout(() => setMeldung(null), 3000);
  }
  function fehlerSetzen(text: string) {
    setFehler(text);
    setMeldung(null);
  }

  async function speichern() {
    const name = window.prompt(
      'Name für das neue Szenario:\n\nGespeichert werden Methode, Kostenarten-Schalter sowie pro Projekt der manuelle Grad und das voraussichtliche Ende.',
    );
    if (!name?.trim()) return;
    try {
      await api.szenarioSpeichern({ name: name.trim(), methode });
      info(`Szenario „${name.trim()}" gespeichert.`);
      await laden();
    } catch (e) {
      fehlerSetzen((e as Error).message);
    }
  }

  async function anwenden(s: Szenario) {
    if (!window.confirm(
      `Szenario „${s.name}" anwenden?\n\nDie gespeicherten Werte werden in die Einstellungen und in die Projekte zurückgeschrieben. Aktuelle Werte gehen dabei verloren — sofern du sie nicht vorher als eigenes Szenario speicherst.`,
    )) return;
    try {
      const r = await api.szenarioAnwenden(s.id);
      info(`Angewendet: ${r.projekteAktualisiert} Projekte. Methode: ${METHODE_KURZ[r.methode as keyof typeof METHODE_KURZ] ?? r.methode}.`);
      await ladeStammdaten();
      await laden();
      // Seite neu laden, damit Dashboard/Projekte den neuen Stand zeigen.
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      fehlerSetzen((e as Error).message);
    }
  }

  async function aktualisieren(s: Szenario) {
    if (!window.confirm(`Szenario „${s.name}" mit dem aktuellen Stand überschreiben?`)) return;
    try {
      await api.szenarioAktualisieren(s.id, methode);
      info(`„${s.name}" aktualisiert.`);
      await laden();
    } catch (e) {
      fehlerSetzen((e as Error).message);
    }
  }

  async function loeschen(s: Szenario) {
    if (!window.confirm(`Szenario „${s.name}" löschen?`)) return;
    try {
      await api.szenarioLoeschen(s.id);
      info(`„${s.name}" gelöscht.`);
      await laden();
    } catch (e) {
      fehlerSetzen((e as Error).message);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-anthrazit">Szenarien (Was-wäre-wenn-Snapshots)</h2>
        <button
          onClick={speichern}
          className="rounded-lg bg-anthrazit px-3 py-2 text-sm font-semibold text-white hover:bg-dunkelblau"
        >
          Aktuellen Stand speichern
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Snapshot von Methode, Kostenarten-Schalter sowie pro Projekt manuellem Grad und voraussichtlichem Ende.
        „Anwenden" schreibt die Werte zurück (vorher ggf. den aktuellen Stand als eigenes Szenario sichern).
      </p>

      {meldung && <p className="mb-2 text-sm text-green-700">{meldung}</p>}
      {fehler && <p className="mb-2 text-sm text-red-600">{fehler}</p>}

      {laedt && <p className="text-sm text-gray-400">Lädt …</p>}
      {!laedt && liste.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
          Noch keine Szenarien gespeichert.
        </p>
      )}
      {!laedt && liste.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {liste.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900">{s.name}</div>
                <div className="text-xs text-gray-500">
                  Methode {METHODE_KURZ[s.methode as keyof typeof METHODE_KURZ] ?? s.methode}
                  {' · '}
                  {s.anzahlProjekte} Projekte
                  {' · '}
                  gesp. {datum(s.geaendertAm)}
                  {s.kostenartenAktiv && s.kostenartenAktiv !== '' && (
                    <span title={`Kostenarten: ${s.kostenartenAktiv}`}> · Kostenarten eingegrenzt</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => anwenden(s)}
                  className="rounded bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                  title="Diesen Snapshot in die App zurückschreiben"
                >
                  Anwenden
                </button>
                <button
                  onClick={() => aktualisieren(s)}
                  className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  title="Mit aktuellem Stand überschreiben"
                >
                  Aktualisieren
                </button>
                <button
                  onClick={() => loeschen(s)}
                  className="rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
