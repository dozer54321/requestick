#!/bin/bash
# Requestick — one-shot install on Ubuntu 22.04 / 24.04
# Installs Docker if needed, then starts the premade compose stack.
# Usage (as root or with sudo):
#   ./install.sh requestick.yourcompany.com
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo ./install.sh requestick.yourcompany.com"
  echo "Use a real hostname you own (a subdomain is fine). Login cookies need HTTPS."
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Re-run with sudo so Docker and the firewall can be set up."
  echo "If Docker is already installed and this user can run it:  ./start.sh $DOMAIN"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/docker-compose.yml" ]; then
  echo "Missing docker-compose.yml. Unpack the full Requestick pack first."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl openssl docker.io docker-compose-v2
systemctl enable --now docker

ENV_FILE="$ROOT/mesh.env"
if [ -f "$ENV_FILE" ]; then
  echo "Keeping existing $ENV_FILE (secrets already set)."
else
  umask 077
  cat > "$ENV_FILE" <<EOF
MESH_DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
EOF
  echo "Wrote $ENV_FILE with fresh secrets. Keep this file private."
fi

if grep -q '^MESH_DOMAIN=' "$ENV_FILE"; then
  sed -i "s|^MESH_DOMAIN=.*|MESH_DOMAIN=${DOMAIN}|" "$ENV_FILE"
else
  echo "MESH_DOMAIN=${DOMAIN}" >> "$ENV_FILE"
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

chmod +x "$ROOT/start.sh" "$ROOT/backup.sh" 2>/dev/null || true
"$ROOT/start.sh" "$DOMAIN"
