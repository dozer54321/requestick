# Requestick

Request ticket tracker for FFL inside sales. Post a part on an open dealer
ticket, ping the desk, call Ring Central or text a cell. Admins approve logins,
set branding, and can read open tickets from Business Central (read-only).

Each shop runs its own copy. First sign-in is the admin; everyone else waits
for approval. Do not put two shops on one install.

## Install

Point DNS at the server first (A record → this machine). Login needs a real
hostname and HTTPS, not a bare IP.

On the Ubuntu VPS, paste all three lines. Change the hostname on the last line.
The download command is **`curl`** (not `url`). Save the installer to a file,
then run it — do not pipe it into bash.

```bash
sudo apt-get update && sudo apt-get install -y curl
curl -fsSL -o /tmp/requestick-install.sh https://github.com/dozer54321/requestick/releases/latest/download/requestick-linux-setup.sh
sudo bash /tmp/requestick-install.sh requestick.example.com
```

Wait about a minute, then open `https://requestick.example.com`. First person
through Sign in + desk card is the admin.

Already unpacked:

```bash
sudo ./install requestick.example.com
```

Sales use Chrome or Edge. Nothing is installed on the desks.

## Admin

1. **People** — add accounts or approve sign-ups. The first login is the
   **owner**. The owner can make **managers** (same desk rights; the owner can
   remove them).
2. **Look** — company name, mark, colors
3. **Central** — Business Central, read-only (`API.Read.All` only). Owner
   and managers look up **open sales orders for one part number** (order
   number, open status, salesperson code). The list scrolls. Requestick does
   not dump the whole company. No ticket is required — Admin → Central, or
   **Part search** on the board, or click a part number on a request.
4. **Updates** — owner only. Install a GitHub release or revert. Manual only.

On the board, owner and managers can **Announce** (toast + Windows alert to
everyone on the desk) and **Wipe** the tickets (type `WIPE` to confirm).
Business Central is not touched.

Daily: post a request, **On it** / **Filled**, Call or Text. Leave the tab open
for Windows alerts. Admins **Hide** or **Remove** a request.

## Backup

```bash
sudo /opt/requestick/backup.sh
```

Keep `mesh.env` (database password and sign-in secret). Do not delete the
Docker volume `mesh_pgdata`.

If the board goes blank during an update, the app container did not finish
starting. On the VPS:

```bash
cd /opt/requestick
docker rm -f mesh-app-1
docker compose --env-file mesh.env up -d
docker compose --env-file mesh.env ps
```

## Docker pack

If you already have the files on the machine:

```bash
tar -xzf requestick-docker.tar.gz
cd requestick-docker
chmod +x start.sh backup.sh
./start.sh requestick.example.com
```

Windows host (Docker Desktop): `.\start.ps1 requestick.example.com`

Drop `requestick-image.tar.gz` next to `docker-compose.yml` and start will load
it instead of building.

## Releases

https://github.com/dozer54321/requestick/releases

- `requestick-linux-setup.sh` — installer used above
- `requestick-linux.tar.gz` — same pack as a folder
- `requestick-docker.tar.gz` / `requestick-image.tar.gz`
- `requestick-windows.zip`
- `requestick-source.tar.gz`
