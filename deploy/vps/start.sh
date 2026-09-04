#!/bin/bash
# Requestick — start the premade Docker stack (Docker already installed).
# Usage: ./start.sh
# Optional: pass the domain as the first argument. If omitted, it asks.
set -euo pipefail

normalize_domain() {
  local d
  d="$(printf '%s' "$1" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
  d="${d#http://}"
  d="${d#https://}"
  d="${d%%/*}"
  d="${d%%:*}"
  d="${d%.}"
  printf '%s' "$d"
}

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

EXISTING=""
if [ -f "$ROOT/mesh.env" ]; then
  EXISTING="$(grep -E '^MESH_DOMAIN=' "$ROOT/mesh.env" | tail -n1 | cut -d= -f2- | tr -d "\"'")"
  EXISTING="$(normalize_domain "$EXISTING")"
fi

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  if [ -e /dev/tty ]; then
    if [ -n "$EXISTING" ]; then
      printf "Domain or subdomain [%s]: " "$EXISTING" > /dev/tty
    else
      printf "Domain or subdomain (example: tickets.yourshop.com): " > /dev/tty
    fi
    IFS= read -r DOMAIN < /dev/tty || true
  fi
  DOMAIN="$(normalize_domain "${DOMAIN:-$EXISTING}")"
else
  DOMAIN="$(normalize_domain "$DOMAIN")"
fi

if [ -z "$DOMAIN" ]; then
  echo "A domain or subdomain is required. Login needs HTTPS, not a bare IP."
  exit 1
fi
if echo "$DOMAIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Use a hostname, not an IP."
  exit 1
fi
if ! echo "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'; then
  echo "That does not look like a domain or subdomain."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. On Ubuntu, run:  sudo ./install.sh"
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

if [ -f "$ROOT/VERSION" ] && ! grep -q '^REQUESTICK_VERSION=' "$ENV_FILE"; then
  echo "REQUESTICK_VERSION=$(tr -d '[:space:]' < "$ROOT/VERSION")" >> "$ENV_FILE"
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
