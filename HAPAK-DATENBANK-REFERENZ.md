# HAPAK-Datenbank-Referenz (FriStD-Bau)

> Zweck: Eigenständige technische Referenz für die Entwicklung von Importen aus der
> HAPAK-Branchensoftware (Version V22) der FriStD-Bau ZuB GmbH & Co. KG.
> Alle Angaben wurden im Juni 2026 **an den echten Daten verifiziert** (Datensatzzahlen
> = damaliger Stand). Erstellt im Rahmen der App „Jahresabgrenzung".

---

## 1. Speicherort & Zugriff

**Physischer Ablageort:** Synology-NAS „Megathron1" im Firmennetz.

| Zugriffsweg | Details |
|---|---|
| SMB (Firmennetz) | `\\Megathron1\HapakV22\FB ZuB\` |
| Synology FileStation-API (extern) | QuickConnect-ID `megathron2024`; Pfad `/HapakV22/FB ZuB`. Achtung: `https://<id>.quickconnect.to` ist nur die Portalseite — die echte Adresse muss über `https://global.quickconnect.to/Serv.php` (Command `get_server_info`) aufgelöst werden; am zuverlässigsten ist der SmartDNS-Host `<ID>.direct.quickconnect.to:5001`. Login via `SYNO.API.Auth` (Version 3, `session=FileStation`, `format=sid`), Download via `SYNO.FileStation.Download`. |

**WICHTIG: Ausschließlich lesender Zugriff!** Es handelt sich um die produktive
Buchhaltungs-/Auftragsdatenbank. Niemals schreiben, umbenennen, löschen.
Empfohlen: Dateien in ein lokales Temp-Verzeichnis kopieren und nur die Kopien parsen.

## 2. Dateiformat

- **dBASE/Visual-FoxPro-Tabellen**: je Tabelle `*.DBF` (Daten), optional `*.FPT` (Memo-Felder) und `*.CDX` (Indizes — für Importe irrelevant, nicht nötig).
- **Zeichencodierung: CP1252** (Windows-1252). UTF-8-Annahme zerstört Umlaute.
- Bewährter Parser (Node.js): `dbffile` mit `{ encoding: 'cp1252', readMode: 'loose' }`. `readMode: 'loose'` ist nötig, weil einzelne Dateien kleinere Formatabweichungen haben.
- **Beim Download immer DBF + zugehörige FPT mitnehmen**, sonst fehlen Memo-Inhalte.
- Datentypen: `C`=Char (rechts mit Spaces gepolstert → trimmen!), `N`=Numerisch, `D`=Datum, `L`=Logisch, `M`=Memo.
- **Fallstricke:**
  - Leere Felder kommen je nach Typ als `''`, `null` oder `0` an → defensiv normalisieren.
  - Manche Textfelder enthalten den **Literal-String `"NULL"`** (z. B. `FQDN`-artige Felder) → wie leer behandeln.
  - Ein vereinzelter Datums-Tippfehler existiert (eine Lohnbuchung mit Jahr 2041) → Plausibilitätsfilter empfohlen.

## 3. Ordnerstruktur (Basis: `…\FB ZuB\`)

| Ordner | Inhalt | Import-Relevanz |
|---|---|---|
| `Daten\` | Dokumente (Angebote, AB, Rechnungen …): zentrale `DOKUMENT.DBF` + **eine Positions-DBF je Dokument** (`<Dokumentnummer>.DBF`, z. B. `RZZ26000032.DBF`) | hoch |
| `Fibu\` | Rechnungsbuch `FIBUZWO.DBF` (**maßgebliche Beträge!**), `FIBUADD.DBF`, `KONTO.DBF`, `STEUERSATZ.DBF`, `BANK.DBF` … | sehr hoch |
| `Adressen\` | `ADRESSEN.DBF` (Kunden + Lieferanten), `PERSONAL.DBF`, `ANSPRECH.DBF` … | hoch |
| `Lohn\` | `LOHNBUCH.DBF` — Zeiterfassung je Mitarbeiter/Tag mit Projektbezug | hoch |
| `NKalk\` | Nachkalkulation | optional |
| `Material\`, `Leistung\`, `Lager\` | Stammdaten Artikel/Leistungen | gering |
| `AuftVert\`, `Fremd\`, `Floskel\`, `Forms\`, `Texte\`, `User\`, `Jumbo\` | Vorlagen, Formulare, Programmdaten | keine |

## 4. Zentrales Verknüpfungsmodell

```
                    PROJNAME / KTR  (= Projektschlüssel, z. B. "PZZ25000003")
                          │
   ┌──────────────────────┼──────────────────────────┐
   │                      │                          │
DOKUMENT.DBF         FIBUZWO.DBF                LOHNBUCH.DBF
(PROJNAME)           (KTR)                      (KTR)
   │  NAME ◄────────────► RNR                       │
   │  (Dokument-Nr.)   (Rechnungs-Nr.)              │
   │                      │                          │
   │  KUNDE ──────┐   ADR_NR ────┐              KNDNR ────┐
   │              ▼              ▼                        ▼
   │            ADRESSEN.DBF (KU_NR)  ← Kunden & Lieferanten
   │
   └─ je Dokument: Positionsdatei  Daten\<NAME>.DBF
```

**Die drei wichtigsten Schlüssel:**

1. **Projekt:** `DOKUMENT.PROJNAME` = `FIBUZWO.KTR` = `LOHNBUCH.KTR` (Char, z. B. `PV00003`, `PX00006`, `PY00001`, `PZZ25000003`). Interne, stabile ID — **als Primärschlüssel für Importe verwenden.**
2. **Dokument/Rechnung:** `DOKUMENT.NAME` (z. B. `RY00017`) = `FIBUZWO.RNR`. Über diese Verknüpfung erhält eine FIBU-Buchung ihren Dokumenttyp.
3. **Adresse:** `ADRESSEN.KU_NR` (5-stellig, z. B. `11248`) = `DOKUMENT.KUNDE` = `FIBUZWO.ADR_NR` = `LOHNBUCH.KNDNR`.

**Menschliche Projektnummer (JJ-NNNNN):** In der HAPAK-Oberfläche heißen Projekte
`25-00003` etc. Diese Nummer steht **nicht als Feld** in den Tabellen. Ableitung:
bei neuem Format `PZZ25000003` → `25-00003` direkt aus dem Schlüssel; bei älteren
(`PX00006`) → Jahr aus dem Anlagedatum (`DOKUMENT.DATUM` der Kopfzeile) + laufende
Nummer aus dem Schlüssel → `23-00006`. **Sammelprojekte:** `JJ-00001` („Kleinprojekte
JJJJ") bündeln viele Kleinaufträge — bei projektbezogenen Auswertungen gesondert behandeln.

## 5. Tabellen im Detail

### 5.1 `Daten\DOKUMENT.DBF` — alle Dokumente (Stand: 8.339 Zeilen, 44 Felder)

Eine Zeile je Dokument: Angebot, Auftragsbestätigung, Rechnung, Abschlags-/Schluss-
rechnung, Gutschrift, Kostenschätzung, Lieferschein, „Ordner"-Platzhalter usw.
Auch die **Projektkopf-Zeile** ist hier: erkennbar an `NAME == PROJNAME`.

Wichtige Felder:

| Feld | Typ | Bedeutung |
|---|---|---|
| `ID` | C1 | Dokumentklasse. **`"5"` = Eingangsrechnung (Lieferantenrechnung)**, `"0"` = Projektkopf, `"1"` = Standarddokument, `"9"` = Kalkulation u. a. |
| `NAME` | C12 | Dokumentnummer (z. B. `AL00001`, `RY00017`) — verknüpft mit `FIBUZWO.RNR` und der Positionsdatei `Daten\<NAME>.DBF` |
| `PROJNAME` | C12 | Projektschlüssel (leer bei projektlosen Dokumenten) |
| `BEZUGID`/`BEZUGNAME` | C1/C12 | Verweis auf Bezugsdokument (z. B. Rechnung → Angebot) |
| `KUNDE` | C5 | Adressnummer (→ `ADRESSEN.KU_NR`) |
| `KUNDESUCH` | C30 | Such-/Matchcode des Kunden (Klartext-Fallback) |
| `TYPUNDNR` | C80 | **Anzeigetyp + Nummer als Text**, z. B. `"Angebot 11-00001"`, `"Rechnung 24-00017 (1. Abschlagsrechnung)"`, `"Schlussrechnung 26-00040"`. Quelle für die Typ-Erkennung (s. u.) und für die menschliche Belegnummer |
| `BETREFF` | C80 | Betreff (beim Projektkopf = Projektbezeichnung, z. B. „Meistertwiete 5, Neubau EFH") |
| `DATUM` | D | Belegdatum (beim Projektkopf = **Anlagedatum des Projekts — NICHT Baubeginn!**) |
| `NETTO`, `MWST`, `BETRAG` | N | Netto, USt, Brutto. **Achtung:** bei Abschlagsrechnungen **kumulativ** (s. § 6.3) |
| `ABSNETTO/ABSUST/ABSBRUTTO` | N | bereits zuvor abgerechnete (kumulierte) Beträge |
| `STATUS` | N2 | Dokumentstatus (beobachtet: 1, 3, 4, 5; 5 ≈ abgerechnet) |
| `KONTO`, `KST` | C | Erlöskonto/Kostenstelle |
| `ERSTELLDAT`, `POSTAUSDAT` | D | Erstellung / Postausgang |

**Dokumenttyp-Erkennung** (Reihenfolge wichtig, erste Übereinstimmung gewinnt):

```
ID == "5"                                  → EINGANGSRECHNUNG (hat Vorrang!)
TYPUNDNR beginnt mit "abschlag…"           → ABSCHLAGSRECHNUNG
TYPUNDNR beginnt mit "schluss…"            → SCHLUSSRECHNUNG
TYPUNDNR beginnt mit "gutschrift…"         → GUTSCHRIFT
TYPUNDNR beginnt mit "rechnung…"
    … und enthält "abschlagsrechnung"      → ABSCHLAGSRECHNUNG
    … sonst                                → RECHNUNG
alles andere (Angebot, AB, Ordner, …)      → kein Rechnungsdokument
```

### 5.2 `Daten\<Dokumentnummer>.DBF` — Positionen je Dokument

Pro Dokument existiert eine eigene DBF mit dessen Einzelpositionen (Menge, EP, GP,
Lohn-/Materialanteile der Kalkulation). Für Summen-Importe nicht nötig (Summen stehen
in DOKUMENT/FIBUZWO); relevant nur, wenn Positionsdaten gebraucht werden.

### 5.3 `Fibu\FIBUZWO.DBF` — Rechnungsbuch (Stand: 19.596 Zeilen, 80 Felder)

**Die maßgebliche Quelle für echte Beträge und Zahlungsstatus.** Mehrere Zeilen je
Rechnung: Hauptzeile + Zahlungs-/Folgezeilen (`RE_ID` gruppiert, `IDX` nummeriert).

Wichtige Felder:

| Feld | Typ | Bedeutung |
|---|---|---|
| `RE_ID`/`IDX` | N | Buchungsgruppe / Zeilenindex innerhalb der Gruppe |
| `LFD_NR`, `PERIODE` | C | laufende Nummer, Buchungsperiode `JJJJMM` |
| `ART` | C2 | **`RA` = Rechnungsausgang (an Kunden), `RE` = Rechnungseingang (von Lieferanten)** |
| `TYP` | C2 | **`HR` = Hauptrechnung (die eigentliche Rechnung), `ZA` = Zahlungszeile, `HG` = Gutschrift** |
| `KENNUNG` | N3 | Buchungskennung (beob.: 100/130/300/330 …) |
| `RNR` | C20 | Rechnungs-/Dokumentnummer → `DOKUMENT.NAME` (bei `RE` = Lieferanten-Rechnungsnr.) |
| `KTR` | C12 | **Kostenträger = Projektschlüssel** (→ PROJNAME) |
| `ADR_NR`, `ADR_SUCH` | C | Adressnummer + Suchname (bei `RE` = Lieferant) |
| `BETREFF` | C80 | Buchungstext |
| `BELEGDAT`, `RECHDAT`, `FAELLIGDAT`, `ZAHLDAT` | D | Beleg-/Rechnungs-/Fälligkeits-/Zahldatum |
| `NETTO`, `BRUTTO`, `BETRAG` | N | **Echte (nicht-kumulative!) Beträge der Zeile** |
| `ZAHLUNG`, `OFFEN`, `SK_BETRAG` | N | bereits gezahlt, offener Rest, Skonto |
| `KONTO_B`, `KONTO_G` | C5 | Soll-/Gegenkonto. **Bei `RE`+`HR` ist `KONTO_G` das Aufwandskonto (SKR04!)** → Kostenart ableitbar: `54xx` = Material/Wareneingang, `59xx` = Fremdleistungen, sonst Sonstiges. (Bei `RA` ist `KONTO_B` das Erlöskonto, z. B. `4400`.) |
| `STR_ID`, `STR_BET`, `STR_PRO` | | Steuersatz-Verweis (→ `STEUERSATZ.DBF`), Steuerbetrag, Prozent |
| `BEZAHLFLAG`, `STORNOFLAG`, `MAHNFLAG` … | N1 | Statusflags (`BEZAHLFLAG` 2 ≈ vollständig bezahlt) |

**Standard-Auswertungen:**
- Erlöse/Forderungen je Projekt: `ART='RA' AND TYP='HR'`, gruppiert nach `KTR`, Betrag `NETTO`.
- Gutschriften: `ART='RA' AND TYP='HG'` (Betrag ggf. per `ABS()` normieren, negativ ansetzen).
- **Fremd-/Materialkosten je Projekt:** `ART='RE' AND TYP='HR'`, gruppiert nach `KTR`, Betrag `NETTO`, Kostenart aus `KONTO_G`.
- Zahlungseingänge: `TYP='ZA'`-Zeilen bzw. `ZAHLUNG`/`OFFEN` der Hauptzeile.

### 5.4 `Fibu\FIBUADD.DBF` — Zusatzdaten Eingangsrechnungen (klein, 22 Felder)

Verknüpft über `RE_ID`/`RNR`. Enthält Zusatzdaten/Termine zu einzelnen
Eingangsrechnungen; bei FriStD-Bau kaum gepflegt (46 Zeilen) → meist verzichtbar.

### 5.5 `Adressen\ADRESSEN.DBF` — Kunden & Lieferanten (Stand: 1.432 Zeilen, 72 Felder)

| Feld | Bedeutung |
|---|---|
| `ID` | `K` = Kunde, (andere Werte für Lieferanten etc.) |
| `KU_NR` | **Adressnummer (Schlüssel)**, 5-stellig |
| `SUCH` | Matchcode (Großbuchstaben-Suchname) |
| `FA_TITEL`, `NAME`, `NAME2` | Firma/Titel + Name (Anzeige: `[FA_TITEL] NAME NAME2`) |
| `STRASSE`, `PLZ`, `ORT`, `LAND` | Anschrift |
| `TEL`, `FAX`, `FUNK_PRIV`, `EMAIL`, `WWW` | Kontakt |
| `IBAN`, `SWIFT`, `BANK`, `SEPAMANDAT` | Bankdaten |
| `ZAHLZIEL`, `SKONTO`, `SKONTOTAGE`, `RABATT` | Konditionen |
| `USTIDNR`, `STEUERKZ`, `GEWERBLICH` | Steuermerkmale |
| `FIBUNR` | Debitoren-/Kreditorennummer FiBu |
| `INAKTIV` | Logisch |

### 5.6 `Lohn\LOHNBUCH.DBF` — Zeiterfassung (Stand: 39.427 Zeilen, 35 Felder; gepflegt seit 2008, aktiv bis heute)

Eine Zeile je Mitarbeiter und Arbeitstag (teils mehrere je Tag bei Projektwechsel).

| Feld | Typ | Bedeutung |
|---|---|---|
| `PERSNR` | C9 | Personalnummer (→ `Adressen\PERSONAL.DBF`) |
| `LA_NR` | C3 | Lohnart (`001` = Normalstunden; weitere für Urlaub/Krank etc.) |
| `TAG` | D | Arbeitstag |
| `BUCHTAG` | D | Buchungstag |
| `VONZEIT`/`BISZEIT` | C5 | Uhrzeiten |
| `MINSUM` | N6 | **Arbeitsminuten** (570 = 9,5 h) |
| `PAUSE` | N4 | Pausenminuten (oft 0/leer — je nach Erfassung schon in MINSUM berücksichtigt) |
| `LSATZ_EK` | N7 | **interner Stundensatz €** (Kostensatz) |
| `LSATZ_VK` | N7 | Verkaufsstundensatz € |
| `KTR` | C12 | **Projektschlüssel** (leer bei nicht projektbezogenen Zeiten wie Urlaub) |
| `KNDNR` | C5 | Kundennummer |
| `BUCHTEXT` | C80 | Freitext |
| `KST`, `KOSTENART` | | Kostenstelle/-art |
| `STORNOFLAG` | N1 | 1 = storniert → ignorieren |
| `URLAUB`, `SOLLMINSUM`, `SOLLPAUSE` | | Soll-/Urlaubswerte |

**Lohnkosten je Projekt** = Σ über Zeilen mit `KTR` gesetzt und `STORNOFLAG ≠ 1`:
`max(0, MINSUM − PAUSE) / 60 × LSATZ_EK`. Das sind **Einzelkosten ohne
Gemeinkostenzuschlag**. Empfehlung: monatlich je Projekt aggregieren (sonst
zehntausende Einzelzeilen).

### 5.7 Referenztabellen (`Fibu\`)

- `STEUERSATZ.DBF` (34 Zeilen): `ID`, `MATCH` (z. B. „USt 19%"), `PROZENT`, `KNT_NR`, DATEV-Kennzeichen. Verknüpft über `FIBUZWO.STR_ID`.
- `KONTO.DBF`: Kontenplan (**SKR04**-orientiert: 4400 = Erlöse 19 %, 5400 = Wareneingang, 5900 = Fremdleistungen, 1800 = Bank …).
- `BANK.DBF`: Hausbanken.

## 6. Bewährte Import-Regeln (aus der Praxis verifiziert)

### 6.1 FIBUZWO ist die Wahrheit für Beträge
Die `NETTO`-Werte in `DOKUMENT.DBF` sind bei Abschlagsrechnungen **kumulativ** und
generell weniger zuverlässig. Für Erlöse, Kosten und Zahlungsstände immer
`FIBUZWO` (`TYP='HR'`) verwenden — dort sind die Beträge **je Rechnung echt
(nicht-kumulativ)**.

### 6.2 Auftragssumme eines Projekts
Es gibt **kein verlässliches Einzelfeld**. Angebote/AB existieren teils mehrfach je
Gewerk, teils gar nicht, teils weicht die Rechnung ab. Robusteste Definition:
**Σ Ausgangsrechnungen (RA/HR) − Gutschriften (RA/HG)** je `KTR`. Bei laufenden
Projekten = „bisher abgerechnet".

### 6.3 Abschlagsketten (nur falls man doch aus DOKUMENT rechnet)
HAPAK speichert Abschlagsrechnungs-Summen in `DOKUMENT.DBF` **kumulativ**. Echter
Betrag der n-ten Abschlagsrechnung = Differenz zur (n−1)-ten der Kette (Kette über
Projekt + Datum sortiert; `ABSNETTO` = zuvor abgerechnet). Bei FIBUZWO-basierten
Importen entfällt das Problem.

### 6.4 Projektzeitraum
- **Anlagedatum** (`DOKUMENT.DATUM` des Projektkopfs) ≠ Baubeginn! Projekte werden oft Monate vor Baustart angelegt.
- Brauchbarer Start-Schätzer: Datum der **ersten Ausgangsrechnung** (oder erster Lohnbuchung).
- Projektende: Datum der **Schlussrechnung** (Typ aus `TYPUNDNR` der über `RNR→NAME` verknüpften Dokumente). Ohne Schlussrechnung gilt das Projekt als laufend.

### 6.5 Sonstige Praxis-Hinweise
- Alle Beträge **netto** auswerten (USt separat über `STR_*`/`MWST`).
- Char-Felder trimmen; `"NULL"`-Literale wie leer behandeln.
- Datums-Plausibilität prüfen (Tippfehler-Jahre).
- Performance: `DOKUMENT.DBF` ≈ 4 MB, `FIBUZWO.DBF` ≈ 12 MB, `LOHNBUCH.DBF` ≈ 11 MB — vollständiges Einlesen in Speicher ist unproblematisch (< 100 k Zeilen gesamt).
- `ZEITREGI.DBF` (Adressen-Ordner) ist **leer** — die Zeiterfassung liegt im `LOHNBUCH.DBF`.

## 7. Minimales Parser-Beispiel (Node.js)

```js
import { DBFFile } from 'dbffile'; // npm i dbffile

const dbf = await DBFFile.open('FIBUZWO.DBF', { encoding: 'cp1252', readMode: 'loose' });
const rows = await dbf.readRecords(dbf.recordCount);

const S = (v) => (v == null ? '' : String(v).trim());
const N = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Beispiel: Fremd-/Materialkosten je Projekt
const kostenJeProjekt = new Map();
for (const r of rows) {
  if (S(r.ART) === 'RE' && S(r.TYP) === 'HR' && S(r.KTR)) {
    const k = S(r.KTR);
    kostenJeProjekt.set(k, (kostenJeProjekt.get(k) ?? 0) + N(r.NETTO));
  }
}
```

---

*Referenz erstellt Juni 2026 auf Basis der produktiven HAPAK-V22-Daten der
FriStD-Bau ZuB GmbH & Co. KG. Feldlisten entsprechen den real geparsten Headern;
Interpretationen wurden gegen die HAPAK-Oberfläche und die FiBu-Summen validiert.*
