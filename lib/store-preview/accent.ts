// Los tonos del acento por producto en la vista previa: la misma escalera que df-accent-vars.liquid
// (la única fuente en la tienda), con los filtros de Shopify reproducidos aquí (color_brightness,
// color_contrast, color_modify 'lightness'). El test compara ambas. Puro.

import { contrast, normalizeHex } from "@/lib/copy/accent";

const INK_DARK = "#16181d";
const WHITE = "#ffffff";

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** color_brightness de Shopify: (299 R + 587 G + 114 B) / 1000. */
export function brightness(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** color_modify: 'lightness', n (0–100): el mismo tono con otra luminosidad. */
export function withLightness(hex: string, lightness: number): string {
  const [h, s] = toHsl(hex);
  return fromHsl(h, s, lightness / 100);
}

const LIGHT_BG_LADDER = [44, 38, 32, 26, 20, 14];
const DARK_BG_LADDER = [62, 70, 78, 86, 92, 96];

/** Los tonos que emite df-accent-vars: el acento, el texto encima y el acento como texto sobre el fondo. */
export function accentTones(accent: string, background = WHITE): { accent: string; onAccent: string; ink: string } | null {
  const acc = normalizeHex(accent);
  const bg = normalizeHex(background) ?? WHITE;
  if (!acc) return null;
  let ink = acc;
  for (const step of brightness(bg) > 128 ? LIGHT_BG_LADDER : DARK_BG_LADDER) {
    if (contrast(ink, bg) >= 4.5) break;
    ink = withLightness(acc, step);
  }
  return { accent: acc, onAccent: brightness(acc) > 150 ? INK_DARK : WHITE, ink };
}

/** Las variables CSS para el atributo style del marco de tienda. Sin acento, el botón del tema. */
export function accentVars(accent: string | null | undefined, background?: string): Record<string, string> {
  const t = accent ? accentTones(accent, background) : null;
  if (!t) return {};
  return { "--df-product-accent": t.accent, "--df-product-on-accent": t.onAccent, "--df-product-accent-ink": t.ink };
}
