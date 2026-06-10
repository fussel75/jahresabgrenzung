#!/bin/sh
# Manuelles Update der Jahresabgrenzung-App in EINEM Befehl.
# Auf dem VPS im Terminal aufrufen:
#   curl -fsSL https://raw.githubusercontent.com/fussel75/jahresabgrenzung/main/deploy/update.sh | sh
set -e

IMAGE="ghcr.io/fussel75/jahresabgrenzung:latest"
PROJECT="jahresabgrenzung"

echo "[1/3] Neue Version ziehen: $IMAGE"
docker pull "$IMAGE"

echo "[2/3] Laufenden Container suchen (Projekt: $PROJECT) ..."
CONTAINER=$(docker ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Names}}' | head -1)
if [ -z "$CONTAINER" ]; then
  CONTAINER=$(docker ps --format '{{.Names}}' | grep -E "^${PROJECT}-" | head -1)
fi

if [ -z "$CONTAINER" ]; then
  echo "Kein laufender Container gefunden. Bitte einmal im Docker Manager"
  echo "auf 'Bereitstellen' klicken — dieser Befehl funktioniert ab dem nächsten Mal."
  exit 0
fi

echo "[3/3] Container neu erstellen: $CONTAINER"
WORKDIR=$(docker inspect "$CONTAINER" --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}')
if [ -z "$WORKDIR" ] || [ ! -d "$WORKDIR" ]; then
  echo "Compose-Projektpfad nicht gefunden — bitte einmalig im Docker Manager"
  echo "auf 'Bereitstellen' klicken (zieht das schon heruntergeladene Image)."
  exit 0
fi

cd "$WORKDIR"
docker compose up -d
docker image prune -f >/dev/null 2>&1 || true

echo ""
echo "Fertig. Status:"
docker ps --filter "name=$CONTAINER" --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
