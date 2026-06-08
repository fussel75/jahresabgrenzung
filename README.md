# Jahresabgrenzung

Web-App zur periodengerechten **Abgrenzung von Bauvorhaben** über den
Jahreswechsel für die **FriStD-Bau ZuB GmbH & Co. KG** (HGB-orientiert).

> **Status:** In Umsetzung gemäß [SPEC.md](SPEC.md) §12.
> Aktuell abgeschlossen: Schritt 1 (Repo-Setup), Schritt 2 (Prisma-Schema +
> Migration), Schritt 3 (Abgrenzungs-Service mit Unit-Tests, TDD),
> Schritt 4 (API-Routen + Zod), Schritt 5 (Basic Auth), Schritt 6 (Seed),
> Schritt 7 (Frontend: Dashboard, Projektliste/-detail, Gantt, Bericht,
> Import, Einstellungen). Es folgen: Exporte Excel/PDF (Schritt 8).

## Projektstruktur (npm-Workspaces-Monorepo)

```
jahresabgrenzung/
  apps/
    web/      # Vite + React Frontend (Platzhalter — Schritt 7)
    api/      # Express Backend (Platzhalter — Schritt 4–6)
  packages/
    shared/   # gemeinsame Types, Zod-Schemas, Abgrenzungslogik (fertig)
  prisma/
    schema.prisma
```

## Setup (lokal)

Voraussetzung: Node.js ≥ 20.

```bash
npm install
cp .env.example .env          # Werte anpassen (AUTH_USER/AUTH_PASSWORD!)
npm run prisma:migrate        # SQLite-DB + Migration anlegen
npm run seed                  # 9 Beispielprojekte (Q4/2026–Q1/2027)
npm test                      # Abgrenzungslogik (Vitest)
npm run dev:api               # API auf http://localhost:3000
npm run dev:web               # Frontend (Vite) auf http://localhost:5173
```

Im Dev laufen API (3000) und Frontend (5173) getrennt; Vite proxyt `/api`
an die API. Für Produktion `npm run build --workspace @jahresabgrenzung/web`
ausführen — die API liefert dann das gebaute Frontend aus `apps/web/dist` aus.

### API-Überblick (alles hinter HTTP Basic Auth, außer `/api/health`)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/health` | Health-Check (ohne Auth, fürs Monitoring) |
| GET/POST | `/api/projekte` | Projekte auflisten (Filter: `status`, `gewerk`, `kunde`, `nurAbzugrenzende`+`geschaeftsjahrId`) / anlegen |
| GET/PUT/DELETE | `/api/projekte/:id` | Projekt lesen (inkl. Zahlungen/Kosten) / ändern / löschen |
| POST | `/api/projekte/:id/zahlungen` | Zahlung anlegen |
| POST | `/api/projekte/:id/kostenpositionen` | Kostenposition anlegen |
| DELETE | `/api/zahlungen/:id`, `/api/kostenpositionen/:id` | Einzeleintrag löschen |
| CRUD | `/api/geschaeftsjahre` | Geschäftsjahre verwalten |
| GET/PUT | `/api/einstellungen` | Standardmethode, Steuerberater, Konten |
| GET | `/api/abgrenzung/:geschaeftsjahrId?methode=…` | Abgrenzungsbericht (alle 4 Methoden) |
| POST | `/api/import/hapak` | HAPAK-Import (Skeleton, V1 nicht aktiv) |

## Die vier Abgrenzungsmethoden

| Methode | Kurzbeschreibung | HGB |
|---|---|---|
| **Completed Contract** | Realisierung erst bei Fertigstellung; bis Stichtag angefallene Kosten werden als *unfertige Leistungen* aktiviert, Anzahlungen passiviert. | Standard |
| **Zeitanteilig** (pro rata temporis) | Aufteilung nach Tagen Projektlaufzeit, angewandt auf Auftragssumme und Gesamtkosten. | nur intern |
| **Cost-to-Cost** (PoC light) | Fertigstellungsgrad = Ist-Kosten / geplante Gesamtkosten. | ⚠️ nur eingeschränkt |
| **Manueller Grad** | Subjektive Einschätzung des Fertigstellungsgrades. | ⚠️ nur eingeschränkt |

> ⚠️ **HGB-Hinweis:** Gewinnrealisierung vor Fertigstellung (Cost-to-Cost /
> Manuell) ist nach HGB nur in engen Grenzen zulässig (vgl. IDW RS HFA 38).
> Diese Methoden dienen der internen Analyse, **nicht** als Buchungsgrundlage
> ohne Rücksprache mit dem Steuerberater.

## Festgelegte Defaults der Abgrenzungslogik

Wo die Spec offenlässt, wurden pragmatische Defaults gewählt
(siehe Kommentare in `packages/shared/src/abgrenzung.ts`):

- **Maßgebliche Daten:** Ist-Datum vor Plan-Datum.
- **Abgrenzungsbedarf:** Start ≤ Stichtag UND Ende > Stichtag.
- **STORNIERTE** Projekte werden vollständig ausgeschlossen.
- **Tageszählung** inklusive beider Endtage, schaltjahr-genau (`date-fns`).
- **Bilanzpositionen** werden einheitlich aus Ist-Kosten, anerkanntem Aufwand
  und erhaltenen Anzahlungen abgeleitet.

## Bekannte Limitierungen (V1)

- Keine echte DATEV-Schnittstelle (nur Vorlagen-CSV).
- Keine MwSt-Logik (alle Beträge netto).
- ARAP/PRAP für die Vergleichsmethoden vereinfacht ohne rechnungsgenaue
  Periodenzuordnung.
- SQLite-Schema ohne `@db.Decimal(12,2)`-Native-Typen (für PostgreSQL ergänzen).
