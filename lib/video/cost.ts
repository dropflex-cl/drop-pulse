// Costo del video UGC antes de gastar (docs/spec-video-ugc.md §4). Seedance cobra por tokens de
// video; Kling y Flare, por pieza. Puro.

import { A_ROLL_SIZE, KEYFRAME_COST_USD, KLING_TURBO_5S_USD, SEEDANCE_USD_PER_1K_TOKENS } from "./catalog";
import type { UgcScript } from "./schemas";

/** Tokens = ceil(ancho × alto × segundos × 24 / 1024) (docs de Higgsfield, 2026-09-25). */
export function seedanceCostUsd(seconds: number, width = A_ROLL_SIZE.width, height = A_ROLL_SIZE.height): number {
  const tokens = Math.ceil((width * height * seconds * 24) / 1024);
  return (tokens / 1000) * SEEDANCE_USD_PER_1K_TOKENS;
}

export interface VideoCost {
  keyframes: number;
  clips: number;
  total: number;
}

/** Lo que cuesta el guion completo: imágenes clave, tomas habladas y B-roll. */
export function scriptCost(s: Pick<UgcScript, "keyframes" | "a_roll" | "b_roll">): VideoCost {
  const keyframes = s.keyframes.length * KEYFRAME_COST_USD;
  const clips = s.a_roll.reduce((n, a) => n + seedanceCostUsd(a.seconds), 0) + s.b_roll.length * KLING_TURBO_5S_USD;
  return { keyframes, clips, total: keyframes + clips };
}

/** El costo de una toma suelta (para «Generar de nuevo»). */
export function shotCost(kind: "keyframe" | "a_roll" | "b_roll", seconds?: number): number {
  if (kind === "keyframe") return KEYFRAME_COST_USD;
  if (kind === "b_roll") return KLING_TURBO_5S_USD;
  return seedanceCostUsd(seconds ?? 6);
}
