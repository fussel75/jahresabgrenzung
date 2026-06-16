-- Rechnungsnummer an Kostenposition (zum Nachschlagen im HAPAK)
ALTER TABLE "Kostenposition" ADD COLUMN "rechnungsNr" TEXT;

-- Szenarien: gespeicherte Snapshots fuer Methodenwahl, Kostenarten,
-- pro Projekt fertigstellungGradManuell + enddatumGeplant.
CREATE TABLE "Szenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "beschreibung" TEXT,
    "methode" TEXT NOT NULL,
    "kostenartenAktiv" TEXT,
    "erstelltAm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Szenario_name_key" ON "Szenario"("name");

CREATE TABLE "SzenarioProjekt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "szenarioId" TEXT NOT NULL,
    "projektId" TEXT NOT NULL,
    "fertigstellungGradManuell" REAL,
    "enddatumGeplant" DATETIME,
    CONSTRAINT "SzenarioProjekt_szenarioId_fkey" FOREIGN KEY ("szenarioId") REFERENCES "Szenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SzenarioProjekt_projektId_fkey" FOREIGN KEY ("projektId") REFERENCES "Projekt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SzenarioProjekt_szenarioId_projektId_key" ON "SzenarioProjekt"("szenarioId", "projektId");
