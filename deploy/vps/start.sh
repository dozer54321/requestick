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

set_env_key() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

host_caddy_available() {
  if ! command -v caddy >/dev/null 2>&1; then
    return 1
  fi
  # Our bundled Caddy lives in a container and is not on the host PATH.
  if [ -x /usr/bin/caddy ] || [ -x /usr/local/bin/caddy ]; then
    return 0
  fi
  if systemctl list-unit-files --type=service 2>/dev/null | grep -q '^caddy\.service'; then
    return 0
  fi
  return 0
}

pick_app_port() {
  local port=3000
  if command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null | grep -qE ':3000\s'; then
    if docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep mesh-app | grep -q '3000'; then
      echo 3000
      return
    fi
    port=3010
  fi
  echo "$port"
}

write_host_caddy_site() {
  local domain="$1"
  local port="$2"
  local cfg="/etc/caddy/Caddyfile"
  if [ "$(id -u)" -ne 0 ]; then
    echo "Need sudo to add ${domain} to the host Caddyfile at ${cfg}."
    return 1
  fi
  mkdir -p /etc/caddy
  if [ ! -f "$cfg" ]; then
    printf '%s\n' "# Caddyfile" > "$cfg"
  fi
  local tmp
  tmp="$(mktemp)"
  awk '
    BEGIN { skip=0 }
    /^# begin-requestick$/ { skip=1; next }
    /^# end-requestick$/ { skip=0; next }
    skip==0 { print }
  ' "$cfg" > "$tmp"
  printf '\n# begin-requestick\n%s {\n\tencode gzip\n\treverse_proxy 127.0.0.1:%s\n}\n# end-requestick\n' "$domain" "$port" >> "$tmp"
  mv "$tmp" "$cfg"
  if command -v caddy >/dev/null 2>&1; then
    if ! caddy validate --config "$cfg" >/dev/null 2>&1; then
      echo "Host Caddyfile did not validate after adding ${domain}."
      caddy validate --config "$cfg" || true
      return 1
    fi
  fi
  if systemctl list-unit-files --type=service 2>/dev/null | grep -q '^caddy\.service'; then
    systemctl enable --now caddy
    systemctl reload caddy || systemctl restart caddy
  else
    caddy reload --config "$cfg" 2>/dev/null || caddy start --config "$cfg"
  fi
}

PROXY="container"
APP_PORT="3000"
if host_caddy_available; then
  APP_PORT="$(pick_app_port)"
  echo "Found Caddy on this machine. Adding ${DOMAIN} to the host Caddyfile."
  if write_host_caddy_site "$DOMAIN" "$APP_PORT"; then
    PROXY="host"
  else
    echo "Could not piggyback on host Caddy. Running Caddy in Docker instead."
    APP_PORT="3000"
  fi
else
  echo "No host Caddy found. Running Caddy in Docker."
fi
set_env_key MESH_PROXY "$PROXY"
set_env_key REQUESTICK_APP_PORT "$APP_PORT"

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

COMPOSE=(docker compose --env-file "$ENV_FILE" -p mesh)
if [ "$PROXY" = host ] && [ -f "$ROOT/docker-compose.host-caddy.yml" ]; then
  COMPOSE+=(-f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.host-caddy.yml")
  docker rm -f mesh-caddy-1 >/dev/null 2>&1 || true
fi

if [ "$IMAGE_OK" -eq 1 ]; then
  "${COMPOSE[@]}" up -d
else
  echo "No prebuilt image yet — building the Requestick container (app is already compiled)."
  "${COMPOSE[@]}" up -d --build
fi

echo
echo "Requestick is starting."
echo "1. Point ${DOMAIN} at this machine (A record -> public IP)."
if [ "$PROXY" = host ]; then
  echo "2. HTTPS is served by the Caddy already on this machine (${DOMAIN} → 127.0.0.1:${APP_PORT})."
else
  echo "2. Wait a minute for HTTPS from the Caddy container."
fi
echo "3. Open https://${DOMAIN} — first sign-in + desk card is the owner."
echoecho "Logs:     docker compose --env-file mesh.env logs -f app"
echo "Stop:     docker compose --env-file mesh.env down"
echo "Backup:   ./backup.sh"
