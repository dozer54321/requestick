#!/usr/bin/env node
/**
 * Build Linux + Windows + Docker packs (and a GitHub source pack) into artifacts/.
 * Run: npm run pack:installers
 *
 * When Docker is available (GitHub Actions), also builds requestick:local and
 * writes artifacts/requestick-image.tar.gz so a server can docker load it.
 */
import { execSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, rmSync, chmodSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const staging = join("/tmp", "requestick-pack");
const artifacts = join(root, "artifacts");

if (process.env.SKIP_VPS_BUILD === "1" && existsSync(join(root, ".output", "server"))) {
  console.log("SKIP_VPS_BUILD=1 — reusing existing .output");
} else {
  console.log("Building the self-host app (node-server, email/password only)...");
  execSync("npm run build:vps", { stdio: "inherit", cwd: root });
}

if (!existsSync(join(root, ".output", "server"))) {
  throw new Error("vite build did not produce .output/server");
}

function dockerAvailable() {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(artifacts, { recursive: true });

function copyCommon(dest) {
  mkdirSync(dest, { recursive: true });
  for (const f of ["Dockerfile", "docker-compose.yml", "Caddyfile", "env.example"]) {
    const src = join(root, "deploy/vps", f);
    if (existsSync(src)) cpSync(src, join(dest, f));
  }
  execSync(`cp -a "${join(root, "migrations")}" "${join(dest, "migrations")}"`);
  mkdirSync(join(dest, "scripts"), { recursive: true });
  cpSync(join(root, "scripts/migrate.mjs"), join(dest, "scripts/migrate.mjs"));
  cpSync(join(root, "scripts/migration-plan.mjs"), join(dest, "scripts/migration-plan.mjs"));
  execSync(`cp -a "${join(root, ".output")}" "${join(dest, ".output")}"`);
  writeFileSync(join(dest, ".dockerignore"), ".git\n*.env\nmesh.env\nbackups\n");
  for (const f of ["README.md", "LICENSE", "VERSION"]) {
    if (existsSync(join(root, f))) cpSync(join(root, f), join(dest, f));
  }
}

function copyStartScripts(dest) {
  cpSync(join(root, "deploy/vps/start.sh"), join(dest, "start.sh"));
  cpSync(join(root, "deploy/vps/backup.sh"), join(dest, "backup.sh"));
  cpSync(join(root, "deploy/windows/start.ps1"), join(dest, "start.ps1"));
  cpSync(join(root, "deploy/windows/backup.ps1"), join(dest, "backup.ps1"));
  chmodSync(join(dest, "start.sh"), 0o755);
  chmodSync(join(dest, "backup.sh"), 0o755);
}

const linux = join(staging, "requestick-linux");
copyCommon(linux);
copyStartScripts(linux);
cpSync(join(root, "deploy/vps/install.sh"), join(linux, "install.sh"));
cpSync(join(root, "deploy/vps/INSTALL.txt"), join(linux, "INSTALL.txt"));
cpSync(join(root, "deploy/vps/DOCKER.txt"), join(linux, "DOCKER.txt"));
if (existsSync(join(root, "deploy/vps/START HERE.txt"))) {
  cpSync(join(root, "deploy/vps/START HERE.txt"), join(linux, "START HERE.txt"));
}
if (existsSync(join(root, "deploy/vps/PASTE.txt"))) {
  cpSync(join(root, "deploy/vps/PASTE.txt"), join(linux, "PASTE.txt"));
}
if (existsSync(join(root, "deploy/vps/install"))) {
  cpSync(join(root, "deploy/vps/install"), join(linux, "install"));
  chmodSync(join(linux, "install"), 0o755);
}
chmodSync(join(linux, "install.sh"), 0o755);

const win = join(staging, "requestick-windows");
copyCommon(win);
copyStartScripts(win);
for (const f of ["install.ps1", "install.bat", "uninstall.ps1", "README.txt", "START HERE.txt"]) {
  const src = join(root, "deploy/windows", f);
  if (existsSync(src)) cpSync(src, join(win, f));
}
cpSync(join(root, "deploy/vps/DOCKER.txt"), join(win, "DOCKER.txt"));

const dockerPack = join(staging, "requestick-docker");
copyCommon(dockerPack);
copyStartScripts(dockerPack);
cpSync(join(root, "deploy/vps/DOCKER.txt"), join(dockerPack, "DOCKER.txt"));
cpSync(join(root, "deploy/vps/install.sh"), join(dockerPack, "install.sh"));
cpSync(join(root, "deploy/windows/install.ps1"), join(dockerPack, "install.ps1"));
cpSync(join(root, "deploy/windows/install.bat"), join(dockerPack, "install.bat"));
cpSync(join(root, "deploy/windows/uninstall.ps1"), join(dockerPack, "uninstall.ps1"));
chmodSync(join(dockerPack, "install.sh"), 0o755);

const source = join(staging, "requestick");
mkdirSync(source, { recursive: true });
const sourceExcludes = [
  "node_modules",
  ".output",
  "artifacts",
  "screenshots",
  ".git",
  "mesh.env",
  ".vercel",
  ".nitro",
  ".tanstack",
  ".node_modules.lock",
  ".project_id",
  ".grok/skills",
  ".grok/references",
  ".grok/status",
]
  .map((e) => `--exclude=${e}`)
  .join(" ");
execSync(
  `tar -C "${root}" ${sourceExcludes} -cf - . | tar -C "${source}" -xf -`,
  { shell: "/bin/bash" },
);
cpSync(join(root, "deploy/GITHUB.txt"), join(source, "GITHUB.txt"));

if (dockerAvailable()) {
  const version = (process.env.GITHUB_REF_NAME || readFileSync(join(root, "VERSION"), "utf8").trim() || "dev").replace(/[^A-Za-z0-9._-]/g, "");
  writeFileSync(join(root, "VERSION"), version);
  console.log("Building requestick:local image...", version);
  execSync(`docker build -t requestick:local --build-arg REQUESTICK_VERSION=${version} -f deploy/vps/Dockerfile .`, {
    stdio: "inherit",
    cwd: root,
  });
  const imageTar = join(artifacts, "requestick-image.tar.gz");
  execSync(`docker save requestick:local | gzip -c > "${imageTar}"`, {
    shell: "/bin/bash",
    cwd: root,
  });
  console.log("Wrote", imageTar);
  cpSync(imageTar, join(dockerPack, "requestick-image.tar.gz"));
} else {
  console.log("Docker not available here — skipping requestick-image.tar.gz (GitHub Actions will build it).");
}

mkdirSync(artifacts, { recursive: true });
const linuxTar = join(artifacts, "requestick-linux.tar.gz");
const winTar = join(artifacts, "requestick-windows.tar.gz");
const dockerTar = join(artifacts, "requestick-docker.tar.gz");
const sourceTar = join(artifacts, "requestick-source.tar.gz");
execSync(`tar -czf "${linuxTar}" -C "${staging}" requestick-linux`);
execSync(`tar -czf "${winTar}" -C "${staging}" requestick-windows`);
execSync(`tar -czf "${dockerTar}" -C "${staging}" requestick-docker`);
execSync(`tar -czf "${sourceTar}" -C "${staging}" requestick`);
execSync(
  `python3 -c "import shutil; shutil.make_archive(r'${join(artifacts, "requestick-windows")}', 'zip', r'${staging}', 'requestick-windows')"`,
);

const setupPath = join(artifacts, "requestick-linux-setup.sh");
const setupHeader = `#!/bin/bash
# Requestick — one-file Linux installer
# Usage: sudo bash requestick-linux-setup.sh
# It asks for the domain or subdomain. You can still pass one as the first argument.
set -euo pipefail
case "\$0" in
  bash|sh|-bash|-sh|dash)
    _tmp="\$(mktemp /tmp/requestick-install.XXXXXX)"
    cat > "\$_tmp"
    chmod +x "\$_tmp"
    exec bash "\$_tmp" "\$@"
    ;;
esac
if [ ! -f "\$0" ]; then
  _tmp="\$(mktemp /tmp/requestick-install.XXXXXX)"
  cat > "\$_tmp"
  chmod +x "\$_tmp"
  exec bash "\$_tmp" "\$@"
fi
if [ "\$(id -u)" -ne 0 ]; then
  echo "Re-run with sudo."
  exit 1
fi
DEST="\${REQUESTICK_HOME:-/opt/requestick}"
TMP="\$(mktemp -d)"
KEEP="\$(mktemp -d)"
cleanup() { rm -rf "\$TMP" "\$KEEP"; }
trap cleanup EXIT
ARCHIVE_LINE="\$(awk '/^__REQUESTICK_ARCHIVE__\$/ { print NR + 1; exit 0 }' "\$0")"
if [ -z "\$ARCHIVE_LINE" ]; then
  echo "Installer is missing the app archive."
  exit 1
fi
tail -n +"\$ARCHIVE_LINE" "\$0" | tar -xzf - -C "\$TMP"
if [ ! -d "\$TMP/requestick-linux" ]; then
  echo "Archive did not contain requestick-linux."
  exit 1
fi
mkdir -p "\$DEST"
if [ -f "\$DEST/mesh.env" ]; then cp "\$DEST/mesh.env" "\$KEEP/mesh.env"; fi
if [ -d "\$DEST/backups" ]; then cp -a "\$DEST/backups" "\$KEEP/backups"; fi
find "\$DEST" -mindepth 1 -maxdepth 1 ! -name mesh.env ! -name backups -exec rm -rf {} +
cp -a "\$TMP"/requestick-linux/. "\$DEST"/
if [ -f "\$KEEP/mesh.env" ]; then cp "\$KEEP/mesh.env" "\$DEST/mesh.env"; fi
if [ -d "\$KEEP/backups" ]; then rm -rf "\$DEST/backups"; cp -a "\$KEEP/backups" "\$DEST/backups"; fi
cd "\$DEST"
chmod +x install.sh install backup.sh start.sh 2>/dev/null || chmod +x install.sh backup.sh start.sh
./install.sh "\$@"
exit 0
__REQUESTICK_ARCHIVE__
`;
writeFileSync(setupPath, setupHeader, { encoding: "utf8" });
appendFileSync(setupPath, readFileSync(linuxTar));
chmodSync(setupPath, 0o755);

console.log("Wrote", linuxTar);
console.log("Wrote", setupPath);
console.log("Wrote", winTar);
console.log("Wrote", join(artifacts, "requestick-windows.zip"));
console.log("Wrote", dockerTar);
console.log("Wrote", sourceTar);
