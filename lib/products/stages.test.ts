import { describe, expect, it } from "vitest";
import { anglesPhase, basePhase, productPosition, type AngleFacts } from "./stages";

const base = { price: 24990, currency: "CLP" };

describe("productPosition", () => {
  it("un producto recién importado abre en Información base (ahí se define también el precio)", () => {
    const p = productPosition(base);
    expect(p.phase).toBe("new");
    expect(p.nextStage).toBe("importado");
    expect(p.stages.map((s) => s.state)).toEqual(["current", "locked", "locked", "locked", "locked", "locked"]);
    expect(p.stages[1]).toMatchObject({ key: "angulos", desc: "Se habilita al aprobar tu cliente ideal" });
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

  const approved = { ...base, avatar: { status: "aprobado" as const, createdAt: "2026-09-24T10:01:00Z" } };

  it("aprobado el cliente ideal, sigue Ángulos (el precio ya se definió en Información base)", () => {
    const p = productPosition(approved);
    expect(p.nextStage).toBe("angulos");
    expect(p.stages[0].state).toBe("done");
    expect(p.stages[1]).toMatchObject({ key: "angulos", state: "current" });
    expect(p.stages.find((s) => s.key === "textos")).toMatchObject({ state: "locked", desc: "Se habilita al aprobar los 2 desarrollos" });
    expect(p.stages.map((s) => s.key)).not.toContain("precio");
    expect(p.meter).toHaveLength(6);
  });
});

describe("etapa Ángulos", () => {
  const approved = { price: 24990, currency: "CLP", avatar: { status: "aprobado" as const, createdAt: "2026-09-24T10:01:00Z" } };
  const brief = (role: "primary" | "secondary", status: "generado" | "aprobado", generation: "running" | "succeeded" | "failed" = "succeeded") => ({
    role,
    name: role === "primary" ? "Mecanismo único" : "Oferta",
    status,
    generation,
  });
  const facts = (angles: AngleFacts) => ({ ...approved, angles });

  it("bloqueada hasta aprobar el cliente ideal", () => {
    expect(anglesPhase({ ...approved, avatar: { status: "revision", createdAt: "2026-09-24T10:01:00Z" } })).toBe("locked");
  });

  it("evaluando, por elegir y con error", () => {
    expect(anglesPhase(facts({ ranking: { status: "running", confirmed: false }, briefs: [] }))).toBe("evaluating");
    const choose = productPosition(facts({ ranking: { status: "succeeded", confirmed: false }, briefs: [] }));
    expect(choose.anglesPhase).toBe("choose");
    expect(choose).toMatchObject({ filter: "detenidos", reason: "Espera tu elección · ángulos", status: "revision" });
    const failed = productPosition(facts({ ranking: { status: "failed", error: "La IA no respondió.", confirmed: false }, briefs: [] }));
    expect(failed.stages[1]).toMatchObject({ state: "error", desc: "La IA no respondió." });
  });

  it("confirmados: desarrollando, por revisar y listos", () => {
    const ranking = { status: "succeeded" as const, confirmed: true };
    expect(anglesPhase(facts({ ranking, briefs: [brief("primary", "generado", "running"), brief("secondary", "generado")] }))).toBe("developing");
    const review = productPosition(facts({ ranking, briefs: [brief("primary", "aprobado"), brief("secondary", "generado")] }));
    expect(review.stages[1]).toMatchObject({ state: "review", desc: "1 de 2 desarrollos aprobados" });
    const done = productPosition(facts({ ranking, briefs: [brief("primary", "aprobado"), brief("secondary", "aprobado")] }));
    expect(done.nextStage).toBe("textos");
    expect(done.stages[1]).toMatchObject({ state: "done", desc: "Mecanismo único + Oferta" });
    expect(done.stages[2].state).toBe("current");
  });

  it("un desarrollo fallido detiene la etapa con su motivo", () => {
    const p = productPosition(facts({ ranking: { status: "succeeded", confirmed: true }, briefs: [{ ...brief("primary", "generado", "failed"), error: "La IA no respondió." }, brief("secondary", "generado")] }));
    expect(p.anglesPhase).toBe("failed");
    expect(p.stages[1].desc).toBe("La IA no respondió.");
  });
});
