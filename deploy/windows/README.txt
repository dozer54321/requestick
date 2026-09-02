REQUESTICK — Windows server (not sales PCs)
==========================================

This installer is for ONE Windows machine that will host the board.
Sales desks only need Chrome or Edge. Do not run this on every PC.

Premade Docker
--------------
If Docker Desktop is already running:

  .\start.ps1 requestick.yourcompany.com

Need
----
- Windows 10/11 or Windows Server
- Administrator
- Docker Desktop running
- A hostname, e.g. requestick.yourcompany.com  (not a bare IP)

Install (no Docker yet)
-----------------------
1. Point the hostname's A record at this machine's public IP.
2. Open START HERE.txt if you want the short version.
3. Right-click install.bat -> Run as administrator
   (or:  powershell -ExecutionPolicy Bypass -File .\install.ps1 requestick.yourcompany.com)
4. Open https://requestick.yourcompany.com
5. First sign-in + desk card is the admin.

If IIS is using the web ports the installer stops it.
If Docker Desktop is missing, the installer can offer to install it via winget.
Re-run install.bat after Docker Desktop is idle.

Backup:   .\backup.ps1
Stop:     .\uninstall.ps1   (keeps the database)

Keep mesh.env private. That is the password and sign-in secret.

See DOCKER.txt for the compose stack, a prebuilt image, and GHCR pull.
