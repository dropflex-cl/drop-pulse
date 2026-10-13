// Paquete de montaje local vigente. El lector Python mantiene compatibilidad con v1/v2.
import { PACKAGE_VERSION, montageName, opensWithInsert, type VideoFormat, type VideoOpeningShot } from "./catalog";
import type { UgcScript } from "./schemas";

export interface MontagePackage {
  version: number;
  name: string;
  product: { id: string; title: string };
  angle: { slot: number; title: string };
  format: VideoFormat;
  language: string;
  /** El inserto de apertura comienza en el cuadro 0, sin texto ni zoom añadido. */
  opening: { shot: VideoOpeningShot; insert: string | null } | null;
  a_roll: { key: string; line: string; seconds: number; url: string }[];
  b_roll: { key: string; anchor: string; cut_s: number; url: string }[];
  expires_at: string;
  /** IDs duraderos para renovar enlaces y devolver el final al mismo guion. */
  source?: { script_id: string; artifact_etag: string };
}

export interface PackageInput {
  product: MontagePackage["product"];
  angle: MontagePackage["angle"];
  language: string;
  format?: VideoFormat;
  executionKey?: string;
  script: UgcScript;
  clipUrls: Map<string, string>;
  expiresAt: string;
  source?: MontagePackage["source"];
}

export function openingOf(script: UgcScript): MontagePackage["opening"] {
  const opening = script.opening;
  if (!opening) return null;
  const first = script.b_roll[0];
  return { shot: opening.shot, insert: opensWithInsert(opening.shot) && first && first.keyframe === opening.keyframe ? first.key : null };
}

export class PackageNotReady extends Error {}

/** Solo archivos y datos que consume el montaje: las capas históricas quedan en el guion. */
export function buildPackage(input: PackageInput): MontagePackage {
  const url = (key: string) => {
    const value = input.clipUrls.get(key);
    if (!value) throw new PackageNotReady(`Falta el clip ${key}.`);
    return value;
  };
  return {
    version: PACKAGE_VERSION,
    name: montageName(input.product.title, input.angle.slot, input.format ?? "ugc", input.executionKey),
    product: input.product,
    angle: input.angle,
    format: input.format ?? "ugc",
    language: input.language,
    opening: openingOf(input.script),
    a_roll: input.script.a_roll.map((a) => ({ key: a.key, line: a.line, seconds: a.seconds, url: url(a.key) })),
    b_roll: input.script.b_roll.map((b) => ({ key: b.key, anchor: b.anchor, cut_s: b.cut_s, url: url(b.key) })),
    expires_at: input.expiresAt,
    ...(input.source ? { source: input.source } : {}),
  };
}
