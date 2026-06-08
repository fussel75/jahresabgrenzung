import { Router } from 'express';

/**
 * Import-Schnittstelle (Skeleton, siehe SPEC.md §5 / §11).
 *
 * Die tatsächliche HAPAK-DBF-Anbindung ist für V1 bewusst NICHT umgesetzt —
 * hier steht nur der vorbereitete Endpoint. Der CSV/Excel-Import wird im
 * Frontend (Vorschau vor dem Speichern) bzw. in einem späteren Schritt ergänzt.
 */
export const importRouter = Router();

importRouter.post('/hapak', (_req, res) => {
  res.status(501).json({
    fehler: 'HAPAK-Import in V1 nicht implementiert',
    hinweis: 'Endpoint ist als Skeleton vorbereitet (siehe SPEC.md §11).',
  });
});
