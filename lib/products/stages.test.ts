import { describe, expect, it } from "vitest";
import { basePhase, productPosition } from "./stages";

const base = { price: 24990, currency: "CLP" };

describe("productPosition", () => {
  it("un producto recién importado abre en Información base (ahí se define también el precio)", () => {
    const p = productPosition(base);
    expect(p.phase).toBe("new");
    expect(p.nextStage).toBe("importado");
    expect(p.stages.map((s) => s.state)).toEqual(["current", "available", "locked", "locked", "locked", "locked"]);
    expect(p.summary).toBe("Importado de Shopify · sin optimizar · $24.990");
    expect(p.status).toBeUndefined();
  });

  it("optimizando mientras la corrida está activa", () => {
    expect(basePhase({ ...base, run: { status: "running", createdAt: "2026-09-24T10:00:00Z" } })).toBe("optimizing");
  });

  it("una corrida fallida muestra el error y queda detenido", () => {
    const p = productPosition({ ...base, run: { status: "failed", error: "La IA no respondió.", createdAt: "2026-09-24T10:00:00Z" } });
    expect(p.phase).toBe("failed");
    expect(p.stages[0].desc).toBe("La IA no respondió.");
    expect(p.filter).toBe("detenidos");
  });

  it("un cliente ideal por revisar pide la decisión del comerciante", () => {
    const p = productPosition({
      ...base,
      run: { status: "succeeded", createdAt: "2026-09-24T10:00:00Z" },
      avatar: { status: "generado", createdAt: "2026-09-24T10:01:00Z" },
    });
    expect(p.phase).toBe("review");
    expect(p.status).toBe("revision");
  });

  it("si una regeneración falla, sigue valiendo la propuesta anterior solo si es más nueva que la corrida", () => {
    expect(
      basePhase({ ...base, run: { status: "failed", createdAt: "2026-09-24T11:00:00Z" }, avatar: { status: "aprobado", createdAt: "2026-09-24T10:00:00Z" } }),
    ).toBe("failed");
  });

  it("aprobado: siguen los textos (el precio ya se definió en Información base)", () => {
    const p = productPosition({ ...base, avatar: { status: "aprobado", createdAt: "2026-09-24T10:01:00Z" } });
    expect(p.nextStage).toBe("textos");
    expect(p.stages[0].state).toBe("done");
    expect(p.stages.find((s) => s.key === "textos")!.state).toBe("current");
    expect(p.stages.map((s) => s.key)).not.toContain("precio");
    expect(p.meter).toHaveLength(6);
  });

  it("Reseñas es opcional, va después de Información base y dice cuántas esperan", () => {
    const keys = productPosition(base).stages.map((s) => s.key);
    expect(keys.slice(0, 3)).toEqual(["importado", "resenas", "textos"]);
    const pending = productPosition({ ...base, reviews: { pending: 14, approved: 30, total: 48 } });
    const stage = pending.stages.find((s) => s.key === "resenas")!;
    expect(stage).toMatchObject({ state: "review", optional: true, desc: "14 por revisar" });
    expect(pending.meter[1]).toBe("review");
    // Nunca bloquea: el siguiente paso sigue siendo Información base.
    expect(pending.nextStage).toBe("importado");
    const done = productPosition({ ...base, reviews: { pending: 0, approved: 30, total: 34 } });
    expect(done.stages[1]).toMatchObject({ state: "done", desc: "30 aprobadas" });
  });
});
