import 'dotenv/config';
import { prisma } from './db.js';

/**
 * Seed mit realistischen Beispieldaten (SPEC.md §10.6).
 * Mischung Zimmerei/Dachdeckerei/SHK, mit und ohne Abgrenzungsbedarf,
 * Zeitraum Q4/2026 – Q1/2027 (passend zum Geschäftsjahr 2026).
 */

const d = (iso: string) => new Date(`${iso}T00:00:00`);

async function main() {
  // Idempotent: vorhandene Daten leeren (Reihenfolge wegen Relationen).
  await prisma.zahlung.deleteMany();
  await prisma.kostenposition.deleteMany();
  await prisma.projekt.deleteMany();
  await prisma.geschaeftsjahr.deleteMany();
  await prisma.einstellungen.deleteMany();

  // --- Geschäftsjahre ---
  await prisma.geschaeftsjahr.createMany({
    data: [
      { jahr: 2026, beginn: d('2026-01-01'), ende: d('2026-12-31') },
      { jahr: 2027, beginn: d('2027-01-01'), ende: d('2027-12-31') },
    ],
  });

  // --- Einstellungen (Default-Konten = SKR03-Beispiele, Platzhalter) ---
  await prisma.einstellungen.create({
    data: {
      standardMethode: 'COMPLETED_CONTRACT',
      steuerberaterName: 'Steuerkanzlei Mustermann & Partner',
      steuerberaterAdresse: 'Hauptstraße 12, 49074 Osnabrück',
      steuerberaterEmail: 'kanzlei@mustermann-stb.de',
      kontoUnfertigeLeistung: '0860',
      kontoBestandsveraend: '8990',
    },
  });

  // --- Projekte ---
  // 1) Zimmerei — über Jahreswechsel (abzugrenzen)
  await prisma.projekt.create({
    data: {
      projektnummer: '2026-101',
      bezeichnung: 'Dachstuhl Neubau Einfamilienhaus',
      kunde: 'Bauherr Familie Brinkmann',
      kundenadresse: 'Lindenweg 8, 49477 Ibbenbüren',
      startdatumGeplant: d('2026-11-03'),
      enddatumGeplant: d('2027-02-20'),
      auftragssummeNetto: 84000,
      gesamtkostenGeplant: 61000,
      istKostenStichtag: 23500,
      status: 'LAUFEND',
      gewerk: 'ZIMMEREI',
      kostenpositionen: {
        create: [
          { datum: d('2026-11-10'), betragNetto: 14500, art: 'MATERIAL', beschreibung: 'Konstruktionsvollholz' },
          { datum: d('2026-12-05'), betragNetto: 9000, art: 'LOHN', beschreibung: 'Abbund + Montage' },
        ],
      },
      zahlungen: {
        create: [
          { datum: d('2026-11-15'), betragNetto: 25000, art: 'ANZAHLUNG', rechnungsNr: 'AZ-2026-101' },
        ],
      },
    },
  });

  // 2) Dachdeckerei — über Jahreswechsel, mit Abschlägen (abzugrenzen)
  await prisma.projekt.create({
    data: {
      projektnummer: '2026-102',
      bezeichnung: 'Dachsanierung Mehrfamilienhaus',
      kunde: 'Hausverwaltung Nordwest GmbH',
      kundenadresse: 'Bramscher Str. 200, 49088 Osnabrück',
      startdatumGeplant: d('2026-10-12'),
      enddatumGeplant: d('2027-03-15'),
      auftragssummeNetto: 152000,
      gesamtkostenGeplant: 110000,
      istKostenStichtag: 48000,
      status: 'LAUFEND',
      gewerk: 'DACHDECKEREI',
      zahlungen: {
        create: [
          { datum: d('2026-10-20'), betragNetto: 40000, art: 'ANZAHLUNG', rechnungsNr: 'AZ-2026-102' },
          { datum: d('2026-12-15'), betragNetto: 30000, art: 'ABSCHLAG', rechnungsNr: 'AB1-2026-102' },
        ],
      },
    },
  });

  // 3) SHK — komplett im Stichjahr 2026 (kein Abgrenzungsbedarf)
  await prisma.projekt.create({
    data: {
      projektnummer: '2026-103',
      bezeichnung: 'Heizungstausch Wärmepumpe',
      kunde: 'Eheleute Voss',
      startdatumGeplant: d('2026-09-01'),
      enddatumGeplant: d('2026-11-28'),
      enddatumIst: d('2026-11-25'),
      auftragssummeNetto: 28500,
      gesamtkostenGeplant: 19000,
      istKostenStichtag: 18800,
      status: 'ABGESCHLOSSEN',
      gewerk: 'SHK',
    },
  });

  // 4) Gemischt — großes Projekt über Jahreswechsel (abzugrenzen)
  await prisma.projekt.create({
    data: {
      projektnummer: '2026-104',
      bezeichnung: 'Aufstockung + Dachausbau Bürogebäude',
      kunde: 'Tischlerei Kröger e.K.',
      startdatumGeplant: d('2026-12-01'),
      enddatumGeplant: d('2027-04-30'),
      auftragssummeNetto: 210000,
      gesamtkostenGeplant: 158000,
      istKostenStichtag: 22000,
      status: 'LAUFEND',
      gewerk: 'GEMISCHT',
      zahlungen: {
        create: [
          { datum: d('2026-12-10'), betragNetto: 50000, art: 'ANZAHLUNG', rechnungsNr: 'AZ-2026-104' },
        ],
      },
    },
  });

  // 5) Zimmerei — komplett im Folgejahr 2027 (kein Abgrenzungsbedarf)
  await prisma.projekt.create({
    data: {
      projektnummer: '2027-001',
      bezeichnung: 'Carport mit Geräteschuppen',
      kunde: 'Herr Dr. Lindemann',
      startdatumGeplant: d('2027-02-10'),
      enddatumGeplant: d('2027-04-05'),
      auftragssummeNetto: 19500,
      gesamtkostenGeplant: 12500,
      istKostenStichtag: 0,
      status: 'BEAUFTRAGT',
      gewerk: 'ZIMMEREI',
    },
  });

  // 6) Dachdeckerei — über Jahreswechsel, manueller Fertigstellungsgrad
  await prisma.projekt.create({
    data: {
      projektnummer: '2026-105',
      bezeichnung: 'Flachdachabdichtung Lagerhalle',
      kunde: 'Spedition Hessmann GmbH & Co. KG',
      startdatumGeplant: d('2026-11-20'),
      enddatumGeplant: d('2027-01-31'),
      auftragssummeNetto: 67000,
      gesamtkostenGeplant: 49000,
      istKostenStichtag: 31000,
      fertigstellungGradManuell: 0.65,
      status: 'LAUFEND',
      gewerk: 'DACHDECKEREI',
    },
  });

  // 7) SHK — geplant über Jahreswechsel, Ist-Fertigstellung noch in 2026
  await prisma.projekt.create({
    data: {
      projektnummer: '2026-106',
      bezeichnung: 'Bäder-Modernisierung Wohnanlage',
      kunde: 'Wohnungsgenossenschaft Emsland eG',
      startdatumGeplant: d('2026-10-01'),
      enddatumGeplant: d('2027-01-20'),
      enddatumIst: d('2026-12-18'),
      auftragssummeNetto: 73000,
      gesamtkostenGeplant: 52000,
      istKostenStichtag: 51000,
      status: 'ABGESCHLOSSEN',
      gewerk: 'SHK',
    },
  });

  // 8) Zimmerei — STORNIERT (wird aus der Abgrenzung ausgeschlossen)
  await prisma.projekt.create({
    data: {
      projektnummer: '2026-107',
      bezeichnung: 'Gartenpavillon (storniert)',
      kunde: 'Frau Albers',
      startdatumGeplant: d('2026-11-01'),
      enddatumGeplant: d('2027-02-01'),
      auftragssummeNetto: 16000,
      gesamtkostenGeplant: 11000,
      istKostenStichtag: 1500,
      status: 'STORNIERT',
      gewerk: 'ZIMMEREI',
    },
  });

  // 9) Dachdeckerei — über Jahreswechsel, frühe Phase (abzugrenzen)
  await prisma.projekt.create({
    data: {
      projektnummer: '2026-108',
      bezeichnung: 'Gaubeneinbau + Dachfenster',
      kunde: 'Familie Schulte-Hofmann',
      startdatumGeplant: d('2026-12-15'),
      enddatumGeplant: d('2027-03-10'),
      auftragssummeNetto: 41000,
      gesamtkostenGeplant: 29000,
      istKostenStichtag: 4200,
      status: 'LAUFEND',
      gewerk: 'DACHDECKEREI',
    },
  });

  const anzahl = await prisma.projekt.count();
  // eslint-disable-next-line no-console
  console.log(`Seed abgeschlossen: ${anzahl} Projekte, 2 Geschäftsjahre, Einstellungen angelegt.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
