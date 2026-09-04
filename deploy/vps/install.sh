#!/bin/bash
# Requestick — one-shot install on Ubuntu 22.04 / 24.04
# Usage:
#   sudo ./install
#   sudo ./install.sh
# Optional: pass the domain as the first argument. If omitted, it asks.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Need sudo so Docker can be installed. Re-running with sudo..."
  exec sudo -E "$0" "$@"
fi

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

ask_domain() {
  local current="$1"
  local passed="$2"
  local input=""
  if [ -n "$passed" ]; then
    input="$passed"
  elif [ -e /dev/tty ]; then
    if [ -n "$current" ]; then
      printf "Domain or subdomain [%s]: " "$current" > /dev/tty
    else
      printf "Domain or subdomain (example: tickets.yourshop.com): " > /dev/tty
    fi
    IFS= read -r input < /dev/tty || true
  fi
  normalize_domain "${input:-$current}"
}

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

EXISTING=""
if [ -f "$ROOT/mesh.env" ]; then
  EXISTING="$(grep -E '^MESH_DOMAIN=' "$ROOT/mesh.env" | tail -n1 | cut -d= -f2- | tr -d "\"'")"
  EXISTING="$(normalize_domain "$EXISTING")"
fi

DOMAIN="$(ask_domain "$EXISTING" "${1:-}")"
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
echo "Installing for $DOMAIN"

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
