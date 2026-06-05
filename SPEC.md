# Jahresabgrenzung — Spec für Claude Code

> Diese Datei ist die verbindliche Spezifikation für die App. Sie liegt im Repo
> `fussel75/jahresabgrenzung` und wird von Claude Code als Arbeitsgrundlage genutzt.

---

## 1. Ziel der Anwendung

Eine Web-App, die laufende und abgeschlossene Bauvorhaben der
**FriStD-Bau ZuB GmbH & Co. KG** auf einer Zeitachse visualisiert und für alle
Projekte, die über den Jahreswechsel hinweg laufen, eine **periodengerechte
Abgrenzung von Aufwand und Ertrag** berechnet und darstellt.

Die App gibt dem Geschäftsführer und dem Steuerberater einen visuellen Überblick:

- welche Projekte abgegrenzt werden müssen
  (Start ≤ 31.12. UND Ende > 31.12. des Geschäftsjahres),
- wie hoch Aufwand und Ertrag pro Geschäftsjahr sind
  (nach gewählter Abgrenzungsmethode),
- welche Bilanzpositionen daraus entstehen
  (unfertige Leistungen, ARAP/PRAP, erhaltene Anzahlungen).

Die App ist **HGB-orientiert** (kein IFRS). Standardmethode ist
**Completed Contract** (Realisierung erst bei Fertigstellung), ergänzt um
Vergleichsmethoden für interne Auswertung.

---

## 2. Tech-Stack

**Frontend**
- React 18 + Vite + TypeScript
- TailwindCSS
- Recharts (Balken, Donut, Linie)
- Eigene SVG-Komponente für Gantt-Chart mit Jahreswechsel-Marker
- React Router für Navigation
- **State Management:** React Context + `useReducer`, oder einfach `useState`
  pro Komponente. Keine zusätzliche State-Lib (Zustand/Redux) — die App ist zu
  klein dafür.
- date-fns mit deutscher Locale für Datumshandling

**Backend**
- Node.js + Express + TypeScript
- Prisma ORM mit SQLite (lokal) bzw. PostgreSQL (produktiv)
- Zod für Request-Validierung
- CSV-Export via `papaparse`, Excel via `exceljs`,
  PDF via **`pdfkit`** (kein Puppeteer — zu schwer für kleine VPS / Replit)

**Auth (minimal, V1)**
- HTTP Basic Auth vor dem gesamten Backend
- Nutzer/Passwort aus `.env` (`AUTH_USER`, `AUTH_PASSWORD`)
- Frontend wird vom selben Server ausgeliefert, Auth gilt damit auch für die UI.
- In V2 ggf. durch echtes Login (z.B. Lucia Auth) ersetzen.

**Sprachen / Locale**
- Komplette UI auf **Deutsch**
- Zahlenformat: deutsches Format (1.234,56 €)
- Datumsformat: TT.MM.JJJJ

**Repo-Struktur (Monorepo, einfach gehalten)**
```
jahresabgrenzung/
  apps/
    web/      # Vite + React Frontend
    api/      # Express Backend
  packages/
    shared/   # gemeinsame Types, Zod-Schemas, Abgrenzungslogik
  prisma/
    schema.prisma
  SPEC.md
  README.md
```

Workspaces über npm-Workspaces (kein pnpm/yarn nötig, hält Setup einfach).

---

## 3. Datenmodell (Prisma Schema)

```prisma
model Projekt {
  id                       String    @id @default(cuid())
  projektnummer            String    @unique
  bezeichnung              String
  kunde                    String
  kundenadresse            String?
  startdatumGeplant        DateTime
  enddatumGeplant          DateTime
  startdatumIst            DateTime?
  enddatumIst              DateTime?
  auftragssummeNetto       Decimal   @db.Decimal(12, 2)
  gesamtkostenGeplant      Decimal   @db.Decimal(12, 2)
  istKostenStichtag        Decimal   @db.Decimal(12, 2) @default(0)
  fertigstellungGradManuell Float?   // 0.0 - 1.0, optional
  status                   ProjektStatus
  gewerk                   Gewerk
  notizen                  String?
  zahlungen                Zahlung[]
  kostenpositionen         Kostenposition[]
  erstelltAm               DateTime  @default(now())
  geaendertAm              DateTime  @updatedAt
}

enum ProjektStatus {
  ANGEBOT
  BEAUFTRAGT
  LAUFEND
  ABGESCHLOSSEN
  STORNIERT
}

enum Gewerk {
  ZIMMEREI
  DACHDECKEREI
  SHK
  GEMISCHT
}

model Zahlung {
  id           String      @id @default(cuid())
  projektId    String
  projekt      Projekt     @relation(fields: [projektId], references: [id], onDelete: Cascade)
  datum        DateTime
  betragNetto  Decimal     @db.Decimal(12, 2)
  art          ZahlungsArt
  rechnungsNr  String?
  beschreibung String?
}

enum ZahlungsArt {
  ANZAHLUNG
  ABSCHLAG
  SCHLUSSRECHNUNG
  STORNO
}

model Kostenposition {
  id           String    @id @default(cuid())
  projektId    String
  projekt      Projekt   @relation(fields: [projektId], references: [id], onDelete: Cascade)
  datum        DateTime
  betragNetto  Decimal   @db.Decimal(12, 2)
  art          KostenArt
  beschreibung String?
}

enum KostenArt {
  MATERIAL
  LOHN
  SUBUNTERNEHMER
  FREMDLEISTUNG
  SONSTIGES
}

model Geschaeftsjahr {
  id            String   @id @default(cuid())
  jahr          Int      @unique
  beginn        DateTime // i.d.R. 01.01.
  ende          DateTime // i.d.R. 31.12.
  abgeschlossen Boolean  @default(false)
}

model Einstellungen {
  id                     String @id @default(cuid())
  standardMethode        String @default("COMPLETED_CONTRACT")
  steuerberaterName      String?
  steuerberaterAdresse   String?
  steuerberaterEmail     String?
  kontoUnfertigeLeistung String? // z.B. "0860" — konfigurierbar, kein Hardcode
  kontoBestandsveraend   String? // z.B. "8990"
}
```

---

## 4. Abgrenzungsmethoden (Kernlogik)

Implementiere ein Modul `packages/shared/src/abgrenzung.ts`, das pro Projekt
und Stichtag (31.12.) für jede der vier Methoden berechnet:

- `anteilAufwandStichjahr`, `anteilAufwandFolgejahr` (jeweils in € und %)
- `anteilErtragStichjahr`, `anteilErtragFolgejahr`
- `bilanzpositionen`: `{ unfertigeLeistungen, arap, prap, erhalteneAnzahlungen }`

### Methode 1: Completed Contract (HGB-Standard)

- **Aufwand:** Alle bis 31.12. tatsächlich angefallenen Kosten werden als
  **unfertige Leistungen aktiviert** (= bleiben in der Bilanz, mindern den
  Aufwand des Stichjahres). Aufwand wird erst bei Fertigstellung wirksam.
- **Ertrag:** Wird erst bei Schlussrechnung / Abnahme realisiert. Bis dahin
  sind erhaltene Anzahlungen als Verbindlichkeit zu passivieren.
- **Standardmethode** der App.

### Methode 2: Zeitanteilig (pro rata temporis)

- Aufteilung nach Tagen Projektlaufzeit:
  ```
  tageGesamt    = (enddatum - startdatum) in Tagen
  tageStichjahr = (min(enddatum, 31.12.) - max(startdatum, 01.01.)) in Tagen
  anteilStichjahr = tageStichjahr / tageGesamt
  ```
- Anwendung auf Auftragssumme **und** Gesamtkosten.
- Nützlich für interne Vergleichsrechnung und Cashflow-Planung.

### Methode 3: Kostenfortschritt (Cost-to-Cost / PoC light)

- `fertigstellungsgrad = istKostenStichtag / gesamtkostenGeplant`
- `ertragStichjahr     = auftragssumme * fertigstellungsgrad`
- `aufwandStichjahr    = istKostenStichtag`

**WICHTIG — UI-Warnung:** Nach HGB ist Gewinnrealisierung vor Fertigstellung
nur sehr eingeschränkt zulässig (im Wesentlichen über die in IDW RS HFA 38
beschriebenen engen Voraussetzungen). Im UI muss diese Methode mit einem
deutlich sichtbaren gelben Warnhinweis versehen werden:

> ⚠️ Diese Methode ist nach HGB nur in engen Grenzen zulässig. Verwendung
> ausschließlich für interne Analyse, **nicht** als Buchungsgrundlage ohne
> Rücksprache mit dem Steuerberater.

### Methode 4: Manueller Fertigstellungsgrad

- Wenn `fertigstellungGradManuell` gesetzt ist, nutze diesen Wert wie in
  Methode 3 (inkl. derselben HGB-Warnung).
- Erlaubt subjektive Einschätzung (z.B. „Dach zu 70% fertig").

---

## 5. Seiten / Routen

### `/` — Dashboard
- KPI-Karten oben: Anzahl laufender Projekte, Volumen abzugrenzen,
  ARAP-Summe, PRAP-Summe, unfertige Leistungen.
- Auswahl Geschäftsjahr (Dropdown, default = laufendes Jahr).
- Auswahl Abgrenzungsmethode (Dropdown).
- Gantt-Chart (siehe §6) mit allen aktiven Projekten.
- Donut: Aufteilung Auftragssumme Stichjahr vs. Folgejahr.

### `/projekte` — Projektliste
- Tabelle mit Filter (Status, Gewerk, Kunde, „nur abzugrenzende")
  und Sortierung.
- Spalten: Projektnr., Bezeichnung, Kunde, Start, Ende, Volumen, Status,
  Abgrenzungsbedarf (Ja/Nein-Indikator).
- Bulk-Aktion: Export Excel/CSV der ausgewählten Projekte.

### `/projekte/:id` — Projektdetail
- Stammdaten (editierbar).
- Liste Kostenpositionen und Zahlungen.
- Abgrenzungs-Tab: Alle 4 Methoden im Vergleich
  (Tabelle + Mini-Balkendiagramm).
- Zeitstrahl des einzelnen Projekts mit Jahreswechsel-Marker.

### `/projekte/neu` — Neuanlage
- Formular mit Validierung (Zod-Schema, geteilt mit Backend).
- Möglichkeit, CSV/Excel-Import zu nutzen (Bulk).

### `/abgrenzung` — Abgrenzungsbericht
- Vollständige Liste aller abzugrenzenden Projekte für gewähltes
  Geschäftsjahr.
- Spalten: Projekt, Methode, Aufwand StJ / FJ, Ertrag StJ / FJ,
  Unfertige Leistungen, ARAP, PRAP.
- Summenzeile.
- Export-Buttons: Excel, PDF, Buchungssatz-CSV (Format als
  Vorlage — siehe §8).

### `/import` — Datenimport
- HAPAK-DBF-Import: Schnittstelle vorbereiten (POST-Endpoint
  `/api/import/hapak`), tatsächliche Integration als optionaler Schritt
  markiert (Skeleton genügt für V1).
- CSV/Excel-Import für Projekte und Kostenpositionen mit
  Vorschau-Tabelle vor dem Speichern.

### `/einstellungen`
- Geschäftsjahre anlegen.
- Standard-Methode festlegen.
- Steuerberater-Kontaktdaten (für Exporte als Footer).
- Konten für Buchungssatz-Vorschläge konfigurierbar
  (kein Hardcode auf SKR-03-Konten).

---

## 6. Gantt-Komponente (Kernstück der Visualisierung)

Eigene React-Komponente, kein externes Gantt-Lib. SVG-basiert, damit auch in
PDF-Exporten verwendbar.

**Anforderungen:**
- X-Achse: Zeitachse, Skalierung wahlweise Tag/Woche/Monat (Toggle).
- Y-Achse: Projekte (gruppierbar nach Gewerk oder Kunde).
- Jeder Projektbalken zweifarbig: Teil im Stichjahr (Grün) und Teil im
  Folgejahr (Orange) — proportional nach gewählter Methode.
- **Rote vertikale Linie am 1.1.** des Folgejahres
  (Jahreswechsel-Marker), mit Label „Jahreswechsel".
- Tooltip beim Hover: Projektname, Zeitraum, Volumen, Abgrenzungsbetrag.
- Klick auf Balken → Navigation zu Projektdetail.
- Heute-Marker als gestrichelte Linie.

**Performance:** Bei > 50 Projekten Virtualisierung erwägen (`react-window`).

---

## 7. Berechnungs-Service (Backend)

Endpoint `GET /api/abgrenzung/:geschaeftsjahrId?methode=COMPLETED_CONTRACT`

Antwort-Schema:
```ts
{
  geschaeftsjahr: { jahr: number, beginn: string, ende: string },
  methode: 'COMPLETED_CONTRACT' | 'ZEITANTEILIG' | 'COST_TO_COST' | 'MANUELL',
  summen: {
    auftragssummeStichjahr: number,
    auftragssummeFolgejahr: number,
    aufwandStichjahr: number,
    aufwandFolgejahr: number,
    unfertigeLeistungen: number,
    arap: number,
    prap: number,
    erhalteneAnzahlungen: number
  },
  projekte: Array<{
    projektId: string,
    projektnummer: string,
    bezeichnung: string,
    abgrenzungsbedarf: boolean,
    aufteilung: {
      anteilStichjahrProzent: number,
      auftragssummeStichjahr: number,
      auftragssummeFolgejahr: number,
      aufwandStichjahr: number,
      aufwandFolgejahr: number,
      unfertigeLeistungen: number,
      arap: number,
      prap: number
    }
  }>
}
```

**Unit-Tests** für die Abgrenzungslogik mit Vitest. Mindestens 8 Testfälle:
1. Projekt komplett im Stichjahr (kein Abgrenzungsbedarf)
2. Projekt komplett im Folgejahr (kein Abgrenzungsbedarf)
3. Projekt über Jahreswechsel, alle 4 Methoden
4. Projekt mit Anzahlungen
5. Projekt ohne Ist-Kosten (Edge Case Cost-to-Cost → Division durch 0)
6. Projekt mit Status STORNIERT (wird ausgeschlossen)
7. Projekt mit `enddatumIst` vor `enddatumGeplant`
8. Schaltjahr-Tagesberechnung

**TDD-Vorgehen:** Die Abgrenzungslogik wird **zuerst** mit Tests gebaut, vor
allem anderen (siehe §12, Schritt 4).

---

## 8. Buchungssatz-Vorschlag (Export)

Für die Completed-Contract-Methode enthält der Export Buchungssätze als
Vorschlag. Die Konten werden **aus den Einstellungen geladen**, nicht
hartkodiert. Beispiel-Default (SKR 03 für Handwerksbetrieb, vor Einsatz
zwingend mit Steuerberater abstimmen):

```
Pro Projekt mit Abgrenzungsbedarf (Stichjahr):
SOLL  0860 (Unfertige Erzeugnisse / Leistungen)
AN HABEN 8990 (Bestandsveränderung)
       Betrag: istKostenStichtag

Storno im Folgejahr (Eröffnungsbuchung):
SOLL  8990
AN HABEN 0860
       Betrag: istKostenStichtag
```

**Wichtig:** Im UI deutlich kennzeichnen:

> Buchungssatz-Vorschlag — Platzhalterkonten, vor erstem Einsatz mit
> Steuerberater abstimmen und unter Einstellungen anpassen.

---

## 9. UI/UX-Details

- **Mobile-First:** Dashboard, Projektliste und Detailseite müssen auf Mobile
  sauber funktionieren. Gantt-Chart auf Mobile horizontal scrollbar.
- **Farbschema:**
  - Primärfarbe: Anthrazit/Dunkelblau
  - Akzent: Grün für Stichjahr, Orange für Folgejahr,
    Rot für Jahreswechsel-Linie
  - Statusfarben: Grau (Angebot), Blau (Beauftragt), Grün (Laufend),
    Dunkelgrün (Abgeschlossen), Rot (Storniert)
- **Onboarding:** Beim ersten Start Hinweis-Dialog mit Erklärung der vier
  Methoden in 2-3 Sätzen.
- **Tastatur-Shortcuts:** `N` für neues Projekt, `/` für Suche, `E` für Export.

---

## 10. Lieferumfang / Definition of Done

1. Funktionsfähiges Frontend mit allen Routen aus §5.
2. Backend-API mit allen CRUD-Operationen für Projekt, Zahlung,
   Kostenposition, Geschäftsjahr, Einstellungen.
3. Abgrenzungslogik mit allen 4 Methoden und passierenden Unit-Tests.
4. Gantt-Komponente funktional mit Jahreswechsel-Marker.
5. Excel-, PDF- und CSV-Export für Abgrenzungsbericht.
6. Seed-Skript mit 8-10 realistischen Beispielprojekten
   (Mischung Zimmerei/Dachdeckerei/SHK, mit und ohne Abgrenzungsbedarf,
   **Zeitraum Q4/2026 bis Q1/2027** — passend zum aktuellen Geschäftsjahr).
7. HTTP Basic Auth aktiv (Credentials aus `.env`).
8. README mit:
   - Setup-Anleitung (lokal + Deployment)
   - Erklärung der vier Methoden
   - Hinweis HGB vs. interne Auswertung
   - Bekannte Limitierungen
9. GitHub-Repo unter `fussel75/jahresabgrenzung` mit sinnvoller
   Commit-History (nicht ein einzelner Riesencommit).

---

## 11. Nicht-Ziele (für V1 bewusst ausgeschlossen)

- Keine echte DATEV-Schnittstelle (nur Vorlagen-CSV).
- Keine Lohnabgrenzung (Urlaub, Boni) — nur Projektabgrenzung.
- Keine Mehrwertsteuer-Logik (alle Beträge netto).
- Kein Multi-User-System mit Rollen — Basic Auth genügt für V1.
- Keine direkte HAPAK-DB-Anbindung — nur Import-Endpoint als Skeleton.

---

## 12. Erste Schritte (Reihenfolge der Umsetzung)

1. Repo-Setup: Vite + Express Monorepo mit npm-Workspaces.
2. Prisma-Schema, Initial-Migration, SQLite für Entwicklung.
3. **Abgrenzungs-Service mit Unit-Tests zuerst (TDD).**
   Alle 8 Testfälle aus §7 müssen grün sein, bevor weitergegangen wird.
4. API-Routen (CRUD + Abgrenzungs-Endpoint) mit Zod-Validierung.
5. Basic Auth Middleware.
6. Seed-Skript mit realistischen Daten Q4/2026–Q1/2027.
7. Frontend in der Reihenfolge: Dashboard → Projektliste → Projektdetail →
   Gantt-Komponente → Abgrenzungsbericht.
8. Exporte (Excel → CSV → PDF) zum Schluss.
9. README schreiben.

Bei unklaren Entscheidungen pragmatische Defaults wählen und im README
dokumentieren.
