import { execFile as execFileCb } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { promisify } from "node:util";
import { join } from "node:path";

const execFile = promisify(execFileCb);

export type ReleaseInfo = {
  tag: string;
  name: string;
  publishedAt: string;
  notes: string;
  hasImage: boolean;
  cached: boolean;
  newer: boolean;
};

export type UpdateStatus = {
  currentVersion: string;
  latestTag: string | null;
  updateAvailable: boolean;
  canApply: boolean;
  reason: string;
  repo: string;
  job: {
    state: "idle" | "downloading" | "loading" | "restarting" | "error";
    targetTag: string | null;
    error: string | null;
  };
  releases: ReleaseInfo[];
};

const TAG_RE = /^v\d+\.\d+\.\d+$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function updateRepo(): string {
  const raw = (process.env.REQUESTICK_UPDATE_REPO || "dozer54321/requestick").trim();
  return REPO_RE.test(raw) ? raw : "dozer54321/requestick";
}

function composeDir(): string {
  return process.env.REQUESTICK_COMPOSE_DIR || "/host/requestick";
}

function statusPath(): string {
  return join(composeDir(), "backups", "update-status.json");
}

function parseTag(value: string): [number, number, number] | null {
  const m = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpTag(a: string, b: string): number {
  const pa = parseTag(a);
  const pb = parseTag(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function currentVersion(): string {
  const env = (process.env.REQUESTICK_VERSION || "").trim();
  if (env) return env;
  try {
    const fromFile = readFileSync("/app/VERSION", "utf8").trim();
    if (fromFile) return fromFile;
  } catch {
    /* preview / unpack without a baked version */
  }
  try {
    const fromCwd = readFileSync(join(process.cwd(), "VERSION"), "utf8").trim();
    if (fromCwd) return fromCwd;
  } catch {
    /* ignore */
  }
  return "dev";
}

type JobState = UpdateStatus["job"];

function readJob(): JobState {
  try {
    const raw = JSON.parse(readFileSync(statusPath(), "utf8")) as JobState;
    if (!raw || typeof raw !== "object") {
      return { state: "idle", targetTag: null, error: null };
    }
    return {
      state: raw.state || "idle",
      targetTag: raw.targetTag ?? null,
      error: raw.error ?? null,
    };
  } catch {
    return { state: "idle", targetTag: null, error: null };
  }
}

function writeJob(job: JobState): void {
  try {
    mkdirSync(join(composeDir(), "backups"), { recursive: true });
    writeFileSync(statusPath(), JSON.stringify(job));
  } catch {
    /* compose dir may not exist in preview */
  }
}

async function inspectIds(): Promise<string[]> {
  const ids: string[] = [];
  try {
    const { stdout } = await execFile("hostname", [], { timeout: 3000 });
    if (stdout.trim()) ids.push(stdout.trim());
  } catch {
    /* ignore */
  }
  const filters = [
    ["ps", "-aq", "--filter", "name=mesh-app"],
    [
      "ps",
      "-aq",
      "--filter",
      "label=com.docker.compose.project=mesh",
      "--filter",
      "label=com.docker.compose.service=app",
    ],
  ];
  for (const args of filters) {
    try {
      const { stdout } = await execFile("docker", args, { timeout: 8000 });
      for (const id of stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
        if (!ids.includes(id)) ids.push(id);
      }
    } catch {
      /* next */
    }
  }
  return ids;
}

async function hostComposeDir(): Promise<string | null> {
  const dest = composeDir();
  for (const id of await inspectIds()) {
    try {
      const { stdout } = await execFile(
        "docker",
        ["inspect", "-f", "{{range .Mounts}}{{.Destination}}\t{{.Source}}\n{{end}}", id],
        { timeout: 8000 },
      );
      for (const line of stdout.split("\n")) {
        const [mountDest, source] = line.split("\t");
        if (mountDest === dest && source?.trim()) return source.trim();
      }
    } catch {
      /* next */
    }
    try {
      const { stdout } = await execFile(
        "docker",
        [
          "inspect",
          "-f",
          `{{index .Config.Labels "com.docker.compose.project.working_dir"}}`,
          id,
        ],
        { timeout: 8000 },
      );
      const dir = stdout.trim();
      if (dir.startsWith("/")) return dir;
    } catch {
      /* next */
    }
  }
  if (existsSync("/opt/requestick/docker-compose.yml")) return "/opt/requestick";
  return null;
}

async function dockerOk(): Promise<boolean> {
  if (!existsSync("/var/run/docker.sock")) return false;
  try {
    await execFile("docker", ["version", "--format", "{{.Client.Version}}"], {
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

async function localTags(): Promise<Set<string>> {
  const found = new Set<string>();
  try {
    const { stdout } = await execFile(
      "docker",
      ["images", "--format", "{{.Repository}}:{{.Tag}}"],
      { timeout: 8000 },
    );
    for (const line of stdout.split("\n")) {
      const t = line.trim();
      const m = t.match(/:(v\d+\.\d+\.\d+)$/);
      if (m) found.add(m[1]);
    }
  } catch {
    /* no docker */
  }
  return found;
}

type GhRelease = {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string }[];
};

async function fetchReleases(repo: string): Promise<GhRelease[]> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=20`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Requestick-Updater",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub returned ${res.status}. Try again in a minute.`);
  }
  const data = (await res.json()) as GhRelease[];
  if (!Array.isArray(data)) return [];
  return data.filter((r) => !r.draft && !r.prerelease && TAG_RE.test(r.tag_name));
}

export async function loadUpdateStatus(): Promise<UpdateStatus> {
  const repo = updateRepo();
  const current = currentVersion();
  const sock = existsSync("/var/run/docker.sock");
  const dir = composeDir();
  const filesHere =
    existsSync(join(dir, "docker-compose.yml")) && existsSync(join(dir, "mesh.env"));
  const hasDocker = sock && (await dockerOk());
  const hostDir = hasDocker ? await hostComposeDir() : null;
  let canApply = Boolean(hasDocker && (filesHere || hostDir));
  let reason = "";
  if (!sock || !hasDocker) {
    reason =
      "This copy cannot swap its own containers (no Docker socket). On a VPS install this button works.";
    canApply = false;
  } else if (!filesHere && !hostDir) {
    reason = "The compose folder is not mounted, so this copy cannot restart itself.";
    canApply = false;
  }

  let releases: ReleaseInfo[] = [];
  let fetchError = "";
  try {
    const cached = await localTags();
    const gh = await fetchReleases(repo);
    releases = gh.map((r) => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      publishedAt: r.published_at,
      notes: (r.body || "").slice(0, 400),
      hasImage: r.assets.some((a) => a.name === "requestick-image.tar.gz"),
      cached: cached.has(r.tag_name),
      newer: cmpTag(r.tag_name, current) > 0,
    }));
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Could not reach GitHub.";
  }

  const latestTag = releases[0]?.tag ?? null;
  let job = readJob();
  if (job.targetTag && current === job.targetTag && job.state === "restarting") {
    job = { state: "idle", targetTag: null, error: null };
    writeJob(job);
  }

  return {
    currentVersion: current,
    latestTag,
    updateAvailable: Boolean(latestTag && cmpTag(latestTag, current) > 0),
    canApply,
    reason: fetchError || reason,
    repo,
    job,
    releases,
  };
}

function setEnvKey(file: string, key: string, value: string): void {
  const text = readFileSync(file, "utf8");
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  const next = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(file, next);
}

async function downloadImage(repo: string, tag: string, dest: string): Promise<void> {
  const url = `https://github.com/${repo}/releases/download/${tag}/requestick-image.tar.gz`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Requestick-Updater" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      `Release ${tag} has no image pack (${res.status}). Use the VPS one-liner for that version.`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

export async function applyVersion(tag: string): Promise<UpdateStatus> {
  if (!TAG_RE.test(tag)) throw new Error("That is not a Requestick version tag.");
  const status = await loadUpdateStatus();
  if (!status.canApply) {
    throw new Error(status.reason || "This install cannot update itself.");
  }
  const match = status.releases.find((r) => r.tag === tag);
  if (!match) throw new Error("Unknown version. Refresh and pick one from the list.");
  if (!match.hasImage && !match.cached) {
    throw new Error("That release has no image to load.");
  }

  const dir = composeDir();
  const repo = updateRepo();
  const tarPath = join(dir, "backups", `requestick-${tag}.tar.gz`);
  mkdirSync(join(dir, "backups"), { recursive: true });

  writeJob({ state: "downloading", targetTag: tag, error: null });

  try {
    if (!match.cached) {
      await downloadImage(repo, tag, tarPath);
      writeJob({ state: "loading", targetTag: tag, error: null });
      await execFile("docker", ["load", "-i", tarPath], { timeout: 300_000 });
      try {
        await execFile("docker", ["tag", "requestick:local", `requestick:${tag}`], {
          timeout: 15_000,
        });
      } catch {
        /* already tagged */
      }
    }

    const envFile = join(dir, "mesh.env");
    setEnvKey(envFile, "REQUESTICK_IMAGE", `requestick:${tag}`);
    setEnvKey(envFile, "REQUESTICK_VERSION", tag);

    writeJob({ state: "restarting", targetTag: tag, error: null });

    // Bind-mount the *host* compose folder. Volume paths on docker.sock are
    // host paths — /host/requestick only exists inside this container.
    const hostDir = (await hostComposeDir()) || "/opt/requestick";
    await execFile("docker", ["rm", "-f", "mesh-updater"], { timeout: 15_000 }).catch(() => {});
    const { spawn } = await import("node:child_process");
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--name",
        "mesh-updater",
        "-v",
        "/var/run/docker.sock:/var/run/docker.sock",
        "-v",
        `${hostDir}:/work`,
        "-w",
        "/work",
        "-e",
        "DOCKER_CLI_PLUGIN_PATH=/usr/local/lib/docker/cli-plugins",
        `requestick:${tag}`,
        "sh",
        "-c",
        [
          "sleep 2",
          "mkdir -p /work/backups /root/.docker/cli-plugins",
          "cp -f /usr/local/lib/docker/cli-plugins/docker-compose /root/.docker/cli-plugins/docker-compose 2>/dev/null || true",
          "if [ -f /app/host-pack/docker-compose.yml ]; then cp -f /app/host-pack/docker-compose.yml /work/docker-compose.yml; fi",
          "if [ -f /app/host-pack/Caddyfile ]; then cp -f /app/host-pack/Caddyfile /work/Caddyfile; fi",
          "docker compose --env-file mesh.env -p mesh up -d --no-deps --force-recreate --remove-orphans app > /work/backups/update.log 2>&1",
        ].join(" && "),
      ],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed.";
    writeJob({ state: "error", targetTag: tag, error: message });
    throw new Error(message);
  }

  return loadUpdateStatus();
}
