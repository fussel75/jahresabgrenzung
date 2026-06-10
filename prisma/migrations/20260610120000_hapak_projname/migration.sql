-- HAPAK-Projekt-Schlüssel (intern), damit erneuter Import idempotent ist.
ALTER TABLE "Projekt" ADD COLUMN "hapakProjname" TEXT;
CREATE UNIQUE INDEX "Projekt_hapakProjname_key" ON "Projekt"("hapakProjname");
