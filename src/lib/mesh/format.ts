import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from "date-fns";
import type { MeshNeed, MeshProfile, NeedPriority, NeedStatus } from "./types";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCell(value: string): string {
  const d = digitsOnly(value);
  if (d.length === 11 && d.startsWith("1")) return formatCell(d.slice(1));
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return value.trim();
}

export function telHref(value: string): string | null {
  const d = digitsOnly(value);
  if (d.length === 10) return `tel:+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `tel:+${d}`;
  if (d.length >= 7) return `tel:${d}`;
  return null;
}

export function smsHref(cell: string, body: string): string | null {
  const href = telHref(cell);
  if (!href) return null;
  const num = href.replace("tel:", "");
  return `sms:${num}?body=${encodeURIComponent(body)}`;
}

export function rcCallHref(extension: string): string | null {
  const ext = extension.trim();
  if (!ext) return null;
  return `rcapp://r/call?number=${encodeURIComponent(ext)}`;
}

export function profileById(
  profiles: MeshProfile[],
  userId: string | null | undefined,
): MeshProfile | undefined {
  if (!userId) return undefined;
  return profiles.find((p) => p.userId === userId);
}

export function displayName(profiles: MeshProfile[], userId: string | null | undefined): string {
  return profileById(profiles, userId)?.displayName ?? "Teammate";
}

export function matchSalesperson(
  code: string,
  profiles: MeshProfile[],
): MeshProfile | undefined {
  const n = code.trim().toLowerCase();
  if (!n) return undefined;
  const exact = profiles.find((p) => p.displayName.trim().toLowerCase() === n);
  if (exact) return exact;
  return profiles.find((p) => {
    const name = p.displayName.trim().toLowerCase();
    const email = p.email.trim().toLowerCase();
    if (name && (n.includes(name) || name.includes(n))) return true;
    const first = name.split(/\s+/)[0];
    if (first && first.length >= 3 && n.includes(first)) return true;
    if (email && (email === n || email.startsWith(`${n}@`))) return true;
    return false;
  });
}

export function dateKey(iso: string): string {
  try {
    return format(parseISO(iso), "yyyy-MM-dd");
  } catch {
    return iso.slice(0, 10);
  }
}

export function dateHeading(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEEE, MMM d");
  } catch {
    return iso.slice(0, 10);
  }
}

export function timeLabel(iso: string): string {
  try {
    return format(parseISO(iso), "h:mm a");
  } catch {
    return "";
  }
}

export function relativeLabel(iso: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function priorityLabel(p: NeedPriority): string {
  if (p === "hot") return "Hot";
  if (p === "today") return "Today";
  return "When you can";
}

export function statusLabel(s: NeedStatus): string {
  if (s === "claimed") return "On it";
  if (s === "filled") return "Filled";
  if (s === "cancelled") return "Hidden";
  return "Open";
}

export function smsBody(need: MeshNeed, fromName: string): string {
  const ticket = need.ticketNumber ? ` ticket ${need.ticketNumber}` : "";
  return `I have ${need.partNumber}${ticket}. — ${fromName}`;
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function needsToCsv(needs: MeshNeed[], profiles: MeshProfile[]): string {
  const header = [
    "Date",
    "Part Number",
    "Description",
    "Qty",
    "Priority",
    "Status",
    "Ticket",
    "Requester",
    "Extension",
    "Cell",
    "Notes",
  ];
  const rows = needs.map((n) => {
    const who = profileById(profiles, n.createdBy);
    return [
      n.createdAt,
      n.partNumber,
      n.description,
      String(n.qty),
      n.priority,
      n.status,
      n.ticketNumber,
      who?.displayName ?? "",
      who?.extension ?? "",
      who?.cell ?? "",
      n.notes,
    ].map(csvEscape);
  });
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
