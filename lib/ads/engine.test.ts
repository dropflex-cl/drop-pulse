import { describe, expect, it } from "vitest";
import { autoAllowed, evaluateUnit, evaluateWinners, ruleSentence, type DayMetrics, type EngineContext, type EngineUnit } from "./engine";
import { buildPreset } from "./presets";
import { engineSchema, type EngineConfig } from "./schemas";

// Casos del material (docs/spec-anuncios.md §5.3). CPA límite $6.000, Chile, conjuntos de $5.000.
const TZ = "America/Santiago";
const NOW = new Date("2026-09-23T15:00:00Z"); // 12:00 en Chile (UTC−3)
const ctx: EngineContext = { now: NOW, timeZone: TZ, currency: "CLP", dailyTotal: 10_000 };
const ABO = { pause: true, scale: true };

const impulso = (): EngineConfig =>
  buildPreset("impulso", { country: "CL", currency: "CLP", cpaLimit: 6000, creatives: [], texts: { primary_texts: ["a"], headlines: ["b"], description: "" } }).engine;

const day = (date: string, m: Partial<DayMetrics> = {}): DayMetrics => ({ date, spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, purchase_value: 0, initiated_checkouts: 0, ...m });

function unit(p: Partial<EngineUnit> = {}): EngineUnit {
  return { id: "set-1", level: "adset", name: "Conjunto 1", active: true, budget: 5000, startedAt: "2026-09-19T09:00:00Z", lastChangedAt: null, days: [], ...p };
}

describe("reglas de Impulso", () => {
  it("valida contra el esquema", () => {
    expect(engineSchema.safeParse(impulso()).success).toBe(true);
  });

  it("espera mientras no gastó 1× el CPA ni pasaron 24 h, y muestra cuánto falta", () => {
    const d = evaluateUnit(unit({ startedAt: "2026-09-23T09:00:00Z", days: [day("2026-09-23", { spend: 3700, purchases: 1 })] }), impulso(), ctx, ABO);
    expect(d.verdict).toBe("wait");
    expect(d.ruleId).toBe("wait-spend");
    expect(d.reason).toBe("Falta gastar $2.300 para decidir (62 % de 1× CPA).");
    expect(d.progress).toBeCloseTo(0.62, 2);
  });

  it("pausa al gastar las cinco lucas… (1× el CPA) sin venta", () => {
    const d = evaluateUnit(unit({ days: [day("2026-09-22", { spend: 6100 })] }), impulso(), ctx, ABO);
    expect(d.verdict).toBe("pause");
    expect(d.ruleId).toBe("pause-no-sales");
    expect(d.reason).toContain("sin ventas");
  });

  it("nunca pausa por un día malo: el CPA alto debe sostenerse 3 días completos", () => {
    const oneBadDay = unit({ startedAt: "2026-09-21T09:00:00Z", days: [day("2026-09-21", { spend: 5000, purchases: 1 }), day("2026-09-22", { spend: 9000, purchases: 1 })] });
    expect(evaluateUnit(oneBadDay, impulso(), ctx, ABO).verdict).toBe("keep");

    const threeBad = unit({ days: [day("2026-09-20", { spend: 8000, purchases: 1 }), day("2026-09-21", { spend: 7000, purchases: 1 }), day("2026-09-22", { spend: 7500, purchases: 1 })] });
    const d = evaluateUnit(threeBad, impulso(), ctx, ABO);
    expect(d.verdict).toBe("pause");
    expect(d.ruleId).toBe("pause-cpa");
  });

  it("escala +20 % con CPA ≤ 0,7× por 3 días y 2 ventas", () => {
    const d = evaluateUnit(unit({ days: [day("2026-09-20", { spend: 5000, purchases: 2 }), day("2026-09-21", { spend: 5000, purchases: 2 }), day("2026-09-22", { spend: 5000, purchases: 1 })] }), impulso(), ctx, ABO);
    expect(d.verdict).toBe("scale");
    expect(d.suggestedBudget).toBe(6000);
    expect(d.reason).toContain("50 % bajo tu límite");
  });

  it("no escala dos veces dentro de las 72 h tras un cambio (esperar manda)", () => {
    const days = [day("2026-09-20", { spend: 5000, purchases: 2 }), day("2026-09-21", { spend: 5000, purchases: 2 }), day("2026-09-22", { spend: 5000, purchases: 2 })];
    const d = evaluateUnit(unit({ days, lastChangedAt: "2026-09-22T15:00:00Z" }), impulso(), ctx, ABO);
    expect(d.verdict).toBe("wait");
    expect(d.ruleId).toBe("wait-change");
    expect(d.reason).toBe("Cambió hace 24 h: espera 48 h más para decidir.");
  });

  it("no pasa del tope diario de la campaña", () => {
    const engine = impulso();
    const days = [day("2026-09-20", { spend: 5000, purchases: 2 }), day("2026-09-21", { spend: 5000, purchases: 2 }), day("2026-09-22", { spend: 5000, purchases: 2 })];
    const capped = evaluateUnit(unit({ days }), engine, { ...ctx, dailyTotal: 59_000 }, ABO);
    expect(capped.verdict).toBe("scale");
    expect(capped.suggestedBudget).toBe(6000);
    const full = evaluateUnit(unit({ days }), engine, { ...ctx, dailyTotal: 60_000 }, ABO);
    expect(full.verdict).toBe("keep");
    expect(full.reason).toContain("tope diario");
  });

  it("en CBO un anuncio solo se pausa; la campaña solo escala", () => {
    const ad = unit({ level: "ad", budget: null, days: [day("2026-09-22", { spend: 6100 })] });
    expect(evaluateUnit(ad, impulso(), ctx, { pause: true, scale: false }).verdict).toBe("pause");
    const good = [day("2026-09-20", { spend: 5000, purchases: 2 }), day("2026-09-21", { spend: 5000, purchases: 2 }), day("2026-09-22", { spend: 5000, purchases: 2 })];
    expect(evaluateUnit(unit({ level: "campaign", days: good }), impulso(), ctx, { pause: false, scale: true }).verdict).toBe("scale");
  });

  it("lo pausado queda pausado", () => {
    const d = evaluateUnit(unit({ active: false, days: [day("2026-09-22", { spend: 9000 })] }), impulso(), ctx, ABO);
    expect(d).toMatchObject({ verdict: "keep", paused: true });
  });

  it("CTR bajo es una señal apagada por defecto; encendida pausa solo sin ventas", () => {
    const low = unit({ days: [day("2026-09-22", { spend: 2000, impressions: 2000, clicks: 10 })], startedAt: "2026-09-20T09:00:00Z" });
    expect(evaluateUnit(low, impulso(), ctx, ABO).verdict).toBe("keep");
    const on = impulso();
    on.rules = on.rules.map((r) => (r.type === "low_ctr" ? { ...r, enabled: true } : r));
    expect(evaluateUnit(low, on, ctx, ABO)).toMatchObject({ verdict: "pause", ruleId: "pause-ctr" });
  });
});

describe("variantes", () => {
  it("Pancho: pagos iniciados sin compra tras 24 h se pausan", () => {
    const engine = buildPreset("pancho", { country: "CL", currency: "CLP", cpaLimit: 6000, creatives: [], texts: { primary_texts: ["a"], headlines: ["b"], description: "" } }).engine;
    const d = evaluateUnit(unit({ firstCheckoutAt: "2026-09-22T10:00:00Z", days: [day("2026-09-22", { spend: 3000, initiated_checkouts: 2 })] }), engine, ctx, ABO);
    expect(d).toMatchObject({ verdict: "pause", ruleId: "pause-intent" });
  });

  it("GEM y ganadores: no se decide antes de 3 días completos", () => {
    const engine = buildPreset("cbo-winners", { country: "CL", currency: "CLP", cpaLimit: 6000, creatives: [], texts: { primary_texts: ["a"], headlines: ["b"], description: "" } }).engine;
    const d = evaluateUnit(unit({ startedAt: "2026-09-21T09:00:00Z", days: [day("2026-09-21", { spend: 40000 })] }), engine, ctx, ABO);
    expect(d).toMatchObject({ verdict: "wait", ruleId: "wait-days", reason: "Lleva 2 días completos: falta 1 día para decidir." });
  });
});

describe("ganadores → CBO", () => {
  const good = [day("2026-09-20", { spend: 5000, purchases: 2 }), day("2026-09-21", { spend: 5000, purchases: 2 }), day("2026-09-22", { spend: 5000, purchases: 2 })];
  it("sugiere la CBO con 3 conjuntos ganadores", () => {
    const sets = [unit({ id: "a", days: good }), unit({ id: "b", days: good }), unit({ id: "c", days: good }), unit({ id: "d" })];
    const d = evaluateWinners(unit({ id: "camp", level: "campaign", budget: null }), sets, impulso(), ctx);
    expect(d).toMatchObject({ verdict: "winners", suggestedBudget: 40000, winners: ["a", "b", "c"] });
  });
  it("con 2 no sugiere nada", () => {
    expect(evaluateWinners(unit({ id: "camp", level: "campaign" }), [unit({ id: "a", days: good }), unit({ id: "b", days: good })], impulso(), ctx)).toBeNull();
  });
});

describe("modo automático", () => {
  const days = [day("2026-09-20", { spend: 5000, purchases: 2 }), day("2026-09-21", { spend: 5000, purchases: 2 }), day("2026-09-22", { spend: 5000, purchases: 2 })];
  it("solo en modo auto, dentro del +30 % y del tope", () => {
    const engine = impulso();
    const u = unit({ days });
    const d = evaluateUnit(u, engine, ctx, ABO);
    expect(autoAllowed(d, u, engine, ctx)).toBe(false);
    engine.mode = "auto";
    expect(autoAllowed(d, u, engine, ctx)).toBe(true);
    expect(autoAllowed({ ...d, suggestedBudget: 7000 }, u, engine, ctx)).toBe(false);
  });
});

describe("frases", () => {
  it("escribe las reglas como en el diseño", () => {
    const rules = impulso().rules;
    expect(ruleSentence(rules[0], "CLP")).toBe("No decidir antes de gastar 1× el CPA límite o de 24 h");
    expect(ruleSentence(rules.find((r) => r.id === "scale-cpa")!, "CLP")).toBe("Escalar si el CPA es ≤ 0,7× el límite por 3 días con 2 ventas: +20 % cada 72 h");
    expect(ruleSentence(rules.find((r) => r.id === "scale-cap")!, "CLP")).toBe("Nunca pasar de $60.000 diarios");
  });
});
