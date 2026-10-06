import { describe, expect, it } from "vitest";
import { anglesPhase, anglesReady, basePhase, copyPhase, productPosition, type AngleFacts, type CopyFacts, type CreativeFacts } from "./stages";

const base = { price: 24990, currency: "CLP" };

const ready = { price: 24990, currency: "CLP", base: { described: true, priced: true } };

describe("productPosition", () => {
  it("un producto recién importado abre en Información base (ahí se define también el precio)", () => {
    const p = productPosition(base);
    expect(p.phase).toBe("new");
    expect(p.nextStage).toBe("importado");
    expect(p.stages.map((s) => s.state)).toEqual(["current", "available", "locked", "locked", "locked", "locked", "locked", "locked", "locked"]);
    expect(p.stages[0]).toMatchObject({ desc: "Identifica el producto y guarda el precio" });
    expect(p.stages.find((s) => s.key === "angulos")).toMatchObject({ title: "Estrategia", desc: "Se habilita con los datos del producto y el precio" });
    expect(p.summary).toBe("Importado de Shopify · sin estrategia · $24.990");
    expect(p.status).toBeUndefined();
  });

  it("Información base dice qué falta: los datos del producto o el precio", () => {
    expect(productPosition({ ...base, base: { described: false, priced: true } }).stages[0].desc).toBe("Falta identificar el producto");
    const noPrice = productPosition({ ...base, base: { described: true, priced: false } });
    expect(noPrice.stages[0].desc).toBe("Falta guardar el precio y los packs");
    expect(noPrice.reason).toBe("Falta el precio y los packs");
  });

  it("con los datos y el precio, sigue Estrategia", () => {
    const p = productPosition(ready);
    expect(p.nextStage).toBe("angulos");
    expect(p.stages[0]).toMatchObject({ state: "done", desc: "Datos del producto · precio y packs listos" });
    expect(p.stages[2]).toMatchObject({ key: "angulos", state: "current", desc: "Define la estrategia desde el chat" });
    expect(p.stages.find((s) => s.key === "textos")).toMatchObject({ state: "locked", desc: "Se habilita al elegir los ángulos de la estrategia" });
    expect(p.stages.map((s) => s.key)).not.toContain("precio");
    expect(p.meter).toHaveLength(9);
  });

  it("Reseñas es opcional, va después de Información base y dice cuántas esperan", () => {
    const keys = productPosition(base).stages.map((s) => s.key);
    expect(keys.slice(0, 6)).toEqual(["importado", "resenas", "angulos", "imagenes", "textos", "publicar"]);
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

describe("etapa Estrategia", () => {
  const brief = (slot: 1 | 2 | 3, status: "generado" | "aprobado" = "aprobado") => ({ slot, name: ["", "La crema sella", "Tengo 38", "Lleva 3"][slot], status, generation: "succeeded" as const });
  const chosen = (n: 2 | 3): AngleFacts => ({ ranking: { status: "succeeded", confirmed: true, chosen: n }, briefs: ([1, 2, 3] as const).slice(0, n).map((s) => brief(s)) });

  it("bloqueada hasta tener los datos del producto y el precio", () => {
    expect(anglesPhase({ ...base, base: { described: true, priced: false } })).toBe("locked");
    expect(basePhase({ ...base, base: { described: false, priced: true } })).toBe("new");
  });

  it("escribiendo, por elegir y con error", () => {
    expect(anglesPhase({ ...ready, strategy: { status: "running", confirmed: false } })).toBe("evaluating");
    const choose = productPosition({ ...ready, strategy: { status: "succeeded", confirmed: false } });
    expect(choose.anglesPhase).toBe("choose");
    expect(choose).toMatchObject({ filter: "detenidos", reason: "Espera tu elección · estrategia", status: "revision" });
    expect(choose.stages[2]).toMatchObject({ state: "review", desc: "Estrategia lista · elige 2 o 3 ángulos" });
    const failed = productPosition({ ...ready, strategy: { status: "failed", error: "La IA no respondió.", confirmed: false } });
    expect(failed.stages[2]).toMatchObject({ state: "error", desc: "La IA no respondió." });
    expect(failed.reason).toBe("Estrategia: no se pudo · reintenta");
  });

  it("con 2 o 3 ángulos elegidos y aprobados, sigue Imágenes", () => {
    const done = productPosition({ ...ready, strategy: { status: "succeeded", confirmed: true }, angles: chosen(2) });
    expect(done.anglesPhase).toBe("done");
    expect(done.nextStage).toBe("imagenes");
    expect(done.stages[2]).toMatchObject({ state: "done", desc: "La crema sella · Tengo 38" });
    expect(done.stages[3]).toMatchObject({ key: "imagenes", state: "current" });
    expect(done.stages[4]).toMatchObject({ key: "textos", state: "locked", desc: "Se habilita con las imágenes listas" });
    expect(anglesPhase({ ...ready, angles: chosen(3) })).toBe("done");
  });

  it("con ángulos listos, generar otra estrategia no bloquea lo que sigue", () => {
    expect(anglesPhase({ ...ready, strategy: { status: "running", confirmed: false }, angles: chosen(2) })).toBe("done");
  });

  it("una elección incompleta no cuenta como lista", () => {
    const partial: AngleFacts = { ranking: { status: "succeeded", confirmed: true, chosen: 3 }, briefs: [brief(1), brief(2)] };
    expect(anglesReady(partial)).toBe(false);
    expect(anglesReady({ ranking: { status: "succeeded", confirmed: true }, briefs: [brief(1), brief(2, "generado")] })).toBe(false);
    expect(anglesPhase({ ...ready, strategy: { status: "succeeded", confirmed: true }, angles: partial })).toBe("choose");
  });

  it("un producto trabajado antes de la estrategia (sin datos del producto) con sus ángulos listos sigue adelante", () => {
    const legacy = { ...base, base: { described: false, priced: true }, angles: chosen(2) };
    expect(basePhase(legacy)).toBe("done");
    expect(anglesPhase(legacy)).toBe("done");
  });
});

describe("página del producto (Textos)", () => {
  const images = { running: false, rendering: 0, options: 8, cover: true, gallery: 5 };
  const ready = {
    price: 24990,
    currency: "CLP",
    base: { described: true, priced: true },
    angles: {
      ranking: { status: "succeeded" as const, confirmed: true },
      briefs: [
        { slot: 1, name: "Mecanismo único", status: "aprobado" as const, generation: "succeeded" as const },
        { slot: 2, name: "Oferta", status: "aprobado" as const, generation: "succeeded" as const },
      ],
    },
    images,
  };
  const progress = (p: Partial<CopyFacts["progress"]>): CopyFacts["progress"] => ({ total: 13, enabled: 0, listing: "pending", complete: false, ...p });

  it("bloqueada hasta aprobar los 2 desarrollos y tener las imágenes; después, por escribir", () => {
    const noAngles = productPosition({ ...ready, angles: { ...ready.angles, briefs: [ready.angles.briefs[0]] } });
    expect(noAngles.stages[3]).toMatchObject({ key: "imagenes", title: "Imágenes", state: "locked", desc: "Se habilita al elegir los ángulos de la estrategia" });
    expect(noAngles.stages[4]).toMatchObject({ key: "textos", title: "Página del producto", state: "locked", desc: "Se habilita al elegir los ángulos de la estrategia" });
    const noImages = productPosition({ ...ready, images: { ...images, cover: false } });
    expect(noImages.copyPhase).toBe("locked");
    expect(noImages).toMatchObject({ nextStage: "imagenes", reason: "Espera tu elección · imágenes" });
    const fresh = productPosition(ready);
    expect(fresh.copyPhase).toBe("new");
    expect(fresh).toMatchObject({ nextStage: "textos", reason: "Siguiente: página del producto", summary: "Imágenes listas · $24.990" });
  });

  it("escribiendo, con error y por revisar", () => {
    const none = progress({ total: 0, listing: "missing" });
    expect(copyPhase({ ...ready, copy: { run: { status: "running" }, progress: none } }, "done")).toBe("writing");
    const failed = productPosition({ ...ready, copy: { run: { status: "failed", error: "La IA no respondió." }, progress: none } });
    expect(failed.stages[4]).toMatchObject({ state: "error", desc: "La IA no respondió." });
    expect(failed.filter).toBe("detenidos");
    const review = productPosition({ ...ready, copy: { run: { status: "succeeded" }, progress: progress({ enabled: 3 }) } });
    expect(review.stages[4]).toMatchObject({ state: "review", desc: "Falta aprobar la ficha del producto" });
    expect(review.reason).toBe("Espera tu revisión · página del producto");
    // Una reescritura que falla con la página escrita no tapa la revisión.
    expect(copyPhase({ ...ready, copy: { run: { status: "failed" }, progress: progress({}) } }, "done")).toBe("review");
  });

  it("lista con la ficha aprobada: habilita Publicar", () => {
    const done = productPosition({ ...ready, copy: { run: { status: "succeeded" }, progress: progress({ listing: "approved", enabled: 5, complete: true }) } });
    expect(done.stages[4]).toMatchObject({ state: "done", desc: "5 componentes en la página" });
    expect(done.stages[5]).toMatchObject({ key: "publicar", state: "current" });
    expect(done).toMatchObject({ nextStage: "publicar", reason: "Siguiente: publicar" });
    expect(done.meter.slice(3, 6)).toEqual(["done", "done", "current"]);
  });

  it("Publicar: se habilita con la página lista y lleva a Publicados", () => {
    const page = { ...ready, copy: { run: { status: "succeeded" as const }, progress: progress({ listing: "approved", enabled: 5, complete: true }) } };
    const locked = productPosition({ ...ready, copy: { run: { status: "succeeded" }, progress: progress({ enabled: 3 }) } });
    expect(locked.stages[5]).toMatchObject({ key: "publicar", state: "locked" });
    const readyToPublish = productPosition(page);
    expect(readyToPublish.stages[5]).toMatchObject({ key: "publicar", state: "current", desc: "Instala el tema y publica el producto" });
    const publishing = productPosition({ ...page, publish: { status: "publishing" } });
    expect(publishing).toMatchObject({ status: "publicando", reason: "Publicando en tu tienda" });
    const failed = productPosition({ ...page, publish: { status: "error", error: "Shopify rechazó una imagen" } });
    expect(failed.stages[5]).toMatchObject({ state: "error", desc: "Shopify rechazó una imagen" });
    expect(failed.filter).toBe("detenidos");
    const done = productPosition({ ...page, publish: { status: "published" } });
    expect(done).toMatchObject({ filter: "publicados", status: "publicado", nextStage: "anuncios" });
    expect(done.meter[5]).toBe("done");
  });
});


describe("Creativos (etapa opcional, docs/spec-creativos.md §6.5)", () => {
  const ready = {
    ...base,
    base: { described: true, priced: true },
    angles: {
      ranking: { status: "succeeded" as const, confirmed: true },
      briefs: [
        { slot: 1, name: "Mecanismo único", status: "aprobado" as const, generation: "succeeded" as const },
        { slot: 2, name: "Oferta", status: "aprobado" as const, generation: "succeeded" as const },
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
    expect(keys.slice(-4, -1)).toEqual(["publicar", "creativos", "anuncios"]);
    expect(stage(base)).toMatchObject({ optional: true, state: "locked", desc: "Después de elegir los ángulos", meter: "optional" });
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

describe("etapa WhatsApp", () => {
  const stage = (f: Parameters<typeof productPosition>[0]) => {
    const p = productPosition(f);
    const i = p.stages.findIndex((s) => s.key === "mensajes");
    return { ...p.stages[i], meter: p.meter[i], position: p, last: i === p.stages.length - 1 };
  };
  const approved = { ...base, base: { described: true, priced: true } };

  it("va al final, es opcional y se habilita con la información base lista", () => {
    expect(stage(base)).toMatchObject({ last: true, optional: true, state: "locked", desc: "Después de la información base", meter: "optional" });
    expect(stage(approved)).toMatchObject({ state: "available", desc: "Mensajes para confirmar y seguir pedidos", meter: "optional" });
  });

  it("nunca cambia la siguiente etapa", () => {
    expect(stage(approved).position.nextStage).toBe("angulos");
  });
});

describe("sin la clave de Anthropic (como Creativos sin Higgsfield)", () => {
  const approvedAvatar = { ...base, base: { described: true, priced: true } };
  const anglesDone = {
    ...approvedAvatar,
    angles: {
      ranking: { status: "succeeded" as const, confirmed: true },
      briefs: [
        { slot: 1, name: "Mecanismo único", status: "aprobado" as const, generation: "succeeded" as const },
        { slot: 2, name: "Oferta", status: "aprobado" as const, generation: "succeeded" as const },
      ],
    },
  };
  const byKey = (f: Parameters<typeof productPosition>[0], key: string) => productPosition(f).stages.find((s) => s.key === key)!;

  it("el contexto y la escritura desde el chat no requieren clave de Anthropic", () => {
    expect(productPosition({ ...base, ai: false }).stages[0]).toMatchObject({ state: "current" });
    expect(byKey({ ...approvedAvatar, ai: false }, "angulos")).toMatchObject({ state: "current", desc: "Define la estrategia desde el chat" });
    expect(productPosition({ ...approvedAvatar, ai: false }).reason).toBe("Siguiente: estrategia de venta");
    expect(byKey({ ...anglesDone, ai: false }, "imagenes")).toMatchObject({ state: "current" });
    const imagesDone = { ...anglesDone, images: { running: false, rendering: 0, options: 8, cover: true, gallery: 5 }, ai: false };
    expect(byKey(imagesDone, "textos")).toMatchObject({ state: "current" });
    expect(byKey({ ...anglesDone, creatives: { connected: true, running: false, concepts: 0, rendering: 0, pending: 0, approved: 0 }, ai: false }, "creativos")).toMatchObject({ state: "available" });
  });

  it("lo ya generado se sigue viendo y decidiendo", () => {
    const strategy = { ...approvedAvatar, strategy: { status: "succeeded" as const, confirmed: false }, ai: false };
    expect(byKey(strategy, "angulos")).toMatchObject({ state: "review" });
    const images = { ...anglesDone, images: { running: false, rendering: 0, options: 3, cover: false, gallery: 0 }, ai: false };
    expect(byKey(images, "imagenes")).toMatchObject({ state: "review" });
    expect(byKey({ ...anglesDone, creatives: { connected: true, running: false, concepts: 6, rendering: 0, pending: 2, approved: 0 }, ai: false }, "creativos")).toMatchObject({ state: "review" });
  });

  it("sin el dato, se asume conectada", () => {
    expect(byKey(approvedAvatar, "angulos")).toMatchObject({ state: "current" });
  });
});
