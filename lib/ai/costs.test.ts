import { describe, expect, it } from "vitest";
import { capTone, summarizeAiCost, tokens, when, type GenerationRow } from "./costs";

const row = (p: Partial<GenerationRow>): GenerationRow => ({
  step: "page_copy",
  detail: null,
  model: "claude-opus-5",
  status: "succeeded",
  error_code: null,
  input_tokens: 5000,
  output_tokens: 2000,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  cost_usd: 0.04,
  created_at: "2026-09-24T13:00:00Z",
  ...p,
});

const stages = [
  { key: "importado" as const, title: "Información base" },
  { key: "angulos" as const, title: "Ángulos" },
  { key: "textos" as const, title: "Página del producto" },
  { key: "creativos" as const, title: "Creativos", note: "Necesita los 2 desarrollos aprobados" },
];
const now = new Date("2026-09-24T18:00:00Z");
const base = { currency: "CLP", usdRate: 1000, stages, now, timeZone: "America/Santiago" };

describe("summarizeAiCost", () => {
  it("distingue generar, fallar, reintentar y regenerar por paso y detalle", () => {
    const s = summarizeAiCost(
      [
        row({ created_at: "2026-09-24T12:00:00Z", status: "failed", error_code: "invalid_copy" }),
        row({ created_at: "2026-09-24T12:01:00Z" }),
        row({ created_at: "2026-09-24T12:05:00Z" }),
        row({ step: "angle_brief", detail: "Transformación", created_at: "2026-09-23T20:00:00Z" }),
        row({ step: "angle_brief", detail: "Autoridad", created_at: "2026-09-23T20:00:01Z" }),
      ],
      base,
    );
    // Más reciente primero.
    expect(s.runs.map((r) => r.kind)).toEqual(["regen", "retry", "fail", "gen", "gen"]);
    expect(s.runs[2].what).toBe("Página del producto (no cumplía las reglas)");
    expect(s.runs[3].what).toBe("Desarrollo · Autoridad");
    expect(s.runs[0].when).toBe("hoy 09:05");
    expect(s.runs[4].when).toBe("ayer 17:00");
  });

  it("suma por etapa en la moneda de la tienda, con reintentos y etapas sin uso", () => {
    const s = summarizeAiCost(
      [
        row({ status: "failed", error_code: "invalid_copy", cost_usd: 0.03 }),
        row({ created_at: "2026-09-24T13:01:00Z" }),
        row({ step: "customer_avatar", cost_usd: 0.05 }),
        // Una caída de red no se cobró.
        row({ step: "product_brief", status: "failed", error_code: "network", cost_usd: null, input_tokens: null, output_tokens: null }),
      ],
      base,
    );
    expect(s.totalUsd).toBeCloseTo(0.12);
    expect(s.total).toBeCloseTo(120);
    expect(s.generations).toBe(4);
    const [info, angles, copy, creatives] = s.stages;
    expect(info).toMatchObject({ label: "Información base", runs: 2 });
    expect(info.cost).toBeCloseTo(50);
    expect(copy).toMatchObject({ runs: 2, retries: 1 });
    expect(angles).toMatchObject({ cost: 0, note: "Sin uso aún" });
    expect(creatives.note).toBe("Necesita los 2 desarrollos aprobados");
    expect(s.runs.find((r) => r.what.startsWith("Ficha"))?.cost).toBeUndefined();
  });

  it("da contexto con la ganancia por venta solo al comerciante", () => {
    const rows = [row({ cost_usd: 0.387 })];
    expect(summarizeAiCost(rows, { ...base, profit: 8590 }).context).toBe("Equivale al 4,5% de lo que ganas en una venta ($8.590).");
    expect(summarizeAiCost(rows, base).context).toBeNull();
    const admin = summarizeAiCost(rows, { ...base, profit: 8590, admin: true });
    expect(admin.context).toBeNull();
    expect(admin.audience).toBe("admin");
    expect(admin.runs[0]).toMatchObject({ model: "opus-5", tokens: "7,0k tok" });
    expect(admin.stages[2].tokens).toBe("7,0k tok");
    expect(summarizeAiCost(rows, base).runs[0].model).toBeUndefined();
  });

  it("sin generaciones: total cero y todas las etapas sin uso", () => {
    const s = summarizeAiCost([], { ...base, cap: 1500 });
    expect(s).toMatchObject({ total: 0, generations: 0, runs: [], cap: 1500 });
    expect(s.stages.every((st) => st.cost === 0)).toBe(true);
  });
});

describe("estimados por paso", () => {
  it("usa el promedio pagado del producto y, sin historial, la referencia", () => {
    const s = summarizeAiCost(
      [
        row({ step: "angle_ranking", cost_usd: 0.1 }),
        row({ step: "angle_ranking", cost_usd: 0.2, created_at: "2026-09-24T13:01:00Z" }),
        // Un fallo sin cobro no baja el promedio.
        row({ step: "angle_ranking", status: "failed", error_code: "network", cost_usd: null, created_at: "2026-09-24T13:02:00Z" }),
      ],
      base,
    );
    expect(s.estimates.angle_ranking).toBeCloseTo(150);
    expect(s.estimates.angle_brief).toBeCloseTo(300);
  });
});

describe("capTone", () => {
  it("avisa desde el 80% y marca sobre el tope", () => {
    expect(capTone(387, 1500)).toBe("ok");
    expect(capTone(1290, 1500)).toBe("warn");
    expect(capTone(1620, 1500)).toBe("over");
    expect(capTone(99999)).toBe("ok");
  });
});

describe("formato", () => {
  it("tokens", () => {
    expect(tokens(850)).toBe("850 tok");
    expect(tokens(18_234)).toBe("18,2k tok");
  });
  it("fecha fuera de hoy y ayer", () => {
    expect(when("2026-09-12T21:02:00Z", now, "America/Santiago")).toBe("12 sep 18:02");
  });
});
