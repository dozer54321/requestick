import type { MeshNeed, MeshProfile, MeshSnapshot } from "./types";
import { displayName } from "./format";

const LAST_SEEN_KEY = "mesh.lastSeenRevision";

export function loadLastSeen(): string {
  try {
    return localStorage.getItem(LAST_SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveLastSeen(revision: string) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, revision);
  } catch {
    /* ignore */
  }
}

export function requestAlertPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return Promise.resolve("denied");
  return Notification.requestPermission();
}

export function alertsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function playPing() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const beep = (freq: number, t: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    };
    beep(784, now, 0.09);
    beep(1046, now + 0.11, 0.12);
    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    /* audio blocked */
  }
}

export type MeshAlert = {
  title: string;
  body: string;
  tag: string;
  hot: boolean;
};

export function diffAlerts(
  prev: MeshSnapshot | null,
  next: MeshSnapshot,
  myName: string,
): MeshAlert[] {
  if (!prev) return [];
  const prevMap = new Map(prev.needs.map((n) => [n.id, n]));
  const out: MeshAlert[] = [];

  for (const need of next.needs) {
    const old = prevMap.get(need.id);
    const who = displayName(next.profiles, need.createdBy);
    if (!old) {
      if (need.createdBy === next.me) continue;
      out.push({
        title: `${who} posted a need`,
        body: `${need.partNumber} · ${need.description}`,
        tag: `need-${need.id}`,
        hot: need.priority === "hot",
      });
      continue;
    }
    if (old.status === need.status) continue;
    if (need.status === "claimed" && need.claimedBy && need.claimedBy !== next.me) {
      const claimer = displayName(next.profiles, need.claimedBy);
      const mine = need.createdBy === next.me;
      out.push({
        title: mine ? `${claimer} is on your part` : `${claimer} is on it`,
        body: `${need.partNumber} · ${need.description}`,
        tag: `need-${need.id}-claimed`,
        hot: mine || need.priority === "hot",
      });
    } else if (need.status === "filled" && need.filledBy && need.filledBy !== next.me) {
      const filler = displayName(next.profiles, need.filledBy);
      const mine = need.createdBy === next.me;
      out.push({
        title: mine ? `${filler} filled your need` : `${filler} filled a part`,
        body: `${need.partNumber} · ${need.description}`,
        tag: `need-${need.id}-filled`,
        hot: false,
      });
    }
  }

  void myName;
  return out;
}

export function fireAlerts(alerts: MeshAlert[], profiles: MeshProfile[], me: string) {
  if (alerts.length === 0) return;
  const mine = profiles.find((p) => p.userId === me);
  if (mine && !mine.alertsOn) return;

  playPing();

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    for (const a of alerts.slice(0, 4)) {
      try {
        const n = new Notification(a.title, {
          body: a.body,
          tag: a.tag,
          requireInteraction: a.hot,
          silent: true,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        /* ignore */
      }
    }
  }

  const hottest = alerts.some((a) => a.hot);
  const count = alerts.length;
  flashTitle(count, hottest);
}

let flashTimer: number | null = null;
let flashLeft = 0;

function brandTitle(): string {
  if (typeof document === "undefined") return "Requestick";
  return document.documentElement.dataset.brandName || "Requestick";
}

function flashTitle(count: number, hot: boolean) {
  if (typeof document === "undefined") return;
  if (flashTimer != null) window.clearInterval(flashTimer);
  flashLeft = 8;
  const base = brandTitle();
  const msg = hot ? `${count} HOT on ${base}` : `${count} ${base} update${count === 1 ? "" : "s"}`;
  flashTimer = window.setInterval(() => {
    document.title = flashLeft % 2 === 0 ? msg : base;
    flashLeft -= 1;
    if (flashLeft <= 0 && flashTimer != null) {
      window.clearInterval(flashTimer);
      flashTimer = null;
      document.title = base;
    }
  }, 700);
}

export function restoreTitle() {
  if (typeof document === "undefined") return;
  if (flashTimer != null) {
    window.clearInterval(flashTimer);
    flashTimer = null;
  }
  document.title = brandTitle();
}
