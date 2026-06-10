# -*- coding: utf-8 -*-
"""Erzeugt die Bedienungsanleitung für den Steuerberater als PDF (A4)."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)

ANTHRAZIT = colors.HexColor("#1e2a44")
GRAU = colors.HexColor("#6b7280")
GRUEN = colors.HexColor("#16a34a")
AMBER_BG = colors.HexColor("#fffbeb")
AMBER_BORDER = colors.HexColor("#f59e0b")
ZEILE_BG = colors.HexColor("#f3f4f6")

styles = getSampleStyleSheet()
S = {
    "titel": ParagraphStyle("titel", parent=styles["Title"], fontName="Helvetica-Bold",
                            fontSize=19, textColor=ANTHRAZIT, spaceAfter=2, alignment=0),
    "untertitel": ParagraphStyle("untertitel", parent=styles["Normal"], fontSize=9.5,
                                 textColor=GRAU, spaceAfter=10),
    "h2": ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold",
                         fontSize=12.5, textColor=ANTHRAZIT, spaceBefore=12, spaceAfter=4),
    "body": ParagraphStyle("body", parent=styles["Normal"], fontSize=9.7, leading=13.6,
                           spaceAfter=4),
    "li": ParagraphStyle("li", parent=styles["Normal"], fontSize=9.7, leading=13.6,
                         leftIndent=10, bulletIndent=2, spaceAfter=2.5),
    "warn": ParagraphStyle("warn", parent=styles["Normal"], fontSize=9.3, leading=13,
                           textColor=colors.HexColor("#78350f")),
    "tabelle": ParagraphStyle("tabelle", parent=styles["Normal"], fontSize=9, leading=12),
    "tabkopf": ParagraphStyle("tabkopf", parent=styles["Normal"], fontSize=9,
                              fontName="Helvetica-Bold", textColor=colors.white),
    "fuss": ParagraphStyle("fuss", parent=styles["Normal"], fontSize=9, textColor=GRAU),
}

def t(text, style="body"):
    return Paragraph(text, S[style])

def li(text):
    return Paragraph(text, S["li"], bulletText="–")

def num(text):
    """Nummerierter Punkt ohne zusätzlichen Spiegelstrich."""
    return Paragraph(text, S["li"])

def tabelle(kopf, zeilen, breiten):
    daten = [[Paragraph(z, S["tabkopf"]) for z in kopf]] + [
        [Paragraph(z, S["tabelle"]) for z in zeile] for zeile in zeilen
    ]
    tab = Table(daten, colWidths=breiten, repeatRows=1)
    stil = [
        ("BACKGROUND", (0, 0), (-1, 0), ANTHRAZIT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
    ]
    for i in range(1, len(daten)):
        if i % 2 == 0:
            stil.append(("BACKGROUND", (0, i), (-1, i), ZEILE_BG))
    tab.setStyle(TableStyle(stil))
    return tab

def warnbox(text):
    tab = Table([[Paragraph(text, S["warn"])]], colWidths=[166 * mm])
    tab.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AMBER_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, AMBER_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return tab

story = [
    t("Jahresabgrenzung FriStD-Bau", "titel"),
    t("Kurzanleitung für den Steuerberater · Stand Juni 2026 · App-Version V1", "untertitel"),
    HRFlowable(width="100%", thickness=1.2, color=ANTHRAZIT, spaceAfter=8),

    t("1&nbsp;&nbsp;Zugang", "h2"),
    li("Adresse: <b>https://jahresabgrenzung.fristd-bau.com</b>"),
    li("Anmeldung: Benutzername <b>fristd-bau-abgrenzung</b> — das Passwort erhalten Sie von Herrn Friedrich."),
    li("Aktueller Browser genügt (Desktop empfohlen), keine Installation. Verbindung TLS-verschlüsselt."),

    t("2&nbsp;&nbsp;Was die App macht", "h2"),
    t("Die App stellt die Bauvorhaben der <b>FriStD-Bau ZuB GmbH &amp; Co. KG</b> auf einer Zeitachse dar und "
      "berechnet für alle Projekte über den Jahreswechsel die <b>periodengerechte Abgrenzung von Aufwand und "
      "Ertrag</b> (HGB-orientiert, <b>alle Beträge netto</b>). Die Daten stammen aus einem lesenden Import aus "
      "HAPAK; alle Belege sind datiert, die Berechnung erfolgt je gewähltem Geschäftsjahr <b>stichtagsgenau "
      "(31.12.)</b>. Datenstand = letzter Import durch Herrn Friedrich."),
    Spacer(1, 3),
    tabelle(
        ["Größe", "Quelle in HAPAK"],
        [
            ["Erlöse, Abschläge, Schlussrechnungen", "Rechnungsausgangsbuch (FIBU)"],
            ["Fremd-/Materialkosten", "Rechnungseingangsbuch; Kostenart nach SKR04-Aufwandskonto (54xx = Material, 59xx = Fremdleistung)"],
            ["Eigenleistung Lohn", "Lohnbuch: erfasste Stunden × interner Stundensatz, monatlich je Projekt gebündelt"],
        ],
        [60 * mm, 106 * mm],
    ),

    t("3&nbsp;&nbsp;Bedienung in 30 Sekunden", "h2"),
    t("In der dunklen Kopfleiste <b>Geschäftsjahr</b> und <b>Abgrenzungsmethode</b> wählen — alle Seiten rechnen sofort um."),
    li("<b>Dashboard:</b> Kennzahlen (Volumen abzugrenzen, unfertige Leistungen, ARAP, PRAP) und Zeitachse aller "
       "Projekte mit roter <b>Jahreswechsel-Linie</b> (grüner Balkenanteil = Stichjahr, orange = Folgejahr)."),
    li("<b>Projekte:</b> Liste mit Filter „nur abzugrenzende“. Klick auf ein Projekt öffnet das Detail mit "
       "<b>Methodenvergleich</b> (alle vier Methoden nebeneinander), den <b>Zahlungen</b> (Abschläge/Schluss­rechnungen) "
       "und den <b>Kostenpositionen</b> (Summen-Chips je Kostenart)."),
    li("<b>Abgrenzungsbericht:</b> alle abzugrenzenden Projekte des Geschäftsjahres mit Summenzeile; oben rechts "
       "die Exporte <b>Excel, PDF, Bericht-CSV, Buchungssatz-CSV</b>."),

    t("4&nbsp;&nbsp;Die vier Methoden", "h2"),
    tabelle(
        ["Methode", "Inhalt", "Einordnung"],
        [
            ["<b>Completed Contract</b>", "Realisierung erst bei Abnahme/Schlussrechnung; bis dahin Kosten als unfertige Leistungen aktiviert, erhaltene Abschläge passiviert", "<b>HGB-Standard</b>, Voreinstellung"],
            ["Zeitanteilig (pro rata)", "Aufteilung nach Tagen der Projektlaufzeit", "nur interne Vergleichsrechnung"],
            ["Cost-to-Cost", "Fertigstellungsgrad = Ist-Kosten ÷ kalkulierte Gesamtkosten", "Teilgewinnrealisierung, nach HGB nur eng zulässig (IDW RS HFA 38)"],
            ["Manueller Grad", "frei wählbarer Fertigstellungsgrad je Projekt", "Was-wäre-wenn-Simulation"],
        ],
        [38 * mm, 76 * mm, 52 * mm],
    ),
    Spacer(1, 2),
    t("Die eingeschränkt zulässigen Methoden sind in der App gelb markiert."),

    t("5&nbsp;&nbsp;Bewertungs-Stellhebel (Simulation)", "h2"),
    li("<b>Einstellungen → „Kostenarten in der Abgrenzung“:</b> Auswahl, welche Kostenarten in die Ist-Kosten und "
       "damit in die <b>unfertigen Leistungen</b> einfließen — zum Durchspielen der Herstellungskosten-Bewertung "
       "(Wertunter-/-obergrenze, § 255 HGB). Beim Abwählen von Pflichtbestandteilen warnt die App automatisch."),
    li("<b>Projektdetail → „Manueller Grad“:</b> projektbezogene Was-wäre-wenn-Rechnung."),
    li("Deaktivierte Kostenarten werden im Projektdetail <b>durchgestrichen</b> angezeigt — es ist stets sichtbar, "
       "was eingerechnet ist."),
    Spacer(1, 3),
    warnbox("<b>Hinweis Stetigkeit:</b> Die App ist ein Simulations- und Entscheidungswerkzeug. Die tatsächlich "
            "gewählte Bilanzierung unterliegt dem Stetigkeitsgebot und ist mit Ihnen abzustimmen."),

    t("6&nbsp;&nbsp;Buchungssatz-Vorschlag", "h2"),
    t("Der Export „Buchungssatz-CSV“ erzeugt <b>nur für Completed Contract</b> je abzugrenzendem Projekt:"),
    li("Stichjahr: SOLL Unfertige Leistungen / HABEN Bestandsveränderung (Betrag = aktivierte Ist-Kosten)"),
    li("Folgejahr (Eröffnung): Storno-Gegenbuchung"),
    t("Die Konten sind <b>Platzhalter</b> und unter <i>Einstellungen → Konten</i> zu hinterlegen — bitte vor dem "
      "ersten Einsatz gemeinsam festlegen."),

    t("7&nbsp;&nbsp;Empfohlener Ablauf zum Jahresabschluss", "h2"),
    num("1. Herr Friedrich aktualisiert die Daten (HAPAK-Import) und prüft die Projektliste (Status, Projekt-Start, kalkulierte Gesamtkosten)."),
    num("2. Geschäftsjahr wählen → <b>Abgrenzungsbericht</b> öffnen (Methode: Completed Contract)."),
    num("3. Plausibilisierung im Projektdetail (Methodenvergleich, Kostenarten-Chips)."),
    num("4. Export <b>Excel/PDF</b> für die Akte, <b>Buchungssatz-CSV</b> als Buchungsvorlage."),

    t("8&nbsp;&nbsp;Grenzen der V1", "h2"),
    li("Alle Beträge <b>netto</b>, keine Umsatzsteuer-Logik."),
    li("Eigenleistung Lohn = <b>Einzelkosten</b> (Stunden × interner Satz) — ohne Gemeinkostenzuschläge."),
    li("Zeitanteilig / Cost-to-Cost / Manuell sind <b>nicht buchungsfähig</b> (interne Analyse)."),
    li("Datenstand = letzter HAPAK-Import; bei Bedarf vor dem Termin aktualisieren lassen."),

    Spacer(1, 10),
    HRFlowable(width="100%", thickness=0.8, color=GRAU, spaceAfter=4),
    t("Rückfragen: Ronny Friedrich · FriStD-Bau ZuB GmbH &amp; Co. KG · https://jahresabgrenzung.fristd-bau.com", "fuss"),
]

doc = SimpleDocTemplate(
    "Bedienungsanleitung-Steuerberater.pdf",
    pagesize=A4,
    leftMargin=22 * mm, rightMargin=22 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
    title="Jahresabgrenzung FriStD-Bau — Kurzanleitung für den Steuerberater",
    author="FriStD-Bau ZuB GmbH & Co. KG",
)
doc.build(story)
print("OK: Bedienungsanleitung-Steuerberater.pdf")
