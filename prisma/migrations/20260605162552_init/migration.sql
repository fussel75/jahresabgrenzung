-- CreateTable
CREATE TABLE "Projekt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projektnummer" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "kunde" TEXT NOT NULL,
    "kundenadresse" TEXT,
    "startdatumGeplant" DATETIME NOT NULL,
    "enddatumGeplant" DATETIME NOT NULL,
    "startdatumIst" DATETIME,
    "enddatumIst" DATETIME,
    "auftragssummeNetto" DECIMAL NOT NULL,
    "gesamtkostenGeplant" DECIMAL NOT NULL,
    "istKostenStichtag" DECIMAL NOT NULL DEFAULT 0,
    "fertigstellungGradManuell" REAL,
    "status" TEXT NOT NULL,
    "gewerk" TEXT NOT NULL,
    "notizen" TEXT,
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Zahlung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projektId" TEXT NOT NULL,
    "datum" DATETIME NOT NULL,
    "betragNetto" DECIMAL NOT NULL,
    "art" TEXT NOT NULL,
    "rechnungsNr" TEXT,
    "beschreibung" TEXT,
    CONSTRAINT "Zahlung_projektId_fkey" FOREIGN KEY ("projektId") REFERENCES "Projekt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Kostenposition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projektId" TEXT NOT NULL,
    "datum" DATETIME NOT NULL,
    "betragNetto" DECIMAL NOT NULL,
    "art" TEXT NOT NULL,
    "beschreibung" TEXT,
    CONSTRAINT "Kostenposition_projektId_fkey" FOREIGN KEY ("projektId") REFERENCES "Projekt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Geschaeftsjahr" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jahr" INTEGER NOT NULL,
    "beginn" DATETIME NOT NULL,
    "ende" DATETIME NOT NULL,
    "abgeschlossen" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Einstellungen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "standardMethode" TEXT NOT NULL DEFAULT 'COMPLETED_CONTRACT',
    "steuerberaterName" TEXT,
    "steuerberaterAdresse" TEXT,
    "steuerberaterEmail" TEXT,
    "kontoUnfertigeLeistung" TEXT,
    "kontoBestandsveraend" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Projekt_projektnummer_key" ON "Projekt"("projektnummer");

-- CreateIndex
CREATE UNIQUE INDEX "Geschaeftsjahr_jahr_key" ON "Geschaeftsjahr"("jahr");
