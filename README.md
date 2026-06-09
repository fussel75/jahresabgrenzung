# Jahresabgrenzung

Web-App zur periodengerechten **Abgrenzung von Bauvorhaben** über den
Jahreswechsel für die **FriStD-Bau ZuB GmbH & Co. KG** (HGB-orientiert).

Die App visualisiert laufende und abgeschlossene Bauvorhaben auf einer
Zeitachse und berechnet für alle Projekte, die über den Jahreswechsel laufen,
die Abgrenzung von Aufwand und Ertrag — inkl. der daraus entstehenden
Bilanzpositionen (unfertige Leistungen, ARAP/PRAP, erhaltene Anzahlungen).

> **Status:** V1 vollständig gemäß [SPEC.md](SPEC.md) §12, Schritte 1–9.

## Funktionsumfang

- **Dashboard** mit KPI-Karten, SVG-Gantt (Jahreswechsel-/Heute-Marker,
  Stichjahr/Folgejahr-Färbung, Tooltip, Klicknavigation) und Donut.
- **Projektliste** mit Filtern, Sortierung, Suche, Abgrenzungs-Indikator,
  Auswahl + CSV-Export.
- **Projektdetail**: Stammdaten editierbar, Zahlungen/Kostenpositionen,
  Vergleich aller vier Methoden (Tabelle + Diagramm), Einzel-Zeitstrahl.
- **Abgrenzungsbericht** mit Summenzeile und Export als **Excel, PDF,
  Bericht-CSV und Buchungssatz-CSV**.
- **Import** (CSV-Vorschau für Projekte, HAPAK-Endpoint als Skeleton).
- **Einstellungen**: Geschäftsjahre, Standardmethode, Steuerberater-Daten,
  Konten für Buchungssätze.
- HTTP Basic Auth, deutsche Formatierung, Onboarding, Tastatur-Shortcuts
  (`N` neu · `/` Suche · `E` Bericht).

## Projektstruktur (npm-Workspaces-Monorepo)

```
jahresabgrenzung/
  apps/
    web/      # Vite + React Frontend
    api/      # Express Backend (liefert in Prod auch das Frontend aus)
  packages/
    shared/   # Types, Zod-Schemas, Abgrenzungslogik (mit Unit-Tests)
  prisma/
    schema.prisma + migrations/
```

## Setup (lokal)

Voraussetzung: Node.js ≥ 20.

```bash
npm install
cp .env.example .env          # Werte anpassen (AUTH_USER/AUTH_PASSWORD!)
npm run prisma:migrate        # SQLite-DB + Migration anlegen
npm run seed                  # 9 Beispielprojekte (Q4/2026–Q1/2027)
npm test                      # Abgrenzungslogik (Vitest, 23 Tests)
npm run dev:api               # API auf http://localhost:3000
npm run dev:web               # Frontend (Vite) auf http://localhost:5173
```

Im Dev laufen API (3000) und Frontend (5173) getrennt; Vite proxyt `/api`
an die API.

## Deployment (VPS / Produktion)

> **Empfohlen: Docker + Caddy (automatisches HTTPS).** Die vollständige,
> schrittweise Anleitung steht in **[DEPLOY.md](DEPLOY.md)** — inkl. DNS,
> Backup, Updates und Fehlerbehebung. Kurzfassung:
>
> ```bash
> cp .env.production.example .env   # APP_DOMAIN, AUTH_USER, AUTH_PASSWORD setzen
> docker compose up -d --build
> ```

Alternativ **nativ** ohne Docker: Das Backend liefert in Produktion das gebaute
Frontend mit aus — es läuft also **ein** Node-Prozess.

```bash
# 1) Abhängigkeiten + Frontend bauen
npm install
npm run build --workspace @jahresabgrenzung/shared
npm run build --workspace @jahresabgrenzung/web   # -> apps/web/dist
npm run build --workspace @jahresabgrenzung/api   # -> apps/api/dist

# 2) .env setzen (NICHT committen)
#    DATABASE_URL, AUTH_USER, AUTH_PASSWORD, PORT
#    Für PostgreSQL: provider in prisma/schema.prisma auf "postgresql" stellen
#    und `npx prisma migrate deploy` ausführen.

# 3) Migration + optional Seed
npx prisma migrate deploy
# npm run seed   # nur bei leerer DB gewünscht

# 4) Starten
node apps/api/dist/index.js
```

Empfehlungen für den Server (kann Hermes übernehmen):
- **Reverse Proxy + HTTPS** davor (Caddy oder nginx), da Basic Auth Credentials
  sonst im Klartext übertragen werden.
- Prozess per **systemd** oder **pm2** dauerhaft halten.
- `GET /api/health` ist **ohne Auth** erreichbar → ideal für Uptime-Checks.
- Für mehr als Einzelnutzung: SQLite gegen **PostgreSQL** tauschen (siehe oben).

## Die vier Abgrenzungsmethoden

| Methode | Kurzbeschreibung | HGB |
|---|---|---|
| **Completed Contract** | Realisierung erst bei Fertigstellung; bis Stichtag angefallene Kosten als *unfertige Leistungen* aktiviert, Anzahlungen passiviert. | Standard |
| **Zeitanteilig** (pro rata temporis) | Aufteilung nach Tagen Projektlaufzeit, angewandt auf Auftragssumme und Gesamtkosten. | nur intern |
| **Cost-to-Cost** (PoC light) | Fertigstellungsgrad = Ist-Kosten / geplante Gesamtkosten. | ⚠️ eingeschränkt |
| **Manueller Grad** | Subjektive Einschätzung des Fertigstellungsgrades. | ⚠️ eingeschränkt |

> ⚠️ **HGB-Hinweis:** Gewinnrealisierung vor Fertigstellung (Cost-to-Cost /
> Manuell) ist nach HGB nur in engen Grenzen zulässig (vgl. IDW RS HFA 38).
> Diese Methoden dienen der **internen Analyse**, nicht als Buchungsgrundlage
> ohne Rücksprache mit dem Steuerberater. Die Buchungssatz-Exporte verwenden
> ausschließlich Completed Contract.

## Festgelegte Defaults der Abgrenzungslogik

Wo die Spec offenließ, wurden pragmatische, dokumentierte Defaults gewählt
(siehe Kommentare in `packages/shared/src/abgrenzung.ts`):

- **Maßgebliche Daten:** Ist-Datum vor Plan-Datum.
- **Abgrenzungsbedarf:** Start ≤ Stichtag UND Ende > Stichtag.
- **STORNIERTE** Projekte werden vollständig ausgeschlossen.
- **Tageszählung** inklusive beider Endtage, schaltjahr-genau (`date-fns`).
- **Bilanzpositionen** einheitlich aus Ist-Kosten, anerkanntem Aufwand und
  erhaltenen Anzahlungen abgeleitet.
- **Summenzeile** des Berichts bezieht sich auf die angezeigten (abzugrenzenden)
  Projekte; die globalen KPI-Summen des Dashboards umfassen alle Projekte.

## API-Überblick (alles hinter Basic Auth, außer `/api/health`)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/health` | Health-Check (ohne Auth) |
| GET/POST | `/api/projekte` | Liste (Filter: `status`, `gewerk`, `kunde`, `nurAbzugrenzende`+`geschaeftsjahrId`) / anlegen |
| GET/PUT/DELETE | `/api/projekte/:id` | lesen (inkl. Zahlungen/Kosten) / ändern / löschen |
| POST | `/api/projekte/:id/zahlungen` · `/kostenpositionen` | Untereintrag anlegen |
| DELETE | `/api/zahlungen/:id` · `/api/kostenpositionen/:id` | Untereintrag löschen |
| CRUD | `/api/geschaeftsjahre` | Geschäftsjahre |
| GET/PUT | `/api/einstellungen` | Standardmethode, Steuerberater, Konten |
| GET | `/api/abgrenzung/:gjId?methode=…` | Abgrenzungsbericht (JSON) |
| GET | `/api/abgrenzung/:gjId/export.xlsx` · `export.pdf` | Excel-/PDF-Export |
| POST | `/api/import/hapak` | HAPAK-Import (Skeleton, V1 inaktiv) |

## Tests

```bash
npm test          # einmalig
npm run test:watch
```

Die Abgrenzungslogik ist mit Vitest abgedeckt (23 Tests), inkl. der acht in
SPEC.md §7 geforderten Fälle (kein Abgrenzungsbedarf, alle vier Methoden über
den Jahreswechsel, Anzahlungen, Division durch 0, Storno, Ist-Ende vor
Plan-Ende, Schaltjahr).

## Bekannte Limitierungen (V1)

- Keine echte DATEV-Schnittstelle (nur Vorlagen-/Buchungssatz-CSV).
- Keine MwSt-Logik (alle Beträge netto).
- ARAP/PRAP für die Vergleichsmethoden vereinfacht ohne rechnungsgenaue
  Periodenzuordnung.
- SQLite-Schema ohne Prisma-Enums und ohne `@db.Decimal(12,2)`-Native-Typen
  (Enums als String, Beträge als `Decimal`); für PostgreSQL anpassbar.
- HAPAK-DBF-Import nur als Endpoint-Skeleton.
- Single-User (Basic Auth), kein Rollensystem.

## Ausblick

Geplant ist die Anbindung von **Partner-Apps** (Zeiterfassung) über API-Keys,
um den tatsächlichen Projekt-Aufwand automatisch als Kostenpositionen
einzuspielen. Das Datenmodell ist darauf vorbereitet (`Kostenposition` je
Projekt, `istKostenStichtag`); die Integration folgt, sobald die Keys vorliegen.
