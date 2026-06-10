# syntax=docker/dockerfile:1

# ----------------------------------------------------------------------------
# Build-Stage: installiert Abhängigkeiten und baut shared + web + api.
# ----------------------------------------------------------------------------
FROM node:20-bookworm AS build
WORKDIR /app

# Dummy-URL nur für den Build (prisma generate erwartet die Variable).
# Zur Laufzeit wird DATABASE_URL über docker-compose gesetzt.
ENV DATABASE_URL="file:/tmp/build.db"

# Nur die Manifeste kopieren -> bessere Layer-Caches bei npm ci.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# Prisma-Schema vor npm ci, damit der @prisma/client-Postinstall generieren kann.
COPY prisma ./prisma

RUN npm ci

# Restliche Quellen kopieren und alles bauen.
COPY . .
RUN npx prisma generate \
 && npm run build --workspace @jahresabgrenzung/shared \
 && npm run build --workspace @jahresabgrenzung/web \
 && npm run build --workspace @jahresabgrenzung/api

# ----------------------------------------------------------------------------
# Runtime-Stage: schlankes Image, führt Migrationen aus und startet die API.
# Die API liefert auch das gebaute Frontend (apps/web/dist) aus.
# ----------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Hamburg/Deutschland: Mitteleuropäische Zeit inkl. Sommer-/Winterzeit.
# Wichtig, weil Stichtage (31.12. 23:59) und der "Heute"-Marker sonst
# in UTC laufen und an Tagesgrenzen falsch landen.
ENV TZ=Europe/Berlin

# OpenSSL (Prisma) und tzdata (Zeitzonen-Daten) installieren.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && ln -snf /usr/share/zoneinfo/Europe/Berlin /etc/localtime \
 && echo "Europe/Berlin" > /etc/timezone \
 && rm -rf /var/lib/apt/lists/*

# Komplettes, bereits gebautes App-Verzeichnis übernehmen (inkl. node_modules,
# generiertem Prisma-Client und dist-Ausgaben). Einfach und zuverlässig.
COPY --from=build /app ./

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
