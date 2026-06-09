import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Synology FileStation-Client (read-only) für den HAPAK-Zugriff über
 * QuickConnect. Es wird nur gelesen — niemals auf das NAS geschrieben.
 *
 * Konfiguration über Umgebungsvariablen (auf dem Server, nicht im Code):
 *   HAPAK_NAS_ID        QuickConnect-ID, z.B. "megathron2024"
 *   HAPAK_NAS_URL       (optional) direkte Basis-URL statt QuickConnect-ID
 *   HAPAK_NAS_USER      NAS-Benutzer (read-only-User empfohlen)
 *   HAPAK_NAS_PASS      NAS-Passwort  (Secret!)
 *   HAPAK_BASIS_PFAD    Default "/HapakV22/FB ZuB"
 */

export interface HapakConfig {
  baseUrl: string;
  user: string;
  pass: string;
  basisPfad: string;
}

export function hapakConfigAusEnv(): { config?: HapakConfig; fehlend: string[] } {
  const id = process.env.HAPAK_NAS_ID?.trim();
  const urlOverride = process.env.HAPAK_NAS_URL?.trim();
  const user = process.env.HAPAK_NAS_USER?.trim() ?? '';
  const pass = process.env.HAPAK_NAS_PASS ?? '';
  const basisPfad = process.env.HAPAK_BASIS_PFAD?.trim() || '/HapakV22/FB ZuB';
  const baseUrl = urlOverride || (id ? `https://${id}.quickconnect.to` : '');

  const fehlend: string[] = [];
  if (!baseUrl) fehlend.push('HAPAK_NAS_ID (oder HAPAK_NAS_URL)');
  if (!user) fehlend.push('HAPAK_NAS_USER');
  if (!pass) fehlend.push('HAPAK_NAS_PASS');
  if (fehlend.length) return { fehlend };

  return {
    config: { baseUrl: baseUrl.replace(/\/+$/, ''), user, pass, basisPfad },
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
