import { Router } from 'express';
import { asyncHandler } from '../helpers.js';
import { ladeAbgrenzung } from '../abgrenzungLoader.js';
import { erstelleExcel, erstellePdf } from '../export.js';

export const abgrenzungRouter = Router();

/**
 * GET /api/abgrenzung/:geschaeftsjahrId?methode=COMPLETED_CONTRACT
 * Ohne `methode` wird die Standardmethode aus den Einstellungen verwendet.
 */
abgrenzungRouter.get(
  '/:geschaeftsjahrId',
  asyncHandler(async (req, res) => {
    const { kontext, fehler } = await ladeAbgrenzung(
      req.params.geschaeftsjahrId,
      req.query.methode as string | undefined,
    );
    if (fehler) {
      res.status(fehler.status).json({ fehler: fehler.nachricht });
      return;
    }
    res.json(kontext!.ergebnis);
  }),
);

// --- Excel-Export ---
abgrenzungRouter.get(
  '/:geschaeftsjahrId/export.xlsx',
  asyncHandler(async (req, res) => {
    const { kontext, fehler } = await ladeAbgrenzung(
      req.params.geschaeftsjahrId,
      req.query.methode as string | undefined,
    );
    if (fehler) {
      res.status(fehler.status).json({ fehler: fehler.nachricht });
      return;
    }
    const buffer = await erstelleExcel(kontext!);
    const jahr = kontext!.geschaeftsjahr.jahr;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="abgrenzung_${jahr}.xlsx"`);
    res.send(buffer);
  }),
);

// --- PDF-Export ---
abgrenzungRouter.get(
  '/:geschaeftsjahrId/export.pdf',
  asyncHandler(async (req, res) => {
    const { kontext, fehler } = await ladeAbgrenzung(
      req.params.geschaeftsjahrId,
      req.query.methode as string | undefined,
    );
    if (fehler) {
      res.status(fehler.status).json({ fehler: fehler.nachricht });
      return;
    }
    const jahr = kontext!.geschaeftsjahr.jahr;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="abgrenzung_${jahr}.pdf"`);
    erstellePdf(kontext!, res);
  }),
);
