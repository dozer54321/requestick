#!/bin/bash
# Requestick — start the premade Docker stack (Docker already installed).
# Usage: ./start.sh requestick.yourcompany.com
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: ./start.sh requestick.yourcompany.com"
  echo "Use a real hostname you own (a subdomain is fine). Login needs HTTPS."
  exit 1
fi
if echo "$DOMAIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Use a real hostname you own. Login will not work on a bare IP."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. On Ubuntu, run:  sudo ./install.sh $DOMAIN"
  echo "Or install Docker Desktop, then re-run this script."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running, or this user cannot talk to it."
  echo "Start Docker, or re-run with sudo."
  exit 1
fi

ENV_FILE="$ROOT/mesh.env"
if [ -f "$ENV_FILE" ]; then
  echo "Keeping existing mesh.env (secrets already set)."
else
  umask 077
  cat > "$ENV_FILE" <<EOF
MESH_DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(24))")
BETTER_AUTH_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
EOF
  echo "Wrote mesh.env with fresh secrets. Keep this file private."
fi

if grep -q '^MESH_DOMAIN=' "$ENV_FILE"; then
  sed -i.bak "s|^MESH_DOMAIN=.*|MESH_DOMAIN=${DOMAIN}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
else
  echo "MESH_DOMAIN=${DOMAIN}" >> "$ENV_FILE"
fi

load_image() {
  local f
  for f in "$ROOT/requestick-image.tar.gz" "$ROOT/../requestick-image.tar.gz"; do
    if [ -f "$f" ]; then
      echo "Loading prebuilt Requestick image..."
      docker load -i "$f"
      return 0
    fi
  done
  return 1
}

IMAGE_OK=0
if docker image inspect requestick:local >/dev/null 2>&1; then
  IMAGE_OK=1
elif load_image; then
  IMAGE_OK=1
fi

if [ "$IMAGE_OK" -eq 1 ]; then
  docker compose --env-file "$ENV_FILE" up -d
else
  echo "No prebuilt image yet — building the Requestick container (app is already compiled)."
  docker compose --env-file "$ENV_FILE" up -d --build
fi

echo
echo "Requestick is starting."
echo "1. Point ${DOMAIN} at this machine (A record -> public IP)."
echo "2. Wait a minute for HTTPS, then open https://${DOMAIN}"
echo "3. First person to sign in and fill their station card is the admin."
echo
echo "Logs:     docker compose --env-file mesh.env logs -f app"
echo "Stop:     docker compose --env-file mesh.env down"
echo "Backup:   ./backup.sh"
