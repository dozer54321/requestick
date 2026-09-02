# Requestick

Company-only sales board for FFL inside sales. Post a part on an open dealer
ticket, ping the desk, call Ring Central or text a cell. Admins approve logins,
set branding, and can read open tickets from Business Central (read-only).

Each shop runs its own copy. First sign-in is the admin; everyone else waits
for approval. Do not put two shops on one install.

## Install

Point DNS at the server first (A record → this machine). Login needs a real
hostname and HTTPS, not a bare IP.

On the Ubuntu VPS, paste **both** lines. The first word of the second line is
`curl` (not `url`). Change the hostname at the end.

```bash
sudo apt-get update && sudo apt-get install -y curl
curl -fsSL https://github.com/dozer54321/requestick/releases/latest/download/requestick-linux-setup.sh | sudo bash -s -- requestick.example.com
```

Wait about a minute, then open `https://requestick.example.com`. First person
through Sign in + desk card is the admin.

Already unpacked:

```bash
sudo ./install requestick.example.com
```

Sales use Chrome or Edge. Nothing is installed on the desks.

## Admin

1. **People** — add accounts or approve sign-ups
2. **Look** — company name, mark, colors
3. **Central** — Business Central, read-only (`API.Read.All` only)
4. **Updates** — install a GitHub release, or revert to an older one. Manual only. Tickets and logins stay; the site restarts for about 30 seconds.

Daily: post a request, **On it** / **Filled**, Call or Text. Leave the tab open
for Windows alerts. Admins **Hide** or **Remove** a request.

## Backup

```bash
sudo /opt/requestick/backup.sh
```

Keep `mesh.env` (database password and sign-in secret). Do not delete the
Docker volume `mesh_pgdata`.

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
