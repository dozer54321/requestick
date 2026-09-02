# Requestick

Company-only sales board for FFL inside sales. Post a part on an open dealer
ticket, ping the desk, call Ring Central or text a cell. Admins approve logins,
set the shop look, and can read open tickets from Business Central.

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

## Premade Docker (the install)

The app is a three-container stack: **Postgres** + **Requestick** + **Caddy**
(HTTPS). You do not install Node or Postgres yourself.

Need: Docker already on the machine, and a hostname such as
`requestick.yourcompany.com` (login will not work on a bare IP).

```bash
tar -xzf requestick-docker.tar.gz
cd requestick-docker
chmod +x start.sh backup.sh
./start.sh requestick.yourcompany.com
```

Windows (Docker Desktop running):

```powershell
# extract requestick-docker.tar.gz, then:
.\start.ps1 requestick.yourcompany.com
```

First person through Sign in + desk card is the admin.

A GitHub Release can also attach `requestick-image.tar.gz`. Drop that file next
to `docker-compose.yml` and start will **load** it instead of building.

## What you buy

1. Ubuntu 24.04 VPS, 2 GB RAM+ (Hetzner CX22 is enough) **or** a Windows 10/11 /
   Server box with Docker Desktop and admin rights.
2. A cheap domain (~$10/year). A subdomain is enough:
   `requestick.yourcompany.com`. Login needs a real name and HTTPS, not a bare IP.

No Docker yet? On Ubuntu the full installer installs it for you:

```bash
sudo bash requestick-linux-setup.sh requestick.yourcompany.com
```

## GitHub (optional, recommended)

You do **not** need GitHub to install. Use it to keep the source private and to
publish new installer packs **and** the Requestick image.

1. Create a **private** repo named `requestick`.
2. Push the source pack (`requestick-source.tar.gz`) — steps in `GITHUB.txt`.
3. Tag `v1.0.0` and push the tag. GitHub Actions builds the packs, the Docker
   image, and pushes `ghcr.io/YOURORG/requestick:v1.0.0`.

Then a shop can set in `mesh.env`:

```text
REQUESTICK_IMAGE=ghcr.io/YOURORG/requestick:v1.0.0
```

and `docker compose up -d` with no local build.

Sales never clones GitHub. They only open the shop URL.

Rebuild packs on a machine with Node 22 (and Docker, for the image):

```text
npm ci
npm run pack:installers
```

That writes:

- `artifacts/requestick-docker.tar.gz` — premade compose stack
- `artifacts/requestick-image.tar.gz` — prebuilt app image (when Docker is present)
- `artifacts/requestick-linux-setup.sh` — one-file Linux installer
- `artifacts/requestick-linux.tar.gz`
- `artifacts/requestick-windows.tar.gz` and `.zip`
- `artifacts/requestick-source.tar.gz`

## Linux installer (no Docker yet)

**One file:**

```bash
sudo bash requestick-linux-setup.sh requestick.yourcompany.com
```

That drops the app in `/opt/requestick`, installs Docker, and starts the stack.

## Windows installer (server only)

This is for **one** Windows machine that will host Requestick — not the sales
desks. It needs Administrator and [Docker Desktop](https://www.docker.com/products/docker-desktop/).

1. Extract `requestick-windows.zip`
2. Open **START HERE.txt**
3. Right-click `install.bat` → **Run as administrator**
4. When prompted, enter `requestick.yourcompany.com`

If IIS is using the web ports, the installer will offer to stop it. If Docker
Desktop is already running, `.\start.ps1 your.hostname` is enough.

## After install

1. Sign in and fill your desk card (name, Ring Central ext, cell).
2. **Admin → People** — add accounts or approve requests.
3. **Admin → Look** — company name, mark, colors.
4. **Admin → Central** — optional BC, read-only.

Backup (Linux): `sudo ./backup.sh`
Backup (Windows): `.\backup.ps1`

Keep `mesh.env`. That file is the database password and sign-in secret. Never
commit it. Never delete the Docker volume (`mesh_pgdata`).
