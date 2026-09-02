# Requestick

Company-only sales board for FFL inside sales. Post a part on an open dealer
ticket, ping the desk, call Ring Central or text a cell. Admins approve logins,
set the shop look, and can read open tickets from Business Central.

Nothing is hosted on Grok. You run one copy on a machine you control.

## Best use

| Who | What they do |
|---|---|
| **One server** | Cheap Ubuntu VPS (preferred) or a Windows box with Docker. This is the only install. |
| **Sales PCs** | Chrome or Edge. No installer, no VPN, no Windows admin rights. Pin the tab. |
| **Admin** | First person through Sign in + desk card. Adds people, hide/remove requests, Look, Central. |
| **IT** | Domain + DNS A record, then Docker. Entra app if you want BC. |

Do **not** put this on each salesperson’s PC. Do **not** use cPanel / PHP shared
hosting. Do **not** put two shops on one install — tickets and cell numbers mix.

Daily: post a request, **On it** / **Filled**, Call or Text from the card. Leave
the tab open for Windows alerts. Admins **Hide** a request off the board, or
**Remove** it for good under the Hidden filter.

Business Central is **read-only** (`API.Read.All` only). Requestick never writes
back to BC.

## Install on an Ubuntu VPS (one paste)

Point DNS first: A record `requestick.yourcompany.com` → this server’s IP.
Login needs a real hostname, not a bare IP.

Make a GitHub token that can read this private repo:
[github.com/settings/tokens](https://github.com/settings/tokens)
(classic: `repo`, or fine-grained: this repo, **Contents: Read**).

SSH into the VPS and paste this **one** block. It asks for the token and the
hostname, then downloads and installs.

```bash
sudo bash <<'EOF'
set -euo pipefail
apt-get update -y
apt-get install -y curl ca-certificates python3
read -s -p "GitHub token: " GH_TOKEN < /dev/tty; echo
read -p "Hostname (example: requestick.yourcompany.com): " HOST < /dev/tty
HOST="$(echo "$HOST" | tr -d '[:space:]')"
if [ -z "$HOST" ]; then echo "Need a hostname."; exit 1; fi
ASSET=$(curl -fsSL \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/dozer54321/requestick/releases/latest \
  | python3 -c "import sys,json; a=[x for x in json.load(sys.stdin)['assets'] if x['name']=='requestick-linux-setup.sh']; print(a[0]['url'] if a else '')")
if [ -z "$ASSET" ]; then echo "Download failed. Check the token."; exit 1; fi
curl -fL --progress-bar \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/octet-stream" \
  -o /tmp/requestick-install "$ASSET"
unset GH_TOKEN
chmod +x /tmp/requestick-install
bash /tmp/requestick-install "$HOST"
EOF
```

Wait about a minute, then open `https://your-hostname`. First person through
Sign in + desk card is the admin.

If you already downloaded the pack from Releases:

```bash
tar -xzf requestick-linux.tar.gz
cd requestick-linux
sudo ./install requestick.yourcompany.com
```

`./install` asks for the hostname if you leave it off, and uses sudo if needed.

## After install

1. Sign in and fill your desk card (name, Ring Central ext, cell).
2. **Admin → People** — add accounts or approve requests.
3. **Admin → Look** — company name, mark, colors.
4. **Admin → Central** — optional BC, read-only.

Backup: `sudo /opt/requestick/backup.sh`

Keep `mesh.env`. That file is the database password and sign-in secret. Never
commit it. Never delete the Docker volume (`mesh_pgdata`).

## Premade Docker (if the files are already on the machine)

The app is a three-container stack: **Postgres** + **Requestick** + **Caddy**
(HTTPS). You do not install Node or Postgres yourself.

```bash
tar -xzf requestick-docker.tar.gz
cd requestick-docker
chmod +x start.sh backup.sh
./start.sh requestick.yourcompany.com
```

Windows (Docker Desktop running):

```powershell
.\start.ps1 requestick.yourcompany.com
```

Drop `requestick-image.tar.gz` next to `docker-compose.yml` and start will
**load** it instead of building.

## What you buy

1. Ubuntu 24.04 VPS, 2 GB RAM+ (Hetzner CX22 is enough) **or** a Windows 10/11 /
   Server box with Docker Desktop and admin rights.
2. A cheap domain (~$10/year). A subdomain is enough:
   `requestick.yourcompany.com`.

## GitHub

This repo is **private**. Sales never clone it — they only open the shop URL.

Releases (Actions, on a `v*` tag) attach:

- `requestick-linux-setup.sh` — one-file installer (what the paste above uses)
- `requestick-linux.tar.gz` — same pack as a folder (`sudo ./install`)
- `requestick-docker.tar.gz` / `requestick-image.tar.gz`
- `requestick-windows.zip`
- `requestick-source.tar.gz`

To cut a new pack: `git tag v1.0.2 && git push origin v1.0.2`

## Windows installer (server only)

This is for **one** Windows machine that will host Requestick — not the sales
desks. It needs Administrator and [Docker Desktop](https://www.docker.com/products/docker-desktop/).

1. Extract `requestick-windows.zip`
2. Open **START HERE.txt**
3. Right-click `install.bat` → **Run as administrator**
4. When prompted, enter `requestick.yourcompany.com`
