import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Synology FileStation-Client (read-only) für den HAPAK-Zugriff über
 * QuickConnect. Es wird nur gelesen — niemals auf das NAS geschrieben.
 *
 * Konfiguration über Umgebungsvariablen (auf dem Server, nicht im Code).
 * Es werden mehrere Schreibweisen akzeptiert (je nachdem, was gesetzt ist):
 *   Host/ID:   NAS_HOST | HAPAK_NAS_URL | HAPAK_NAS_ID | NAS_URL | NAS_QUICKCONNECT_ID
 *   Benutzer:  NAS_USER | HAPAK_NAS_USER
 *   Passwort:  NAS_PASS | HAPAK_NAS_PASS   (Secret!)
 *   Basispfad: HAPAK_BASIS_PFAD | NAS_BASIS_PFAD   (Default "/HapakV22/FB ZuB")
 *
 * Der Host-Wert darf eine reine QuickConnect-ID ("megathron2024"), eine
 * QuickConnect-URL ("http://quickconnect.to/megathron2024"), ein Relay-Host
 * ("megathron2024.quickconnect.to") oder eine vollständige Basis-URL sein.
 */

export interface HapakConfig {
  baseUrl: string;
  user: string;
  pass: string;
  basisPfad: string;
}

const ersterWert = (...namen: string[]): string =>
  namen.map((n) => process.env[n]?.trim()).find((v) => v) ?? '';

/** Normalisiert ID/URL/Host zu einer nutzbaren FileStation-Basis-URL. */
export function normalisiereBaseUrl(roh: string): string {
  const s = roh.trim().replace(/\/+$/, '');
  // QuickConnect-Redirect-Form: (http(s)://)quickconnect.to/<id>
  const qc = s.match(/quickconnect\.to\/([A-Za-z0-9_-]+)/i);
  if (qc) return `https://${qc[1]}.quickconnect.to`;
  // Bereits eine vollständige URL?
  if (/^https?:\/\//i.test(s)) return s;
  // Host mit Punkt (z.B. xxx.quickconnect.to oder DDNS) -> https davor
  if (s.includes('.')) return `https://${s}`;
  // Sonst: reine QuickConnect-ID
  return `https://${s}.quickconnect.to`;
}

export function hapakConfigAusEnv(): { config?: HapakConfig; fehlend: string[] } {
  const hostRoh = ersterWert(
    'NAS_HOST',
    'HAPAK_NAS_URL',
    'HAPAK_NAS_ID',
    'NAS_URL',
    'NAS_QUICKCONNECT_ID',
  );
  const user = ersterWert('NAS_USER', 'HAPAK_NAS_USER');
  const pass = process.env.NAS_PASS ?? process.env.HAPAK_NAS_PASS ?? '';
  const basisPfad =
    ersterWert('HAPAK_BASIS_PFAD', 'NAS_BASIS_PFAD') || '/HapakV22/FB ZuB';

  const fehlend: string[] = [];
  if (!hostRoh) fehlend.push('HAPAK_NAS_ID');
  if (!user) fehlend.push('HAPAK_NAS_USER');
  if (!pass) fehlend.push('HAPAK_NAS_PASS');
  if (fehlend.length) return { fehlend };

  return {
    config: { baseUrl: normalisiereBaseUrl(hostRoh), user, pass, basisPfad },
    fehlend: [],
  };
}

interface SynoAntwort<T> {
  success: boolean;
  data?: T;
  error?: { code: number };
}

async function apiGet<T>(url: string): Promise<SynoAntwort<T>> {
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  try {
    return JSON.parse(text) as SynoAntwort<T>;
  } catch {
    throw new Error(
      `Unerwartete Antwort (HTTP ${res.status}) von ${new URL(url).host} — ` +
        `vermutlich ist die Basis-URL/QuickConnect-ID falsch oder das NAS nicht erreichbar.`,
    );
  }
}

export async function login(cfg: HapakConfig): Promise<string> {
  const url =
    `${cfg.baseUrl}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login` +
    `&account=${encodeURIComponent(cfg.user)}&passwd=${encodeURIComponent(cfg.pass)}` +
    `&session=FileStation&format=sid`;
  const a = await apiGet<{ sid: string }>(url);
  if (!a.success || !a.data?.sid) {
    throw new Error(
      `Anmeldung abgelehnt (Synology-Fehlercode ${a.error?.code ?? '?'}). ` +
        `Benutzer/Passwort prüfen bzw. 2FA für diesen Benutzer deaktivieren.`,
    );
  }
  return a.data.sid;
}

export async function logout(cfg: HapakConfig, sid: string): Promise<void> {
  try {
    await fetch(
      `${cfg.baseUrl}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=logout&session=FileStation&_sid=${sid}`,
    );
  } catch {
    /* nicht kritisch */
  }
}

export interface SynoDatei {
  name: string;
  isdir: boolean;
  path: string;
}

export async function listOrdner(
  cfg: HapakConfig,
  sid: string,
  ordnerPfad: string,
): Promise<SynoDatei[]> {
  const url =
    `${cfg.baseUrl}/webapi/entry.cgi?api=SYNO.FileStation.List&version=2&method=list` +
    `&folder_path=${encodeURIComponent(ordnerPfad)}&_sid=${sid}`;
  const a = await apiGet<{ files: SynoDatei[] }>(url);
  if (!a.success) {
    throw new Error(`Ordner nicht lesbar (Code ${a.error?.code ?? '?'}): ${ordnerPfad}`);
  }
  return a.data?.files ?? [];
}

export async function downloadDatei(
  cfg: HapakConfig,
  sid: string,
  remotePfad: string,
  zielPfad: string,
): Promise<void> {
  const url =
    `${cfg.baseUrl}/webapi/entry.cgi?api=SYNO.FileStation.Download&version=2&method=download` +
    `&path=${encodeURIComponent(remotePfad)}&mode=download&_sid=${sid}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status}): ${remotePfad}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Bei Fehlern liefert FileStation manchmal kleines JSON statt der Datei.
  if (buf.length < 200 && buf.toString('utf8').includes('"success":false')) {
    throw new Error(`Datei nicht abrufbar (evtl. Pfad falsch): ${remotePfad}`);
  }
  await writeFile(zielPfad, buf);
}

export async function tempVerzeichnis(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'hapak-'));
}
