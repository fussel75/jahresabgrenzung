import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetch as uFetch, Agent } from 'undici';

/**
 * Synology FileStation-Client (read-only) für den HAPAK-Zugriff.
 *
 * QuickConnect-IDs (z.B. "megathron2024") werden über Synologys Coordinator
 * (global.quickconnect.to/Serv.php) zu echten Adressen aufgelöst — die Portal-
 * URL <id>.quickconnect.to liefert nur HTML, nicht die API. Es werden mehrere
 * Kandidaten (Regional-Relay, SmartDNS, FQDN/DDNS, WAN-IP, Relay-Tunnel)
 * durchprobiert; der erste mit erfolgreichem Login gewinnt.
 *
 * Konfiguration (Server-Umgebungsvariablen; mehrere Schreibweisen akzeptiert):
 *   Host/ID:   HAPAK_NAS_ID | HAPAK_NAS_URL | NAS_HOST | NAS_URL | NAS_QUICKCONNECT_ID
 *   Benutzer:  HAPAK_NAS_USER | NAS_USER
 *   Passwort:  HAPAK_NAS_PASS | NAS_PASS   (Secret!)
 *   Basispfad: HAPAK_BASIS_PFAD | NAS_BASIS_PFAD   (Default "/HapakV22/FB ZuB")
 */

// TLS-Prüfung nur für IP-/Relay-Kandidaten gelockert (Synology nutzt dort z.T.
// IP-/Geräte-Zertifikate). Hostname-Kandidaten werden weiterhin geprüft.
const relaxedAgent = new Agent({ connect: { rejectUnauthorized: false } });

export interface HapakConfig {
  quickConnectId?: string;
  directUrl?: string;
  user: string;
  pass: string;
  basisPfad: string;
}

export interface HapakSession {
  baseUrl: string;
  sid: string;
  relaxed: boolean;
}

const ersterWert = (...namen: string[]): string =>
  namen.map((n) => process.env[n]?.trim()).find((v) => v) ?? '';

/** Deutet den Host-Wert als QuickConnect-ID oder als direkte URL. */
function deuteHost(roh: string): { quickConnectId?: string; directUrl?: string } {
  const s = roh.trim().replace(/\/+$/, '');
  const qcPath = s.match(/quickconnect\.to\/([A-Za-z0-9_-]+)/i);
  if (qcPath) return { quickConnectId: qcPath[1] };
  const qcHost = s.match(/^(?:https?:\/\/)?([A-Za-z0-9_-]+)\.quickconnect\.to\/?$/i);
  if (qcHost) return { quickConnectId: qcHost[1] };
  if (/^https?:\/\//i.test(s)) return { directUrl: s };
  if (s.includes('.') || s.includes(':')) return { directUrl: `https://${s}` };
  return { quickConnectId: s };
}

export function hapakConfigAusEnv(): { config?: HapakConfig; fehlend: string[] } {
  const hostRoh = ersterWert(
    'HAPAK_NAS_ID',
    'HAPAK_NAS_URL',
    'NAS_HOST',
    'NAS_URL',
    'NAS_QUICKCONNECT_ID',
  );
  const user = ersterWert('HAPAK_NAS_USER', 'NAS_USER');
  const pass = process.env.HAPAK_NAS_PASS ?? process.env.NAS_PASS ?? '';
  const basisPfad = ersterWert('HAPAK_BASIS_PFAD', 'NAS_BASIS_PFAD') || '/HapakV22/FB ZuB';

  const fehlend: string[] = [];
  if (!hostRoh) fehlend.push('HAPAK_NAS_ID');
  if (!user) fehlend.push('HAPAK_NAS_USER');
  if (!pass) fehlend.push('HAPAK_NAS_PASS');
  if (fehlend.length) return { fehlend };

  return { config: { ...deuteHost(hostRoh), user, pass, basisPfad }, fehlend: [] };
}

// --- HTTP-Helfer ----------------------------------------------------------

interface HttpAntwort {
  status: number;
  text: string;
  json: any;
}

async function http(
  url: string,
  opts: { method?: string; body?: string; relaxed?: boolean; timeoutMs?: number } = {},
): Promise<HttpAntwort> {
  const res = await uFetch(url, {
    method: opts.method ?? 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
    dispatcher: opts.relaxed ? relaxedAgent : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json };
}

// --- QuickConnect-Auflösung ----------------------------------------------

interface ServInfo {
  server?: { fqdn?: string; ddns?: string; external?: { ip?: string } };
  service?: { port?: number; ext_port?: number; relay_ip?: string; relay_port?: number };
  smartdns?: { host?: string; external?: string };
  env?: { control_host?: string; relay_region?: string };
}

/** Leere/„NULL"-Werte aus HAPAK/Synology herausfiltern. */
function gueltig(v?: string): string | undefined {
  const s = v?.trim();
  return s && s.toUpperCase() !== 'NULL' ? s : undefined;
}

interface Kandidat {
  url: string;
  relaxed: boolean;
  quelle: string;
}

async function servPhp(host: string, id: string): Promise<ServInfo[]> {
  const body = JSON.stringify([
    { version: 1, command: 'get_server_info', stop_when_error: false, stop_when_success: false, id: 'dsm_portal_https', serverID: id, is_gofile: false },
    { version: 1, command: 'get_server_info', stop_when_error: false, stop_when_success: false, id: 'dsm_portal', serverID: id, is_gofile: false },
  ]);
  const { json } = await http(`https://${host}/Serv.php`, { method: 'POST', body, timeoutMs: 8000 });
  if (!json) return [];
  return Array.isArray(json) ? (json as ServInfo[]) : [json as ServInfo];
}

async function ermittleKandidaten(id: string): Promise<Kandidat[]> {
  let infos = await servPhp('global.quickconnect.to', id);
  const controlHost = infos.map((i) => i.env?.control_host).find(Boolean);
  if (controlHost && controlHost !== 'global.quickconnect.to') {
    try {
      infos = infos.concat(await servPhp(controlHost, id));
    } catch {
      /* control_host optional */
    }
  }
  const k: Kandidat[] = [];
  const add = (url: string, relaxed: boolean, quelle: string) => {
    if (url && !k.some((x) => x.url === url)) k.push({ url, relaxed, quelle });
  };

  // SmartDNS-/Hostname-Kandidaten (gültige Synology-Zertifikate) zuerst.
  for (const info of infos) {
    const s = info.service ?? {};
    const srv = info.server ?? {};
    const sd = info.smartdns ?? {};
    const port = s.ext_port || s.port || 5001;
    const ext = gueltig(sd.external); // z.B. syn4-…-WANIP.<id>.direct.quickconnect.to
    const host = gueltig(sd.host); // z.B. <ID>.direct.quickconnect.to
    const ddns = gueltig(srv.ddns);
    const fqdn = gueltig(srv.fqdn);
    if (ext) add(`https://${ext}:${port}`, false, 'SmartDNS-Extern');
    if (host) add(`https://${host}:${port}`, false, 'SmartDNS-Host');
    if (ddns) add(`https://${ddns}:${port}`, false, 'DDNS');
    if (fqdn) add(`https://${fqdn}:${port}`, false, 'FQDN');
  }
  // IP-/Relay-Kandidaten (TLS gelockert) zuletzt.
  for (const info of infos) {
    const s = info.service ?? {};
    const srv = info.server ?? {};
    const port = s.ext_port || s.port || 5001;
    const ip = gueltig(srv.external?.ip);
    if (ip && ip !== '::') add(`https://${ip}:${port}`, true, 'WAN-IP');
    if (s.relay_ip && s.relay_port) add(`https://${s.relay_ip}:${s.relay_port}`, true, 'Relay-Tunnel');
  }
  return k;
}

// --- Anmeldung ------------------------------------------------------------

async function versucheLogin(
  baseUrl: string,
  user: string,
  pass: string,
  relaxed: boolean,
): Promise<string> {
  const url =
    `${baseUrl}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login` +
    `&account=${encodeURIComponent(user)}&passwd=${encodeURIComponent(pass)}` +
    `&session=FileStation&format=sid`;
  const { status, json } = await http(url, { relaxed, timeoutMs: 12000 });
  if (!json) throw new Error(`keine JSON-Antwort (HTTP ${status})`);
  if (!json.success || !json.data?.sid) {
    throw new Error(`Synology-Fehlercode ${json.error?.code ?? '?'}`);
  }
  return json.data.sid as string;
}

/** Löst die Adresse auf, probiert die Kandidaten durch und meldet sich an. */
export async function anmelden(
  cfg: HapakConfig,
): Promise<{ session?: HapakSession; versuche: string[] }> {
  const versuche: string[] = [];
  const kandidaten: Kandidat[] = [];
  if (cfg.directUrl) kandidaten.push({ url: cfg.directUrl, relaxed: false, quelle: 'direkte URL' });
  if (cfg.quickConnectId) {
    try {
      kandidaten.push(...(await ermittleKandidaten(cfg.quickConnectId)));
    } catch (e) {
      versuche.push(`QuickConnect-Auflösung fehlgeschlagen: ${(e as Error).message}`);
    }
  }
  if (kandidaten.length === 0) {
    versuche.push('Keine erreichbare Adresse ermittelbar.');
    return { versuche };
  }
  for (const kand of kandidaten) {
    const host = (() => {
      try {
        return new URL(kand.url).host;
      } catch {
        return kand.url;
      }
    })();
    try {
      const sid = await versucheLogin(kand.url, cfg.user, cfg.pass, kand.relaxed);
      versuche.push(`${kand.quelle} (${host}): OK`);
      return { session: { baseUrl: kand.url, sid, relaxed: kand.relaxed }, versuche };
    } catch (e) {
      versuche.push(`${kand.quelle} (${host}): ${(e as Error).message}`);
    }
  }
  return { versuche };
}

export async function logout(session: HapakSession): Promise<void> {
  try {
    await http(
      `${session.baseUrl}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=logout&session=FileStation&_sid=${session.sid}`,
      { relaxed: session.relaxed, timeoutMs: 6000 },
    );
  } catch {
    /* nicht kritisch */
  }
}

// --- Dateioperationen (read-only) -----------------------------------------

export interface SynoDatei {
  name: string;
  isdir: boolean;
  path: string;
}

export async function listOrdner(session: HapakSession, ordnerPfad: string): Promise<SynoDatei[]> {
  const url =
    `${session.baseUrl}/webapi/entry.cgi?api=SYNO.FileStation.List&version=2&method=list` +
    `&folder_path=${encodeURIComponent(ordnerPfad)}&_sid=${session.sid}`;
  const { json } = await http(url, { relaxed: session.relaxed, timeoutMs: 15000 });
  if (!json?.success) throw new Error(`Ordner nicht lesbar (Code ${json?.error?.code ?? '?'}): ${ordnerPfad}`);
  return (json.data?.files ?? []) as SynoDatei[];
}

export async function downloadDatei(
  session: HapakSession,
  remotePfad: string,
  zielPfad: string,
): Promise<void> {
  const url =
    `${session.baseUrl}/webapi/entry.cgi?api=SYNO.FileStation.Download&version=2&method=download` +
    `&path=${encodeURIComponent(remotePfad)}&mode=download&_sid=${session.sid}`;
  const res = await uFetch(url, {
    signal: AbortSignal.timeout(60000),
    dispatcher: session.relaxed ? relaxedAgent : undefined,
  });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status}): ${remotePfad}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200 && buf.toString('utf8').includes('"success":false')) {
    throw new Error(`Datei nicht abrufbar (evtl. Pfad falsch): ${remotePfad}`);
  }
  await writeFile(zielPfad, buf);
}

export async function tempVerzeichnis(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'hapak-'));
}
