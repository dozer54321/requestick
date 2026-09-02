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

## Copy/paste on an Ubuntu VPS

SSH into the VPS (or use the host’s web console). Point DNS **before** you
install: A record `requestick.yourcompany.com` → this server’s public IP.
Login needs a real hostname and HTTPS, not a bare IP.

Need: Ubuntu 22.04 or 24.04, 2 GB RAM+, and a GitHub token that can **read**
this private repo. Create one at
[github.com/settings/tokens](https://github.com/settings/tokens)
(classic: `repo`; or fine-grained: this repo, **Contents: Read**).

### 1. Download

Paste this whole block. It asks for the token (hidden) and saves
`requestick-linux.tar.gz` in the current folder.

```bash
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates python3
read -s -p "GitHub token: " GH_TOKEN; echo
ASSET=$(curl -fsSL \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/dozer54321/requestick/releases/latest \
  | python3 -c "import sys,json; a=[x for x in json.load(sys.stdin)['assets'] if x['name']=='requestick-linux.tar.gz']; print(a[0]['url'] if a else '')")
if [ -z "$ASSET" ]; then echo "Download failed. Check the token and that a release exists."; exit 1; fi
curl -fL --progress-bar \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/octet-stream" \
  -o requestick-linux.tar.gz "$ASSET"
unset GH_TOKEN
ls -lh requestick-linux.tar.gz
```

Wait until `ls` prints a size (about 1–2 MB). Then go to step 2. The token is
only used for this download — it is not stored on the server.

Already have the file from the Releases page? Skip this step and put
`requestick-linux.tar.gz` in the folder you will run step 2 from.

### 2. Install

Change the hostname on the last line, then paste:

```bash
sudo mkdir -p /opt/requestick
sudo tar -xzf requestick-linux.tar.gz -C /opt/requestick --strip-components=1
cd /opt/requestick
sudo chmod +x install.sh start.sh backup.sh
sudo ./install.sh requestick.yourcompany.com
```

That installs Docker if needed, writes secrets into `/opt/requestick/mesh.env`,
and starts the stack. Wait a minute, then open `https://requestick.yourcompany.com`.
First person through Sign in + desk card is the admin.

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
# extract requestick-docker.tar.gz, then:
.\start.ps1 requestick.yourcompany.com
```

A GitHub Release can also attach `requestick-image.tar.gz`. Drop that file next
to `docker-compose.yml` and start will **load** it instead of building.

## What you buy

1. Ubuntu 24.04 VPS, 2 GB RAM+ (Hetzner CX22 is enough) **or** a Windows 10/11 /
   Server box with Docker Desktop and admin rights.
2. A cheap domain (~$10/year). A subdomain is enough:
   `requestick.yourcompany.com`.

## GitHub

This repo is **private**. Sales never clone it — they only open the shop URL.

Releases (Actions, on a `v*` tag) attach:

- `requestick-linux.tar.gz` — VPS pack (the copy/paste above)
- `requestick-linux-setup.sh` — same pack as one file
- `requestick-docker.tar.gz` / `requestick-image.tar.gz` — premade image
- `requestick-windows.zip` — Windows server
- `requestick-source.tar.gz` — source

To cut a new pack: `git tag v1.0.2 && git push origin v1.0.2`

A shop that can `docker login` to GHCR can set in `mesh.env`:

```text
REQUESTICK_IMAGE=ghcr.io/dozer54321/requestick:v1.0.1
```

Rebuild packs on a machine with Node 22 (and Docker, for the image):

```text
npm ci
npm run pack:installers
```

## Windows installer (server only)

This is for **one** Windows machine that will host Requestick — not the sales
desks. It needs Administrator and [Docker Desktop](https://www.docker.com/products/docker-desktop/).

1. Extract `requestick-windows.zip`
2. Open **START HERE.txt**
3. Right-click `install.bat` → **Run as administrator**
4. When prompted, enter `requestick.yourcompany.com`

If IIS is using the web ports, the installer will offer to stop it. If Docker
Desktop is already running, `.\start.ps1 your.hostname` is enough.
