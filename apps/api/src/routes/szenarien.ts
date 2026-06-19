import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, parseBody } from '../helpers.js';

/**
 * Szenarien = benannte Snapshots fuer Was-waere-wenn-Rechnungen.
 *
 * Ein Snapshot speichert:
 *   - globale Methodenwahl + Kostenarten-Schalter (aus Einstellungen)
 *   - pro Projekt: fertigstellungGradManuell + enddatumGeplant
 *     (das voraussichtliche Projektende; Stellhebel fuer Abgrenzungsbedarf)
 *
 * "Anwenden" schreibt die gespeicherten Werte in die Einstellungen und
 * die jeweiligen Projekte zurueck — alles wird damit wiederherstellbar.
 */

export const szenarienRouter = Router();

const speicherSchema = z.object({
  name: z.string().min(1).max(120),
  beschreibung: z.string().optional().nullable(),
  methode: z.string().min(1),
});

async function einstellungenHolen() {
  const e = await prisma.einstellungen.findFirst();
  if (e) return e;
  return prisma.einstellungen.create({ data: {} });
}

// --- Liste ----------------------------------------------------------------

szenarienRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const liste = await prisma.szenario.findMany({
      orderBy: { geaendertAm: 'desc' },
      include: { _count: { select: { projekte: true } } },
    });
    res.json(
      liste.map((s) => ({
        id: s.id,
        name: s.name,
        beschreibung: s.beschreibung,
        methode: s.methode,
        kostenartenAktiv: s.kostenartenAktiv,
        anzahlProjekte: s._count.projekte,
        erstelltAm: s.erstelltAm,
        geaendertAm: s.geaendertAm,
      })),
    );
  }),
);

szenarienRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const s = await prisma.szenario.findUnique({
      where: { id: req.params.id },
      include: { projekte: true },
    });
    if (!s) {
      res.status(404).json({ fehler: 'Szenario nicht gefunden' });
      return;
    }
    res.json(s);
  }),
);

// --- Snapshot vom aktuellen Stand erzeugen --------------------------------

async function snapshotErstellen(payload: { name: string; beschreibung?: string | null; methode: string }) {
  const einstellungen = await einstellungenHolen();
  const projekte = await prisma.projekt.findMany({
    select: {
      id: true,
      fertigstellungGradManuell: true,
      enddatumGeplant: true,
      status: true,
      gesamtkostenGeplant: true,
      auftragssummeNetto: true,
    },
  });
  return prisma.szenario.create({
    data: {
      name: payload.name,
      beschreibung: payload.beschreibung ?? null,
      methode: payload.methode,
      kostenartenAktiv: einstellungen.kostenartenAktiv ?? null,
      projekte: {
        create: projekte.map((p) => ({
          projektId: p.id,
          fertigstellungGradManuell: p.fertigstellungGradManuell,
          enddatumGeplant: p.enddatumGeplant,
          status: p.status,
          gesamtkostenGeplant: Number(p.gesamtkostenGeplant),
          auftragssummeNetto: Number(p.auftragssummeNetto),
        })),
      },
    },
    include: { projekte: true },
  });
}

szenarienRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const daten = parseBody(speicherSchema, req, res);
    if (!daten) return;
    try {
      const neu = await snapshotErstellen(daten);
      res.status(201).json({ id: neu.id, name: neu.name, anzahlProjekte: neu.projekte.length });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('Unique')) {
        res.status(409).json({ fehler: 'Ein Szenario mit diesem Namen existiert bereits.' });
        return;
      }
      throw e;
    }
  }),
);

// --- Bestehendes Szenario mit aktuellem Stand ueberschreiben --------------

szenarienRouter.post(
  '/:id/aktualisieren',
  asyncHandler(async (req, res) => {
    const vorhanden = await prisma.szenario.findUnique({ where: { id: req.params.id } });
    if (!vorhanden) {
      res.status(404).json({ fehler: 'Szenario nicht gefunden' });
      return;
    }
    const methode = String(req.body?.methode ?? vorhanden.methode);
    const einstellungen = await einstellungenHolen();
    const projekte = await prisma.projekt.findMany({
      select: {
        id: true,
        fertigstellungGradManuell: true,
        enddatumGeplant: true,
        status: true,
        gesamtkostenGeplant: true,
        auftragssummeNetto: true,
      },
    });
    await prisma.szenarioProjekt.deleteMany({ where: { szenarioId: vorhanden.id } });
    await prisma.szenario.update({
      where: { id: vorhanden.id },
      data: {
        methode,
        kostenartenAktiv: einstellungen.kostenartenAktiv ?? null,
        projekte: {
          create: projekte.map((p) => ({
            projektId: p.id,
            fertigstellungGradManuell: p.fertigstellungGradManuell,
            enddatumGeplant: p.enddatumGeplant,
            status: p.status,
            gesamtkostenGeplant: Number(p.gesamtkostenGeplant),
            auftragssummeNetto: Number(p.auftragssummeNetto),
          })),
        },
      },
    });
    res.json({ ok: true, anzahlProjekte: projekte.length });
  }),
);

// --- Umbenennen / Beschreibung aendern ------------------------------------

szenarienRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(1).max(120).optional(),
      beschreibung: z.string().optional().nullable(),
    });
    const daten = parseBody(schema, req, res);
    if (!daten) return;
    const s = await prisma.szenario.update({
      where: { id: req.params.id },
      data: { name: daten.name, beschreibung: daten.beschreibung ?? null },
    });
    res.json(s);
  }),
);

// --- Loeschen --------------------------------------------------------------

szenarienRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.szenario.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// --- Anwenden: gespeicherte Werte in Einstellungen + Projekte schreiben ---

szenarienRouter.post(
  '/:id/anwenden',
  asyncHandler(async (req, res) => {
    const s = await prisma.szenario.findUnique({
      where: { id: req.params.id },
      include: { projekte: true },
    });
    if (!s) {
      res.status(404).json({ fehler: 'Szenario nicht gefunden' });
      return;
    }
    const einstellungen = await einstellungenHolen();
    await prisma.einstellungen.update({
      where: { id: einstellungen.id },
      data: {
        standardMethode: s.methode,
        kostenartenAktiv: s.kostenartenAktiv,
      },
    });
    let touched = 0;
    for (const sp of s.projekte) {
      try {
        await prisma.projekt.update({
          where: { id: sp.projektId },
          data: {
            fertigstellungGradManuell: sp.fertigstellungGradManuell,
            enddatumGeplant: sp.enddatumGeplant ?? undefined,
            ...(sp.status ? { status: sp.status } : {}),
            ...(sp.gesamtkostenGeplant != null ? { gesamtkostenGeplant: sp.gesamtkostenGeplant } : {}),
            ...(sp.auftragssummeNetto != null ? { auftragssummeNetto: sp.auftragssummeNetto } : {}),
          },
        });
        touched++;
      } catch {
        // Projekt im aktuellen Datenbestand nicht mehr vorhanden -> ignorieren.
      }
    }
    res.json({ ok: true, projekteAktualisiert: touched, methode: s.methode });
  }),
);
