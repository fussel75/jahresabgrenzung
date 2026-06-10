-- Globaler Kostenarten-Schalter: welche Kostenarten in Ist-Kosten /
-- unfertige Leistungen eingerechnet werden (CSV; null = alle).
ALTER TABLE "Einstellungen" ADD COLUMN "kostenartenAktiv" TEXT;
