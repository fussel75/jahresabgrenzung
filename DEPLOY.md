# Deployment-Anleitung (Hostinger Docker Manager + Traefik)

Diese Anleitung bringt die Jahresabgrenzung-App produktiv auf einen
**Hostinger-VPS** mit Docker Manager. HTTPS übernimmt **Traefik** (Hostingers
zentraler Reverse-Proxy) automatisch — die App bringt keinen eigenen Proxy mit
und veröffentlicht keine Ports.

> Zielzustand: `https://jahresabgrenzung.fristd-bau.com` mit gültigem
> Let's-Encrypt-Zertifikat, geschützt per Login (Basic Auth).

---

## 0. Voraussetzungen

- Hostinger-VPS mit aktivem **Docker Manager**.
- Domain **`jahresabgrenzung.fristd-bau.com`** per **A-Record** auf die VPS-IP
  (`187.77.67.33`) — ist bereits gesetzt ✅.
- Zugriff aufs **root-Web-Terminal** (Button „Terminal" oben rechts im Docker
  Manager) — hat bereits Docker-Rechte.

---

## 1. Traefik in Hostinger bereitstellen (einmalig)

Im Docker Manager auf **„Traefik bereitstellen"** klicken (Banner unten).
Das legt das Docker-Netzwerk **`traefik-proxy`** und den Cert-Resolver
**`letsencrypt`** an. Prüfen im Terminal:

```bash
docker network ls | grep traefik-proxy
```

Es muss eine Zeile mit `traefik-proxy` erscheinen.

---

## 2. Code auf den Server holen

Der VPS braucht **Lesezugriff** auf das private Repo. Einmalig einen
SSH-Key auf dem Server erzeugen und als **Deploy-Key (read-only)** bei GitHub
hinterlegen:

```bash
ssh-keygen -t ed25519 -C "vps-jahresabgrenzung" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

→ Den ausgegebenen Key bei GitHub hinzufügen:
`https://github.com/fussel75/jahresabgrenzung/settings/keys/new`
(Titel z.B. „VPS", **ohne** „Allow write access"). Danach:

```bash
git clone git@github.com:fussel75/jahresabgrenzung.git
cd jahresabgrenzung
```

---

## 3. Konfiguration (.env)

```bash
cp .env.production.example .env
openssl rand -base64 18      # starkes Passwort erzeugen, kopieren
nano .env                    # AUTH_PASSWORD eintragen, speichern
```

Bereits vorbelegt:
- `APP_DOMAIN=jahresabgrenzung.fristd-bau.com`
- `AUTH_USER=fristd-bau-abgrenzung`

Nur `AUTH_PASSWORD` musst du setzen.

---

## 4. Starten

```bash
docker compose up -d --build
```

Das baut das Image, wendet die Datenbank-Migrationen an und startet die App im
Netzwerk `traefik-proxy`. Traefik erkennt den Container automatisch über die
Labels und holt das HTTPS-Zertifikat (1–3 Minuten).

Logs:

```bash
docker compose logs -f app
```

---

## 5. Funktion prüfen

```bash
curl -s https://jahresabgrenzung.fristd-bau.com/api/health
# -> {"status":"ok"}
```

Dann im Browser `https://jahresabgrenzung.fristd-bau.com` öffnen → Login mit
`AUTH_USER` / `AUTH_PASSWORD`.

---

## 6. Erste Schritte in der App

Die Datenbank ist anfangs leer. Damit Abgrenzungen berechnet werden können,
muss **ein Geschäftsjahr** existieren:

1. Menü **Einstellungen** öffnen.
2. Unter „Geschäftsjahre" das aktuelle Jahr (z.B. `2026`) anlegen.
3. Optional Steuerberater-Daten und Konten hinterlegen.
4. Projekte anlegen (**Projekte → + Neues Projekt**) oder per **Import** (CSV).

### Optional: Beispieldaten zum Testen

> ⚠️ **Achtung:** Das Seed-Skript **löscht alle vorhandenen Daten** und legt
> 9 Demo-Projekte an. Nur auf einer leeren/Test-Datenbank verwenden!

```bash
docker compose exec app node apps/api/dist/seed.js
```

---

## 7. Backup & Wiederherstellung (SQLite)

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

> Empfehlung: täglich per Cronjob sichern und extern ablegen.

---

## 8. Updates einspielen

```bash
cd jahresabgrenzung
git pull
docker compose up -d --build
```

Migrationen laufen beim Start automatisch; die Daten im Volume bleiben erhalten.

---

## 9. Häufige Probleme

| Symptom | Ursache / Lösung |
|---|---|
| `network traefik-proxy not found` | Traefik wurde noch nicht bereitgestellt (Schritt 1). |
| Kein HTTPS / Zertifikatsfehler | DNS prüfen (`dig +short jahresabgrenzung.fristd-bau.com` → `187.77.67.33`), 1–3 Min. warten, `docker compose logs app` und die Traefik-Logs prüfen. |
| `502 Bad Gateway` | App-Container noch nicht bereit/abgestürzt → `docker compose logs app`. |
| Login akzeptiert nichts | `AUTH_USER`/`AUTH_PASSWORD` in `.env` prüfen, dann `docker compose up -d`. |
| Daten weg nach Update | Niemals `docker compose down -v` verwenden — das `-v` löscht Volumes! |

---

## Architektur in Kürze

```
Internet ──443──> [ Traefik (Hostinger) ] ──traefik-proxy──> [ app:3000 ] ──> SQLite (/data)
                   Auto-HTTPS, Routing            Node/Express, liefert API + Frontend
```

- Nur Traefik ist nach außen offen; die App ist nur intern erreichbar.
- `/api/health` ist ohne Login erreichbar (für Monitoring/Uptime).
- Alles andere ist durch Basic Auth geschützt.
