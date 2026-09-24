import { describe, expect, it } from "vitest";
import { anglesPhase, basePhase, copyPhase, productPosition, type AngleFacts, type CopyFacts, type CreativeFacts } from "./stages";

const base = { price: 24990, currency: "CLP" };

describe("productPosition", () => {
  it("un producto recién importado abre en Información base (ahí se define también el precio)", () => {
    const p = productPosition(base);
    expect(p.phase).toBe("new");
    expect(p.nextStage).toBe("importado");
    expect(p.stages.map((s) => s.state)).toEqual(["current", "available", "locked", "locked", "locked", "locked", "locked", "locked"]);
    expect(p.stages.find((s) => s.key === "angulos")).toMatchObject({ desc: "Se habilita al aprobar tu cliente ideal" });
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
    expect(p.stages[2]).toMatchObject({ key: "angulos", state: "current" });
    expect(p.stages.find((s) => s.key === "textos")).toMatchObject({ state: "locked", desc: "Se habilita al aprobar los 2 desarrollos" });
    expect(p.stages.map((s) => s.key)).not.toContain("precio");
    expect(p.meter).toHaveLength(8);
  });

  it("Reseñas es opcional, va después de Información base y dice cuántas esperan", () => {
    const keys = productPosition(base).stages.map((s) => s.key);
    expect(keys.slice(0, 4)).toEqual(["importado", "resenas", "angulos", "textos"]);
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
    expect(failed.stages[2]).toMatchObject({ state: "error", desc: "La IA no respondió." });
  });

  it("confirmados: desarrollando, por revisar y listos", () => {
    const ranking = { status: "succeeded" as const, confirmed: true };
    expect(anglesPhase(facts({ ranking, briefs: [brief("primary", "generado", "running"), brief("secondary", "generado")] }))).toBe("developing");
    const review = productPosition(facts({ ranking, briefs: [brief("primary", "aprobado"), brief("secondary", "generado")] }));
    expect(review.stages[2]).toMatchObject({ state: "review", desc: "1 de 2 desarrollos aprobados" });
    const done = productPosition(facts({ ranking, briefs: [brief("primary", "aprobado"), brief("secondary", "aprobado")] }));
    expect(done.nextStage).toBe("textos");
    expect(done.stages[2]).toMatchObject({ state: "done", desc: "Mecanismo único + Oferta" });
    expect(done.stages[3]).toMatchObject({ key: "textos", state: "current" });
  });

  it("un desarrollo fallido detiene la etapa con su motivo", () => {
    const p = productPosition(facts({ ranking: { status: "succeeded", confirmed: true }, briefs: [{ ...brief("primary", "generado", "failed"), error: "La IA no respondió." }, brief("secondary", "generado")] }));
    expect(p.anglesPhase).toBe("failed");
    expect(p.stages[2].desc).toBe("La IA no respondió.");
  });
});

describe("página del producto (Textos)", () => {
  const ready = {
    price: 24990,
    currency: "CLP",
    avatar: { status: "aprobado" as const, createdAt: "2026-09-24T10:01:00Z" },
    angles: {
      ranking: { status: "succeeded" as const, confirmed: true },
      briefs: [
        { role: "primary" as const, name: "Mecanismo único", status: "aprobado" as const, generation: "succeeded" as const },
        { role: "secondary" as const, name: "Oferta", status: "aprobado" as const, generation: "succeeded" as const },
      ],
    },
  };
  const progress = (p: Partial<CopyFacts["progress"]>) => ({ total: 14, approved: 0, pending: 14, missing: [], complete: false, ...p });

  it("bloqueada hasta aprobar los 2 desarrollos; después, por escribir", () => {
    const locked = productPosition({ ...ready, angles: { ...ready.angles, briefs: [ready.angles.briefs[0]] } });
    expect(locked.stages[3]).toMatchObject({ key: "textos", title: "Página del producto", state: "locked", desc: "Se habilita al aprobar los 2 desarrollos" });
    const fresh = productPosition(ready);
    expect(fresh.copyPhase).toBe("new");
    expect(fresh).toMatchObject({ nextStage: "textos", reason: "Siguiente: página del producto" });
  });

  it("escribiendo, con error y por revisar", () => {
    expect(copyPhase({ ...ready, copy: { run: { status: "running" }, progress: progress({ total: 0, pending: 0 }) } }, "done")).toBe("writing");
    const failed = productPosition({ ...ready, copy: { run: { status: "failed", error: "La IA no respondió." }, progress: progress({ total: 0, pending: 0 }) } });
    expect(failed.stages[3]).toMatchObject({ state: "error", desc: "La IA no respondió." });
    expect(failed.filter).toBe("detenidos");
    const review = productPosition({ ...ready, copy: { run: { status: "succeeded" }, progress: progress({ approved: 8, pending: 6 }) } });
    expect(review.stages[3]).toMatchObject({ state: "review", desc: "8 de 14 aceptados" });
    expect(review.reason).toBe("Espera tu revisión · página del producto");
    // Una reescritura que falla con bloques escritos no tapa la revisión.
    expect(copyPhase({ ...ready, copy: { run: { status: "failed" }, progress: progress({ approved: 8, pending: 6 }) } }, "done")).toBe("review");
  });

  it("sin pendientes pero con un obligatorio por aprobar, sigue en revisión", () => {
    const p = productPosition({ ...ready, copy: { run: { status: "succeeded" }, progress: progress({ approved: 13, pending: 0, missing: ["Envío y pago"] }) } });
    expect(p.stages[3]).toMatchObject({ state: "review", desc: "Falta aprobar Envío y pago" });
  });

  it("lista: habilita Imágenes", () => {
    const done = productPosition({ ...ready, copy: { run: { status: "succeeded" }, progress: progress({ approved: 13, pending: 0, complete: true }) } });
    expect(done.stages[3]).toMatchObject({ state: "done", desc: "13 de 14 aceptados" });
    expect(done.stages[4]).toMatchObject({ key: "imagenes", state: "current" });
    expect(done).toMatchObject({ nextStage: "imagenes", reason: "Siguiente: imágenes" });
    expect(done.meter.slice(3, 5)).toEqual(["done", "current"]);
  });
});

describe("Creativos (etapa opcional, docs/spec-creativos.md §6.5)", () => {
  const ready = {
    ...base,
    avatar: { status: "aprobado" as const, createdAt: "2026-09-24T10:01:00Z" },
    angles: {
      ranking: { status: "succeeded" as const, confirmed: true },
      briefs: [
        { role: "primary" as const, name: "Mecanismo único", status: "aprobado" as const, generation: "succeeded" as const },
        { role: "secondary" as const, name: "Oferta", status: "aprobado" as const, generation: "succeeded" as const },
      ],
    },
  };
  const facts = (c: Partial<CreativeFacts> = {}): CreativeFacts => ({ connected: true, running: false, concepts: 0, rendering: 0, pending: 0, approved: 0, ...c });
  const stage = (f: Parameters<typeof productPosition>[0]) => {
    const p = productPosition(f);
    const i = p.stages.findIndex((s) => s.key === "creativos");
    return { ...p.stages[i], meter: p.meter[i], position: p };
  };

  it("va entre Publicar y Anuncios y es opcional", () => {
    const keys = productPosition(base).stages.map((s) => s.key);
    expect(keys.slice(-3)).toEqual(["publicar", "creativos", "anuncios"]);
    expect(stage(base)).toMatchObject({ optional: true, state: "locked", desc: "Después de aprobar los ángulos", meter: "optional" });
  });

  it("con los ángulos aprobados pide la clave de Higgsfield, y después se habilita", () => {
    expect(stage({ ...ready, creatives: facts({ connected: false }) })).toMatchObject({ state: "locked", desc: "Conecta Higgsfield en Ajustes" });
    expect(stage({ ...ready, creatives: facts() })).toMatchObject({ state: "available", desc: "Anuncios de imagen terminados con IA" });
  });

  it("dice qué está pasando y cuántas piezas esperan tu decisión", () => {
    expect(stage({ ...ready, creatives: facts({ running: true }) })).toMatchObject({ state: "current", desc: "La IA está pensando tus anuncios" });
    expect(stage({ ...ready, creatives: facts({ concepts: 6, rendering: 3 }) })).toMatchObject({ state: "current", desc: "Generando 3 imágenes" });
    expect(stage({ ...ready, creatives: facts({ concepts: 6, pending: 2, approved: 1 }) })).toMatchObject({ state: "review", desc: "2 por revisar", meter: "review" });
    expect(stage({ ...ready, creatives: facts({ concepts: 6, approved: 1 }) })).toMatchObject({ state: "done", desc: "1 anuncio aprobado", meter: "done" });
  });

  it("nunca cambia la siguiente etapa: Publicar no depende de ella", () => {
    const withCreatives = stage({ ...ready, creatives: facts({ concepts: 6, pending: 4 }) }).position;
    expect(withCreatives.nextStage).toBe(productPosition(ready).nextStage);
    expect(withCreatives.filter).toBe(productPosition(ready).filter);
  });
});
