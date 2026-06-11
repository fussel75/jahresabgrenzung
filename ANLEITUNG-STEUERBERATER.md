# Jahresabgrenzung FriStD-Bau — Kurzanleitung für den Steuerberater

> Stand: Juni 2026 · App-Version V1 · Quelle dieser Anleitung: `ANLEITUNG-STEUERBERATER.md` im Repo

## 1. Zugang

- **Adresse:** https://jahresabgrenzung.fristd-bau.com
- **Anmeldung:** Benutzername `fristd-bau-abgrenzung`, das Passwort erhalten Sie von Herrn Friedrich.
- Es genügt ein aktueller Browser (Desktop empfohlen). Keine Installation nötig. Die Verbindung ist TLS-verschlüsselt.

## 2. Was die App macht

Die App stellt die Bauvorhaben der **FriStD-Bau ZuB GmbH & Co. KG** auf einer Zeitachse dar und berechnet für alle Projekte, die über den Jahreswechsel laufen, die **periodengerechte Abgrenzung von Aufwand und Ertrag** (HGB-orientiert, **alle Beträge netto**).

**Datenherkunft (automatischer, lesender Import aus HAPAK):**

| Größe | Quelle |
|---|---|
| Erlöse, Abschläge, Schlussrechnungen | HAPAK-Rechnungsausgangsbuch (FIBU) |
| Fremd-/Materialkosten | HAPAK-Rechnungseingangsbuch, Kostenart nach SKR04-Aufwandskonto (54xx = Material, 59xx = Fremdleistung) |
| Eigenleistung Lohn | HAPAK-Lohnbuch: erfasste Stunden × interner Stundensatz, monatlich je Projekt gebündelt |

Alle Belege sind **datiert** — die App rechnet je gewähltem Geschäftsjahr **stichtagsgenau (31.12.)**. Der Datenstand entspricht dem letzten Import durch Herrn Friedrich.

## 3. Bedienung in 30 Sekunden

In der **dunklen Kopfleiste** wählen Sie **Geschäftsjahr** und **Abgrenzungsmethode** — alle Seiten rechnen sofort um.

- **Dashboard:** Kennzahlen (Volumen abzugrenzen, unfertige Leistungen, ARAP, PRAP), Zeitachse aller Projekte mit roter **Jahreswechsel-Linie** (grüner Balkenanteil = Stichjahr, orange = Folgejahr).
- **Projekte:** Liste mit Filter „nur abzugrenzende". Klick auf ein Projekt öffnet das Detail mit **Methodenvergleich** (alle vier Methoden nebeneinander), den **Zahlungen** (Abschläge/Schlussrechnungen) und den **Kostenpositionen** (Summen-Chips je Kostenart: Material / Fremdleistung / Lohn / Sonstiges).
- **Abgrenzungsbericht:** alle abzugrenzenden Projekte des gewählten Geschäftsjahres mit Summenzeile. Oben rechts die Exporte: **Excel, PDF, Bericht-CSV, Buchungssatz-CSV**.

## 4. Die vier Methoden

| Methode | Inhalt | Einordnung |
|---|---|---|
| **Completed Contract** | Realisierung erst bei Abnahme/Schlussrechnung; bis dahin Kosten als unfertige Leistungen aktiviert, erhaltene Abschläge passiviert | **HGB-Standard**, Voreinstellung |
| Zeitanteilig (pro rata) | Aufteilung nach Tagen der Projektlaufzeit | nur interne Vergleichsrechnung |
| Cost-to-Cost | Fertigstellungsgrad = Ist-Kosten ÷ kalkulierte Gesamtkosten | ⚠️ Teilgewinnrealisierung, nach HGB nur eng zulässig (IDW RS HFA 38) |
| Manueller Grad | frei wählbarer Fertigstellungsgrad je Projekt | ⚠️ Was-wäre-wenn-Simulation |

Die eingeschränkt zulässigen Methoden sind in der App **gelb markiert**.

## 5. Bewertungs-Stellhebel (Simulation)

- **Einstellungen → „Kostenarten in der Abgrenzung":** Auswahl, welche Kostenarten in die Ist-Kosten und damit in die **unfertigen Leistungen** einfließen — zum Durchspielen der Herstellungskosten-Bewertung (Wertunter-/-obergrenze, § 255 HGB). Beim Abwählen von Pflichtbestandteilen erscheint automatisch ein Hinweis.
- **Projektdetail → „Voraussichtliches Ende":** Bei laufenden Projekten steuert das geplante Ende, ob das Projekt über den Jahreswechsel läuft (Abgrenzungsbedarf) — zentraler Hebel für die zeitliche Zuordnung der Gewinnrealisierung. Das **tatsächliche Ende** (Schlussrechnung aus HAPAK) hat Vorrang, sobald es vorliegt.
- **Projektdetail → „Manueller Grad":** projektbezogene Was-wäre-wenn-Rechnung.
- Im Projektdetail zeigen die Kostenarten-Chips deaktivierte Arten **durchgestrichen** — es ist immer sichtbar, was eingerechnet ist.

> **Hinweis Stetigkeit:** Die App ist ein Simulations- und Entscheidungswerkzeug. Die tatsächlich gewählte Bilanzierung unterliegt dem Stetigkeitsgebot und ist mit Ihnen abzustimmen.

## 6. Buchungssatz-Vorschlag

Der Export „Buchungssatz-CSV" erzeugt **nur für Completed Contract** je abzugrenzendem Projekt:

1. Stichjahr: SOLL Unfertige Leistungen / HABEN Bestandsveränderung (Betrag = aktivierte Ist-Kosten)
2. Folgejahr (Eröffnung): Storno-Gegenbuchung

Die Konten sind **Platzhalter** und unter *Einstellungen → Konten* zu hinterlegen — bitte vor erstem Einsatz festlegen.

## 7. Empfohlener Ablauf zum Jahresabschluss

1. Herr Friedrich aktualisiert die Daten (Import aus HAPAK) und prüft die Projektliste (Status, Projekt-Start, **voraussichtliches Ende**, kalkulierte Gesamtkosten).
2. Geschäftsjahr wählen → **Abgrenzungsbericht** öffnen (Methode: Completed Contract).
3. Plausibilisierung im Projektdetail (Methodenvergleich, Kostenarten-Chips).
4. Export **Excel/PDF** für die Akte, **Buchungssatz-CSV** als Buchungsvorlage.

## 8. Grenzen der V1

- Alle Beträge **netto**, keine Umsatzsteuer-Logik.
- Eigenleistung Lohn = **Einzelkosten** (Stunden × interner Satz) — **ohne** Gemeinkostenzuschläge.
- Zeitanteilig / Cost-to-Cost / Manuell sind **nicht buchungsfähig** (interne Analyse).
- Datenstand = letzter HAPAK-Import; bei Bedarf vor dem Termin aktualisieren lassen.

---

**Rückfragen:** Ronny Friedrich · FriStD-Bau ZuB GmbH & Co. KG
