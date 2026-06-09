# Deployment-Anleitung (Docker) — für Hermes

Diese Anleitung bringt die Jahresabgrenzung-App produktiv auf einen Linux-VPS:
**ein App-Container** (Node + SQLite) hinter **Caddy** mit automatischem
HTTPS. Zugriff für Geschäftsführer + Steuerberater per Benutzername/Passwort
(HTTP Basic Auth).

> Geschätzte Dauer: ~10 Minuten, sobald der DNS-Eintrag gesetzt ist.

---

## 0. Voraussetzungen

- Linux-VPS (Ubuntu/Debian empfohlen) mit root- oder sudo-Zugang.
- Eine (Sub-)Domain, z.B. `abgrenzung.fristd-bau.de`.
- Offene Ports **80** und **443**.

Betriebssystem prüfen (falls unbekannt):

```bash
cat /etc/os-release
```

---

## 1. Docker installieren (falls noch nicht vorhanden)

**Ubuntu/Debian:**

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
docker --version && docker compose version
```

(Bei RHEL/AlmaLinux/Rocky funktioniert das `get.docker.com`-Skript ebenfalls.)

---

## 2. DNS-Eintrag setzen

Beim Domain-Anbieter einen **A-Record** anlegen:

```
abgrenzung   A   <öffentliche-IP-des-VPS>
```

Prüfen (sollte die VPS-IP zeigen):

```bash
dig +short abgrenzung.fristd-bau.de
```

> Caddy holt das HTTPS-Zertifikat erst, wenn die Domain auf den Server zeigt.

---

## 3. Firewall öffnen (falls aktiv)

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw status
```

---

## 4. Code auf den Server holen

```bash
git clone <REPO-URL> jahresabgrenzung
cd jahresabgrenzung
```

(Alternativ den Projektordner per `scp`/`rsync` hochladen.)

---

## 5. Konfiguration (.env) anlegen

```bash
cp .env.production.example .env
nano .env
```

Setzen:

- `APP_DOMAIN` = eure Domain (z.B. `abgrenzung.fristd-bau.de`)
- `AUTH_USER` = gewünschter Benutzername
- `AUTH_PASSWORD` = **starkes** Passwort

Speichern. Die `.env` bleibt nur auf dem Server (wird nicht committet).

---

## 6. Starten

```bash
docker compose up -d --build
```

Das baut das Image, wendet die Datenbank-Migrationen an und startet App +
Caddy. Beim ersten Start kann der Build einige Minuten dauern.

Status & Logs:

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f caddy   # zeigt die Zertifikatsausstellung
```

---

## 7. Funktion prüfen

```bash
curl -s https://abgrenzung.fristd-bau.de/api/health
# -> {"status":"ok"}
```

Dann im Browser `https://abgrenzung.fristd-bau.de` öffnen → Login mit
`AUTH_USER` / `AUTH_PASSWORD`.

---

## 8. Erste Schritte in der App

Die Datenbank ist anfangs leer. Damit Abgrenzungen berechnet werden können,
muss **ein Geschäftsjahr** existieren:

1. Menü **Einstellungen** öffnen.
2. Unter „Geschäftsjahre" das aktuelle Jahr (z.B. `2026`) anlegen
   (Beginn/Ende werden automatisch auf 01.01.–31.12. gesetzt).
3. Optional Steuerberater-Daten und Konten hinterlegen.
4. Projekte anlegen (Menü **Projekte → + Neues Projekt**) oder per
   **Import** (CSV) hochladen.

### Optional: Beispieldaten zum Testen

> ⚠️ **Achtung:** Das Seed-Skript **löscht alle vorhandenen Daten** und legt
> 9 Demo-Projekte an. Nur auf einer leeren/Test-Datenbank verwenden!

```bash
docker compose exec app node apps/api/dist/seed.js
```

---

## 9. Backup & Wiederherstellung (SQLite)

Die gesamte Datenbank ist **eine Datei** im Volume `app_data`.

**Backup:**

```bash
docker compose cp app:/data/jahresabgrenzung.db ./backup-$(date +%F).db
```

**Wiederherstellen:**

```bash
docker compose stop app
docker compose cp ./backup-2026-06-08.db app:/data/jahresabgrenzung.db
docker compose start app
```

> Empfehlung: das Backup-Kommando per Cronjob täglich laufen lassen und die
> `.db`-Datei zusätzlich extern sichern.

---

## 10. Updates einspielen

```bash
cd jahresabgrenzung
git pull
docker compose up -d --build
```

Migrationen werden beim Start automatisch angewendet; die Daten im Volume
bleiben erhalten.

---

## 11. Häufige Probleme

| Symptom | Ursache / Lösung |
|---|---|
| Kein HTTPS / Zertifikatsfehler | DNS zeigt noch nicht auf den Server, oder Port 80/443 zu. `dig` prüfen, Firewall öffnen, `docker compose logs caddy`. |
| `502 Bad Gateway` | App-Container noch nicht bereit oder abgestürzt. `docker compose logs app`. |
| Login-Fenster akzeptiert nichts | `AUTH_USER`/`AUTH_PASSWORD` in `.env` prüfen, danach `docker compose up -d`. |
| Daten weg nach Update | Sollte nicht passieren (Volume `app_data`). Niemals `docker compose down -v` verwenden — das `-v` löscht Volumes! |

---

## 12. Kein Domainname vorhanden?

Dann in `Caddyfile` den `{$APP_DOMAIN}`-Block auskommentieren und den
`:80`-Fallback aktivieren (Kommentar in der Datei). Zugriff dann über
`http://<VPS-IP>`. **Hinweis:** Ohne Domain gibt es kein vertrauenswürdiges
HTTPS — für den Steuerberater-Zugang ist eine Domain dringend zu empfehlen.

---

## Architektur in Kürze

```
Internet ──443──> [ Caddy ]  ──> [ app:3000 (Node/Express) ] ──> SQLite (/data, Volume)
                  Auto-HTTPS       liefert API + Frontend
```

- Nur Caddy ist nach außen offen; die App ist nur intern erreichbar.
- `/api/health` ist ohne Login erreichbar (für Monitoring/Uptime-Checks).
- Alles andere ist durch Basic Auth geschützt.
