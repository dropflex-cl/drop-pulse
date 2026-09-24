import { describe, expect, it } from "vitest";
import { SALES_ANGLES, type SalesAngle } from "./catalog";
import type { AngleEvaluations } from "./schemas";
import { potentialScore, rankAngles, scoreAngle, type AngleFacts } from "./score";

function evaluation(overrides: Partial<Record<SalesAngle, { criteria?: Record<string, number>; penalty_applies?: boolean; risks?: string[] }>> = {}): AngleEvaluations {
  const base: Record<SalesAngle, Record<string, number>> = {
    authority: { professional_domain: 4, expert_would_use: 4, real_expert: 5 },
    common_enemy: { failed_popular_solution: 3, high_sophistication: 5, attackable_practice: 3 },
    unique_mechanism: { one_line_principle: 5, alternatives_wrong_cause: 4, visualizable: 4 },
    age_identity: { life_stage_problem: 2, recognizable_audience: 2, peer_spokesperson: 3 },
    personal_story: { narrative_reviews: 5, emotional_trigger: 4, medium_consideration: 3 },
    offer: { low_ticket_bundle: 4, impulse_or_consumable: 3, obvious_result: 4, real_event: 5 },
  };
  return Object.fromEntries(
    SALES_ANGLES.map((a) => [
      a,
      { criteria: { ...base[a], ...overrides[a]?.criteria }, penalty_applies: overrides[a]?.penalty_applies ?? false, why: `Por qué ${a}`, risks: overrides[a]?.risks ?? [] },
    ]),
  ) as AngleEvaluations;
}

const FACTS: AngleFacts = { hasRealExpert: false, hasRealReviews: false, sophistication: 4, hasRealEvent: false, packEarnsMore: true };

describe("puntaje de un ángulo", () => {
  it("normaliza a 0–100 con los pesos y el desglose suma el puntaje", () => {
    const { score, breakdown } = scoreAngle("unique_mechanism", { one_line_principle: 5, alternatives_wrong_cause: 5, visualizable: 5 }, false);
    expect(score).toBe(100);
    expect(breakdown.reduce((s, b) => s + b.value, 0)).toBe(100);
    // Pesos 3, 3 y 2 sobre 8: 37,5 + 37,5 + 25 → los aportes enteros siguen sumando 100.
    const mid = scoreAngle("unique_mechanism", { one_line_principle: 4, alternatives_wrong_cause: 3, visualizable: 2 }, true);
    expect(mid.breakdown.at(-1)).toEqual({ label: "Exige promesas de salud sin respaldo", value: -30 });
    expect(mid.score).toBe(mid.breakdown.reduce((s, b) => s + b.value, 0));
  });

  it("nunca baja de 0", () => {
    expect(scoreAngle("authority", { professional_domain: 1, expert_would_use: 0, real_expert: 0 }, true).score).toBe(0);
  });
});

describe("ranking del orquestador", () => {
  it("siempre devuelve los 6 ángulos, de mayor a menor", () => {
    const r = rankAngles(evaluation(), FACTS);
    expect(r.angles.map((a) => a.angle).sort()).toEqual([...SALES_ANGLES].sort());
    for (let i = 1; i < r.angles.length; i++) expect(r.angles[i - 1].score).toBeGreaterThanOrEqual(r.angles[i].score);
  });

  it("sin experto ni reseñas reales castiga autoridad e historia aunque el modelo diga que sí", () => {
    const r = rankAngles(evaluation(), FACTS);
    const authority = r.angles.find((a) => a.angle === "authority")!;
    const story = r.angles.find((a) => a.angle === "personal_story")!;
    expect(authority.risks[0]).toMatchObject({ text: "No hay experto real", penalty: 40, fix: "expert" });
    expect(authority.breakdown.find((b) => b.label === "Hay un experto real")!.value).toBe(0);
    expect(story.risks[0]).toMatchObject({ text: "No hay testimonios reales", penalty: 40, fix: "reviews" });
    expect(r.suggested.primary).not.toBe("authority");
    expect(r.suggested.secondary).not.toBe("personal_story");
  });

  it("con reseñas reales, historia personal no se castiga", () => {
    const r = rankAngles(evaluation(), { ...FACTS, hasRealReviews: true });
    expect(r.angles.find((a) => a.angle === "personal_story")!.risks).toEqual([]);
  });

  it("la sofisticación sale del cliente ideal y la fecha comercial de la ficha", () => {
    const low = rankAngles(evaluation(), { ...FACTS, sophistication: 1 });
    expect(low.angles.find((a) => a.angle === "common_enemy")!.breakdown[1].value).toBe(0);
    const offer = rankAngles(evaluation(), FACTS).angles.find((a) => a.angle === "offer")!;
    expect(offer.breakdown.find((b) => b.label === "Hay una fecha comercial real")!.value).toBe(0);
  });

  it("si ningún pack gana más, la oferta se castiga", () => {
    const offer = rankAngles(evaluation(), { ...FACTS, packEarnsMore: false }).angles.find((a) => a.angle === "offer")!;
    expect(offer.risks[0]).toMatchObject({ penalty: 20 });
  });

  it("la oferta no es principal si otro está a menos de 10 puntos", () => {
    const out = evaluation({
      offer: { criteria: { low_ticket_bundle: 5, impulse_or_consumable: 5, obvious_result: 5 } },
      unique_mechanism: { criteria: { one_line_principle: 5, alternatives_wrong_cause: 5, visualizable: 4 } }, // 95 contra 100
    });
    const r = rankAngles(out, { ...FACTS, hasRealEvent: true });
    expect(r.angles[0].angle).toBe("offer");
    expect(r.suggested).toEqual({ primary: "unique_mechanism", secondary: "offer" });
  });

  it("la fecha comercial la decide la ficha, no el modelo", () => {
    const out = evaluation({ offer: { criteria: { low_ticket_bundle: 5, impulse_or_consumable: 5, obvious_result: 5 } } });
    const offer = (f: AngleFacts) => rankAngles(out, f).angles.find((a) => a.angle === "offer")!.score;
    expect(offer({ ...FACTS, hasRealEvent: true })).toBe(100);
    expect(offer({ ...FACTS, hasRealEvent: false })).toBe(88);
  });

  it("principal y secundario nunca son el mismo", () => {
    const r = rankAngles(evaluation(), FACTS);
    expect(r.suggested.primary).not.toBe(r.suggested.secondary);
  });

  it("dice cuánto subiría historia personal con reseñas reales", () => {
    const out = evaluation();
    expect(potentialScore("personal_story", out)).toBeGreaterThan(rankAngles(out, FACTS).angles.find((a) => a.angle === "personal_story")!.score);
  });
});
