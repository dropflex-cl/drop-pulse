// El paquete de montaje (docs/spec-video-ugc.md §5.1): todo lo que scripts/ugc-montage.py necesita
// para armar el video en el equipo del comerciante. Puro.

import { PACKAGE_VERSION, type VideoFormat } from "./catalog";
import type { UgcScript } from "./schemas";

export interface MontagePackage {
  version: number;
  product: { id: string; title: string };
  angle: { slot: number; title: string };
  /** Persona o mascota: un ángulo puede tener los dos videos. */
  format: VideoFormat;
  language: string;
  /** Color de la palabra activa en los subtítulos (el acento de la página, o el de DropFlex). */
  accent_color: string;
  /** Rótulo que va durante todo el video: «Dramatización» si habla una persona de IA, «Animación» si es una mascota. */
  label: string;
  a_roll: { key: string; line: string; seconds: number; url: string }[];
  b_roll: { key: string; anchor: string; cut_s: number; url: string }[];
  text_beats: { anchor: string; until: string | null; text: string }[];
  end_card: { image_url: string; title: string; subtitle: string; cta: string; small_print: string[] };
  expires_at: string;
}

export interface PackageInput {
  product: { id: string; title: string };
  angle: { slot: number; title: string };
  language: string;
  accentColor: string | null;
  format?: VideoFormat;
  script: UgcScript;
  /** URL firmada de cada clip listo, por clave (A1…, B1…). */
  clipUrls: Map<string, string>;
  endCardImageUrl: string;
  expiresAt: string;
}

/** Amarillo de la POC: se ve sobre piel y fondos claros con borde negro. */
export const DEFAULT_ACCENT = "#F2C230";

/** Falta un clip: el paquete no se arma hasta que estén todos. */
export class PackageNotReady extends Error {}

/**
 * El acento de la página sirve si es claro: los subtítulos llevan borde negro, y una palabra oscura
 * sobre borde negro no se lee. Si no, el amarillo.
 */
export function captionAccent(hex: string | null): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return DEFAULT_ACCENT;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.4 ? hex.toUpperCase() : DEFAULT_ACCENT;
}

export function videoLabel(format: VideoFormat, language: string): string {
  const pt = language.startsWith("pt");
  if (format === "mascot") return pt ? "Animação" : "Animación";
  return pt ? "Dramatização" : "Dramatización";
}

export function buildPackage(p: PackageInput): MontagePackage {
  const url = (key: string) => {
    const u = p.clipUrls.get(key);
    if (!u) throw new PackageNotReady(`Falta el clip ${key}.`);
    return u;
  };
  return {
    version: PACKAGE_VERSION,
    product: p.product,
    angle: p.angle,
    format: p.format ?? "ugc",
    language: p.language,
    accent_color: captionAccent(p.accentColor),
    label: videoLabel(p.format ?? "ugc", p.language),
    a_roll: p.script.a_roll.map((a) => ({ key: a.key, line: a.line, seconds: a.seconds, url: url(a.key) })),
    b_roll: p.script.b_roll.map((b) => ({ key: b.key, anchor: b.anchor, cut_s: b.cut_s, url: url(b.key) })),
    text_beats: p.script.text_beats.map((t) => ({ anchor: t.anchor, until: t.until, text: t.text })),
    end_card: { image_url: p.endCardImageUrl, ...p.script.end_card },
    expires_at: p.expiresAt,
  };
}
