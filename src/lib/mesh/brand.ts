import type { Branding, PublicBrand } from "./types";

export const DEFAULT_BRANDING: Branding = {
  companyName: "Requestick",
  tagline: "Sales board",
  logoData: "",
  paper: "#efe8dc",
  ink: "#1c1917",
  accent: "#1c1917",
};

export const DEFAULT_PUBLIC_BRAND: PublicBrand = {
  ...DEFAULT_BRANDING,
  signupOpen: true,
};

export const BRAND_PRESETS: { id: string; name: string; paper: string; ink: string; accent: string }[] =
  [
    { id: "paper", name: "Paper", paper: "#efe8dc", ink: "#1c1917", accent: "#1c1917" },
    { id: "steel", name: "Steel", paper: "#e6ecef", ink: "#1b242b", accent: "#2f4d63" },
    { id: "forest", name: "Forest", paper: "#e6eee8", ink: "#1c241e", accent: "#2c5a42" },
    { id: "night", name: "Night", paper: "#1c1b18", ink: "#f3efe6", accent: "#d4c8b6" },
  ];

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function luminance([r, g, b]: RGB): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function brandingToCssVars(brand: Branding): Record<string, string> {
  const paper = hexToRgb(brand.paper) ?? [239, 232, 220];
  const ink = hexToRgb(brand.ink) ?? [28, 25, 23];
  const accent = hexToRgb(brand.accent) ?? ink;
  const dark = luminance(paper) < 0.42;
  const white: RGB = [255, 255, 255];
  const black: RGB = [12, 10, 8];
  const surface = mix(paper, dark ? white : white, dark ? 0.07 : 0.62);
  const surface2 = mix(paper, white, dark ? 0.12 : 0.84);
  const bgDeep = mix(paper, dark ? black : ink, dark ? 0.28 : 0.08);
  const inkSoft = mix(ink, paper, dark ? 0.18 : 0.28);
  const muted = mix(ink, paper, dark ? 0.32 : 0.42);
  const faint = mix(ink, paper, dark ? 0.45 : 0.55);
  const line = mix(paper, dark ? white : ink, dark ? 0.16 : 0.2);
  const lineStrong = mix(paper, dark ? white : ink, dark ? 0.28 : 0.32);
  const primaryFg = luminance(accent) < 0.45 ? (dark ? ink : [247, 241, 231]) : ink;
  return {
    "--color-bg": rgbToHex(paper),
    "--color-bg-deep": rgbToHex(bgDeep),
    "--color-surface": rgbToHex(surface),
    "--color-surface-2": rgbToHex(surface2),
    "--color-ink": rgbToHex(ink),
    "--color-ink-soft": rgbToHex(inkSoft),
    "--color-muted": rgbToHex(muted),
    "--color-faint": rgbToHex(faint),
    "--color-line": rgbToHex(line),
    "--color-line-strong": rgbToHex(lineStrong),
    "--color-primary": rgbToHex(accent),
    "--color-primary-fg": rgbToHex(primaryFg as RGB),
    "--color-steel": rgbToHex(mix(ink, accent, 0.35)),
    "--color-ring": rgbToHex(accent),
  };
}

export function applyBranding(brand: Branding) {
  if (typeof document === "undefined") return;
  const vars = brandingToCssVars(brand);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  root.style.background = brand.paper;
  root.dataset.brandName = brand.companyName;
  const theme = document.querySelector('meta[name="theme-color"]');
  theme?.setAttribute("content", brand.paper);
  if (document.title === "Mesh" || document.title === "Requestick" || document.title === root.dataset.brandName || !document.title) {
    document.title = brand.companyName;
  } else if (!document.title.includes("HOT") && !document.title.includes("update")) {
    document.title = brand.companyName;
  }
}
