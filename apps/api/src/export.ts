import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  buchungssaetzeCompletedContract,
  DEFAULT_KONTEN,
  type Abgrenzungsmethode,
  type AbgrenzungsErgebnis,
} from '@jahresabgrenzung/shared';
import type { AbgrenzungKontext } from './abgrenzungLoader.js';

const METHODE_LABEL_FALLBACK: Record<Abgrenzungsmethode, string> = {
  COMPLETED_CONTRACT: 'Completed Contract (HGB-Standard)',
  ZEITANTEILIG: 'Zeitanteilig (pro rata temporis)',
  COST_TO_COST: 'Kostenfortschritt (Cost-to-Cost)',
  MANUELL: 'Manueller Fertigstellungsgrad',
};

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const proz = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function abzugrenzende(ergebnis: AbgrenzungsErgebnis) {
  return ergebnis.projekte.filter((p) => p.abgrenzungsbedarf);
}

function summen(ergebnis: AbgrenzungsErgebnis) {
  const init = {
    aufwandStichjahr: 0,
    aufwandFolgejahr: 0,
    auftragssummeStichjahr: 0,
    auftragssummeFolgejahr: 0,
    unfertigeLeistungen: 0,
    arap: 0,
    prap: 0,
  };
  return abzugrenzende(ergebnis).reduce((acc, p) => {
    const a = p.aufteilung;
    acc.aufwandStichjahr += a.aufwandStichjahr;
    acc.aufwandFolgejahr += a.aufwandFolgejahr;
    acc.auftragssummeStichjahr += a.auftragssummeStichjahr;
    acc.auftragssummeFolgejahr += a.auftragssummeFolgejahr;
    acc.unfertigeLeistungen += a.unfertigeLeistungen;
    acc.arap += a.arap;
    acc.prap += a.prap;
    return acc;
  }, init);
}

function steuerberaterZeilen(k: AbgrenzungKontext): string[] {
  const e = k.einstellungen;
  if (!e?.steuerberaterName && !e?.steuerberaterAdresse) return [];
  return [
    'Steuerberater: ' + [e?.steuerberaterName, e?.steuerberaterAdresse, e?.steuerberaterEmail]
      .filter(Boolean)
      .join(' · '),
  ];
}

// --- Excel ----------------------------------------------------------------

export async function erstelleExcel(k: AbgrenzungKontext): Promise<Buffer> {
  const { ergebnis, geschaeftsjahr } = k;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Jahresabgrenzung';
  const ws = wb.addWorksheet(`Abgrenzung ${geschaeftsjahr.jahr}`);

  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = `Abgrenzungsbericht ${geschaeftsjahr.jahr} — Methode: ${
    METHODE_LABEL_FALLBACK[ergebnis.methode] ?? ergebnis.methode
  }`;
  ws.getCell('A1').font = { bold: true, size: 14 };

  const kopf = [
    'Projektnr.', 'Bezeichnung', 'Anteil StJ %', 'Aufwand StJ', 'Aufwand FJ',
    'Ertrag StJ', 'Ertrag FJ', 'Unf. Leistungen', 'ARAP', 'PRAP',
  ];
  const kopfZeile = ws.addRow([]);
  ws.addRow(kopf).eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  });
  void kopfZeile;

  const geldFmt = '#,##0.00 "€"';
  for (const p of abzugrenzende(ergebnis)) {
    const a = p.aufteilung;
    const row = ws.addRow([
      p.projektnummer, p.bezeichnung, a.anteilStichjahrProzent / 100,
      a.aufwandStichjahr, a.aufwandFolgejahr, a.auftragssummeStichjahr,
      a.auftragssummeFolgejahr, a.unfertigeLeistungen, a.arap, a.prap,
    ]);
    row.getCell(3).numFmt = '0.0%';
    [4, 5, 6, 7, 8, 9, 10].forEach((i) => (row.getCell(i).numFmt = geldFmt));
  }

  const s = summen(ergebnis);
  const summenRow = ws.addRow([
    'Summe', '', '', s.aufwandStichjahr, s.aufwandFolgejahr, s.auftragssummeStichjahr,
    s.auftragssummeFolgejahr, s.unfertigeLeistungen, s.arap, s.prap,
  ]);
  summenRow.eachCell((c) => (c.font = { bold: true }));
  [4, 5, 6, 7, 8, 9, 10].forEach((i) => (summenRow.getCell(i).numFmt = geldFmt));

  ws.columns.forEach((c, i) => (c.width = i === 1 ? 32 : 15));

  // Buchungssätze (Completed Contract)
  const ws2 = wb.addWorksheet('Buchungssätze (CC)');
  ws2.addRow(['Projektnr.', 'Text', 'Soll', 'Haben', 'Betrag']).eachCell(
    (c) => (c.font = { bold: true }),
  );
  const konten = {
    kontoUnfertigeLeistung: k.einstellungen?.kontoUnfertigeLeistung || DEFAULT_KONTEN.kontoUnfertigeLeistung,
    kontoBestandsveraend: k.einstellungen?.kontoBestandsveraend || DEFAULT_KONTEN.kontoBestandsveraend,
  };
  for (const p of abzugrenzende(ergebnis)) {
    for (const b of buchungssaetzeCompletedContract(
      { projektId: p.projektId, projektnummer: p.projektnummer, bezeichnung: p.bezeichnung, abgrenzungsbedarf: true, methode: 'COMPLETED_CONTRACT', aufteilung: p.aufteilung },
      konten,
    )) {
      const r = ws2.addRow([b.projektnummer, b.text, b.sollKonto, b.habenKonto, b.betrag]);
      r.getCell(5).numFmt = geldFmt;
    }
  }
  ws2.getColumn(2).width = 50;
  ws2.addRow([]);
  ws2.addRow(['Hinweis: Platzhalterkonten — vor Einsatz mit Steuerberater abstimmen.']);
  for (const z of steuerberaterZeilen(k)) ws2.addRow([z]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// --- PDF ------------------------------------------------------------------

export function erstellePdf(k: AbgrenzungKontext, res: NodeJS.WritableStream): void {
  const { ergebnis, geschaeftsjahr } = k;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  doc.pipe(res);

  doc.fontSize(16).text(`Abgrenzungsbericht ${geschaeftsjahr.jahr}`, { continued: false });
  doc.fontSize(10).fillColor('#666').text(
    `Methode: ${METHODE_LABEL_FALLBACK[ergebnis.methode] ?? ergebnis.methode} · ${
      abzugrenzende(ergebnis).length
    } abzugrenzende Projekte`,
  );
  doc.moveDown(0.8).fillColor('#000');

  const spalten = [
    { t: 'Projekt', b: 235 },
    { t: 'Anteil', b: 45 },
    { t: 'Aufw. StJ', b: 65 },
    { t: 'Aufw. FJ', b: 65 },
    { t: 'Ertr. StJ', b: 65 },
    { t: 'Ertr. FJ', b: 65 },
    { t: 'Unf. Leist.', b: 70 },
    { t: 'ARAP', b: 60 },
    { t: 'PRAP', b: 60 },
  ];
  const startX = doc.page.margins.left;
  let y = doc.y;

  function zeile(werte: string[], opt: { bold?: boolean; linie?: boolean } = {}) {
    doc.fontSize(9).font(opt.bold ? 'Helvetica-Bold' : 'Helvetica');
    let x = startX;
    werte.forEach((w, i) => {
      doc.text(w, x + 2, y + 3, {
        width: spalten[i].b - 4,
        align: i === 0 ? 'left' : 'right',
        lineBreak: false,
        ellipsis: true,
      });
      x += spalten[i].b;
    });
    y += 18;
    if (opt.linie) {
      doc.moveTo(startX, y).lineTo(x, y).strokeColor('#ccc').stroke();
    }
  }

  zeile(spalten.map((s) => s.t), { bold: true, linie: true });
  for (const p of abzugrenzende(ergebnis)) {
    const a = p.aufteilung;
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    zeile([
      `${p.projektnummer} ${p.bezeichnung}`,
      proz.format(a.anteilStichjahrProzent) + '%',
      eur.format(a.aufwandStichjahr),
      eur.format(a.aufwandFolgejahr),
      eur.format(a.auftragssummeStichjahr),
      eur.format(a.auftragssummeFolgejahr),
      eur.format(a.unfertigeLeistungen),
      eur.format(a.arap),
      eur.format(a.prap),
    ]);
  }
  const s = summen(ergebnis);
  doc.moveTo(startX, y).lineTo(startX + spalten.reduce((a, c) => a + c.b, 0), y).strokeColor('#333').stroke();
  zeile([
    'Summe', '',
    eur.format(s.aufwandStichjahr), eur.format(s.aufwandFolgejahr),
    eur.format(s.auftragssummeStichjahr), eur.format(s.auftragssummeFolgejahr),
    eur.format(s.unfertigeLeistungen), eur.format(s.arap), eur.format(s.prap),
  ], { bold: true });

  const fussY = y + 20;
  const fussBreite = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.fontSize(8).fillColor('#999');
  doc.text(
    'Buchungssatz-Vorschläge basieren auf Platzhalterkonten — vor Einsatz mit dem Steuerberater abstimmen.',
    startX,
    fussY,
    { width: fussBreite },
  );
  for (const z of steuerberaterZeilen(k)) doc.text(z, startX, doc.y, { width: fussBreite });

  doc.end();
}
