// El puntaje de cada ángulo, calculado en código a partir de la evaluación del orquestador (criterios
// de 0 a 5 y la penalización), con los pesos de agentes-creativos/angle-router.md:
//   fit = Σ(criterio × peso) normalizado a 0–100 − penalización
// Los hechos que se pueden comprobar (hay experto real, hay reseñas reales, sofisticación, fecha real,
// margen del pack) pisan lo que diga el modelo: la IA no inventa pruebas. Puro y con tests.

import { ANGLES, SALES_ANGLES, type SalesAngle } from "./catalog";
import type { AngleEvaluation, AngleRouterOutput } from "./schemas";

/** Lo que el sistema sabe con certeza (ficha, cliente ideal y precio). */
export interface AngleFacts {
  hasRealExpert: boolean;
  hasRealReviews: boolean;
  /** Sofisticación del mercado según el cliente ideal (1–5). */
  sophistication: number;
  hasRealEvent: boolean;
  /** Algún pack de más de 1 unidad gana más que 1 unidad. */
  packEarnsMore: boolean;
}

export interface ScoreFactor {
  label: string;
  value: number;
}

export interface AngleRisk {
  text: string;
  /** Puntos que resta (solo la penalización fuerte). */
  penalty?: number;
  /** Qué dato la resuelve (se agrega en Información base). */
  fix?: "reviews" | "expert";
}

export interface ScoredAngle {
  angle: SalesAngle;
  score: number;
  /** Aportes de cada criterio y la penalización; suman el puntaje. */
  breakdown: ScoreFactor[];
  why: string;
  risks: AngleRisk[];
  /** Tiene hoy la prueba que necesita (experto o reseñas reales). */
  proofReady: boolean;
}

export interface Ranking {
  /** Los 6, de mayor a menor. */
  angles: ScoredAngle[];
  suggested: { primary: SalesAngle; secondary: SalesAngle };
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const SOPHISTICATION_SCORE = [0, 0, 2, 4, 5, 5];

/** Criterios y penalización después de aplicar los hechos comprobables. */
function grounded(angle: SalesAngle, ev: AngleEvaluation, f: AngleFacts): { criteria: Record<string, number>; penalty: boolean } {
  const criteria: Record<string, number> = {};
  for (const c of ANGLES[angle].criteria) criteria[c.key] = clamp(Math.round(Number((ev.criteria as Record<string, number>)[c.key]) || 0), 0, 5);
  let penalty = ev.penalty_applies;
  switch (angle) {
    case "authority":
      if (!f.hasRealExpert) criteria.real_expert = 0;
      penalty = !f.hasRealExpert;
      break;
    case "common_enemy":
      criteria.high_sophistication = SOPHISTICATION_SCORE[clamp(Math.round(f.sophistication), 1, 5)];
      break;
    case "personal_story":
      if (!f.hasRealReviews) criteria.narrative_reviews = 0;
      penalty = !f.hasRealReviews;
      break;
    case "offer":
      if (!f.hasRealEvent) criteria.real_event = 0;
      penalty = penalty || !f.packEarnsMore;
      break;
  }
  return { criteria, penalty };
}

/** Aporte de cada criterio en puntos (redondeados) y la penalización: la suma es el puntaje. */
export function scoreAngle(angle: SalesAngle, criteria: Record<string, number>, penalty: boolean): { score: number; breakdown: ScoreFactor[] } {
  const def = ANGLES[angle];
  const max = 5 * def.criteria.reduce((s, c) => s + c.weight, 0);
  const raw = def.criteria.map((c) => (clamp(Math.round(criteria[c.key] ?? 0), 0, 5) * c.weight * 100) / max);
  // Resto mayor: los aportes enteros suman exactamente el total redondeado (“Cómo se calculó” cuadra).
  const values = raw.map(Math.floor);
  let left = Math.round(raw.reduce((s, v) => s + v, 0)) - values.reduce((s, v) => s + v, 0);
  for (const i of raw.map((v, i) => i).sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a])))) {
    if (left <= 0) break;
    values[i]++;
    left--;
  }
  const breakdown: ScoreFactor[] = def.criteria.map((c, i) => ({ label: c.label, value: values[i] }));
  if (penalty) breakdown.push({ label: def.penalty.label, value: -def.penalty.points });
  const score = clamp(breakdown.reduce((s, b) => s + b.value, 0), 0, 100);
  return { score, breakdown };
}

/**
 * El ranking y la sugerencia. Reglas de desempate del orquestador:
 * - Si los dos primeros están a menos de 5 puntos, gana el que tiene la prueba real hoy.
 * - La oferta rara vez es la principal: si hay otro a menos de 10 puntos, pasa a secundario.
 */
export function rankAngles(output: Pick<AngleRouterOutput, "angles">, facts: AngleFacts): Ranking {
  const scored: ScoredAngle[] = SALES_ANGLES.map((angle) => {
    const ev = output.angles[angle];
    const g = grounded(angle, ev, facts);
    const { score, breakdown } = scoreAngle(angle, g.criteria, g.penalty);
    const def = ANGLES[angle];
    const fix = angle === "personal_story" && !facts.hasRealReviews ? "reviews" : angle === "authority" && !facts.hasRealExpert ? "expert" : undefined;
    const risks: AngleRisk[] = [
      ...(g.penalty ? [{ text: def.penalty.label, penalty: def.penalty.points, fix } as AngleRisk] : []),
      ...ev.risks.filter((r) => r.trim()).slice(0, 3).map((text) => ({ text })),
    ];
    const proofReady = angle === "authority" ? facts.hasRealExpert : angle === "personal_story" ? facts.hasRealReviews : true;
    return { angle, score, breakdown, why: ev.why, risks, proofReady };
  });
  // Orden estable: a igual puntaje, el orden del catálogo.
  const angles = [...scored].sort((a, b) => b.score - a.score || SALES_ANGLES.indexOf(a.angle) - SALES_ANGLES.indexOf(b.angle));

  let [first, second] = angles;
  if (second && first.score - second.score < 5 && !first.proofReady && second.proofReady) [first, second] = [second, first];
  if (first.angle === "offer" && second && first.score - second.score < 10) [first, second] = [second, first];
  const secondary = second && second.angle !== first.angle ? second : angles.find((a) => a.angle !== first.angle)!;
  return { angles, suggested: { primary: first.angle, secondary: secondary.angle } };
}

/**
 * Cuánto subiría un ángulo con la prueba que le falta (para “Para elegir mejor, falta”): la
 * penalización desaparece y el criterio de la prueba se asume en 4 de 5.
 */
export function potentialScore(angle: "authority" | "personal_story", output: Pick<AngleRouterOutput, "angles">): number {
  const key = angle === "authority" ? "real_expert" : "narrative_reviews";
  const criteria = { ...(output.angles[angle].criteria as Record<string, number>), [key]: 4 };
  return scoreAngle(angle, criteria, false).score;
}
