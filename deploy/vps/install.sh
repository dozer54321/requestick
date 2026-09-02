#!/bin/bash
# Requestick — one-shot install on Ubuntu 22.04 / 24.04
# Usage:
#   sudo ./install requestick.yourcompany.com
#   sudo ./install.sh requestick.yourcompany.com
# If you omit the hostname, it will ask.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Need sudo so Docker can be installed. Re-running with sudo..."
  exec sudo -E "$0" "$@"
fi

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  if [ -t 0 ] || [ -e /dev/tty ]; then
    read -r -p "Hostname (example: requestick.yourcompany.com): " DOMAIN < /dev/tty
  fi
fi
DOMAIN="$(echo "$DOMAIN" | tr -d '[:space:]')"
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo ./install requestick.yourcompany.com"
  echo "Use a real hostname you own (a subdomain is fine). Login needs HTTPS, not a bare IP."
  exit 1
fi
if echo "$DOMAIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Use a real hostname you own. Login will not work on a bare IP."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/docker-compose.yml" ]; then
  echo "Missing docker-compose.yml. Unpack the full Requestick pack first, then run ./install from that folder."
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

chmod +x "$ROOT/start.sh" "$ROOT/backup.sh" "$ROOT/install.sh" 2>/dev/null || true
chmod +x "$ROOT/install" 2>/dev/null || true
"$ROOT/start.sh" "$DOMAIN"
