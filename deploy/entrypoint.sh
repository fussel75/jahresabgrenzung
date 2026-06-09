#!/bin/sh
set -e

echo "[entrypoint] Wende Datenbank-Migrationen an ..."
npx prisma migrate deploy

# Optional: nur bei ausdrücklichem Wunsch Beispieldaten laden.
# ACHTUNG: Das Seed-Skript LEERT vorhandene Daten! Daher standardmäßig aus.
if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] SEED_ON_START=true -> lade Beispieldaten (löscht vorhandene Daten!) ..."
  node apps/api/dist/seed.js || echo "[entrypoint] Seed übersprungen/fehlgeschlagen."
fi

echo "[entrypoint] Starte API ..."
exec node apps/api/dist/index.js
