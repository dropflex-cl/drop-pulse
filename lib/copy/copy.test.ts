import { describe, expect, it } from "vitest";
import { AVATAR } from "@/app/dev/screens/base/fixture";
import type { ProductBrief } from "@/lib/ai/schemas";
import { avatarStepSchema } from "@/lib/ai/schemas";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { BLOCKS, editProblem, joinFaq, measure, splitFaq } from "./blocks";
import { copyProgress, itemState } from "./progress";
import { copySystem, copyUser, type CopyContext } from "./prompts";
import { allowedAmounts, amountsIn, copyProblems, pageCopySchema, type CopyFacts, type PageCopyOutput } from "./schemas";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };
const pricing = buildPricingPlan(
  { unitCost: 3000, avgShippingCost: 8000, purchaseCostLimit: 5000, confirmationRate: 70, deliveryRate: 70, salePrice: 24990, compareAtPrice: 32990, extraUnitDiscount: 50 },
  "CLP",
)!;
const facts: CopyFacts = { currency: "CLP", amounts: allowedAmounts(pricing), guaranteeDays: null };
const words = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(" ");

/** Una página válida: los obligatorios, 3 beneficios y 3 preguntas (una del pago contra entrega). */
function page(): PageCopyOutput {
  type Block = PageCopyOutput["blocks"][number];
  const b = (key: Block["key"], text: string, kind: Block["kind"] = null): Block => ({ key, text, angle: "primary", note: "n", missing: null, kind });
  return {
    blocks: [
      b("title", "Corrector de postura ajustable para trabajar sin dolor de espalda"),
      b("short_name", "Corrector de postura"),
      b("short_description", "Te ayuda a mantener la espalda recta mientras trabajas. Ajuste con velcro."),
      b("offer_line", `2 por ${"$"}${pricing.packs[1].price.toLocaleString("es-CL")} · Paga al recibir`),
      b("benefit", "Menos tensión en la espalda al final de la jornada", "result"),
      b("benefit", "Se ajusta en segundos con velcro", "ease"),
      b("benefit", "Delgado: no se nota bajo la camisa", "comfort"),
      b("how_it_works", words(60)),
      b("shipping_payment", "Pagas cuando lo recibes. Envío gratis a todo Chile."),
      b("seo_title", "Corrector de postura ajustable"),
      b("seo_description", "Corrector de postura con ajuste de velcro. Pago contra entrega y envío gratis."),
    ],
    faq: [
      { question: "¿Tengo que pagar antes de recibirlo?", answer: "No. Pagas cuando te lo entregan.", angle: "secondary", note: "n" },
      { question: "¿Se nota bajo la ropa?", answer: "No: es delgado.", angle: "primary", note: "n" },
      { question: "¿Cuánto rato al día?", answer: "Empieza con 15 minutos.", angle: "none", note: "n" },
    ],
    proof_used: [],
    missing_inputs: [],
    compliance_flags: [],
  };
}

describe("bloques de la página", () => {
  it("los 14 del diseño: 4 arriba del precio, beneficios y cómo funciona, dudas y Google", () => {
    expect(BLOCKS.map((b) => b.key)).toEqual(["title", "short_name", "short_description", "offer_line", "benefit", "how_it_works", "faq", "shipping_payment", "guarantee", "seo_title", "seo_description"]);
    expect(BLOCKS.filter((b) => b.required).map((b) => b.key)).toEqual(["title", "short_name", "short_description", "offer_line", "how_it_works", "shipping_payment", "seo_title", "seo_description"]);
  });

  it("mide en caracteres o palabras, y las preguntas se guardan en dos líneas", () => {
    expect(measure("  hola mundo  ", "caracteres")).toBe(10);
    expect(measure("uno dos  tres", "palabras")).toBe(3);
    expect(splitFaq(joinFaq(" ¿Pago al recibir? ", " Sí. "))).toEqual({ q: "¿Pago al recibir?", a: "Sí." });
  });

  it("editar: el límite es el mismo que muestra el contador", () => {
    expect(editProblem("title", "x".repeat(70))).toBeNull();
    expect(editProblem("title", "x".repeat(71))).toBe("Pasa de 70 caracteres.");
    expect(editProblem("title", "  ")).toBe("El texto está vacío.");
    expect(editProblem("how_it_works", words(121))).toBe("Pasa de 120 palabras.");
    expect(editProblem("faq", "¿Sin respuesta?")).toBe("Escribe la pregunta y la respuesta.");
    expect(editProblem("faq", `${"x".repeat(91)}\nsí`)).toBe("La pregunta pasa de 90 caracteres.");
  });
});

describe("validación del redactor", () => {
  it("una página completa pasa", () => {
    expect(copyProblems(page(), facts)).toEqual([]);
  });

  it("faltan o sobran bloques", () => {
    const p = page();
    p.blocks = p.blocks.filter((b) => b.key !== "seo_title" && b.key !== "benefit");
    p.faq = [...p.faq, ...p.faq, ...p.faq];
    const problems = copyProblems(p, facts);
    expect(problems).toContain("Faltan bloques benefit: trae 0 y deben ser al menos 3.");
    expect(problems).toContain("Faltan bloques seo_title: trae 0 y deben ser al menos 1.");
    expect(problems).toContain("Sobran bloques faq: trae 9 y deben ser como máximo 6.");
  });

  it("largos: pasado el límite y «cómo funciona» muy corto", () => {
    const p = page();
    p.blocks[0].text = "x".repeat(80);
    p.blocks.find((b) => b.key === "how_it_works")!.text = words(12);
    const problems = copyProblems(p, facts);
    expect(problems).toContain("title tiene 80 caracteres y el máximo es 70.");
    expect(problems).toContain("how_it_works tiene 12 palabras y el mínimo es 40.");
  });

  it("garantía solo con días en la ficha", () => {
    const withGuarantee = page();
    withGuarantee.blocks.push({ key: "guarantee", text: "30 días de garantía", angle: "none", note: "n", missing: null, kind: null });
    expect(copyProblems(withGuarantee, facts)).toContain("Incluiste una garantía y la ficha no trae días de garantía: quita ese bloque.");
    expect(copyProblems(withGuarantee, { ...facts, guaranteeDays: 30 })).toEqual([]);
    expect(copyProblems(page(), { ...facts, guaranteeDays: 30 })).toContain("La ficha trae días de garantía: agrega el bloque guarantee con esos días.");
  });

  it("montos: solo los de PRECIO Y OFERTA", () => {
    expect(amountsIn("Antes $32.990, hoy $24.990 y 2 por $ 1.000", "CLP")).toEqual([32990, 24990, 1000]);
    const p = page();
    p.blocks[3].text = "Hoy $19.990 · Paga al recibir";
    expect(copyProblems(p, facts)).toContain("Estos montos no están en PRECIO Y OFERTA: 19990. Usa solo esos números.");
    p.blocks[3].text = "Antes $32.990, hoy $24.990";
    expect(copyProblems(p, facts)).toEqual([]);
  });

  it("promesas prohibidas y la pregunta del pago contra entrega", () => {
    const p = page();
    p.blocks[2].text = "Cura el dolor de espalda.";
    p.faq[0] = { question: "¿Sirve para correr?", answer: "Sí.", angle: "none", note: "n" };
    const problems = copyProblems(p, facts);
    expect(problems).toContain("Hay una promesa prohibida («Cura»): usa «ayuda a» o «diseñado para».");
    expect(problems).toContain("Ninguna pregunta frecuente responde sobre el pago contra entrega: agrega una.");
  });

  it("beneficios: una razón de compra distinta cada uno, y uno del resultado", () => {
    const same = page();
    same.blocks.find((x) => x.text.startsWith("Delgado"))!.kind = "ease";
    expect(copyProblems(same, facts)).toContain(
      "Hay beneficios con la misma razón de compra (ease): cada uno tiene que dar una razón distinta; si no hay tantas, escribe menos.",
    );
    const noResult = page();
    noResult.blocks.find((x) => x.kind === "result")!.kind = "safety";
    expect(copyProblems(noResult, facts)).toContain("Ningún beneficio habla del resultado que busca el comprador (kind result).");
    const noKind = page();
    noKind.blocks.find((x) => x.kind === "ease")!.kind = null;
    expect(copyProblems(noKind, facts)).toContain("Cada benefit necesita su kind (la razón de compra).");
  });

  it("nada de palabras internas en la tienda", () => {
    const p = page();
    p.blocks.find((x) => x.kind === "comfort")!.text = "Rinde 25 días según la ficha";
    expect(copyProblems(p, facts)).toContain("Un texto usa una palabra interna («la ficha»): escribe para el comprador, sin nombrar la ficha, los ángulos ni el precio y oferta.");
    p.blocks.find((x) => x.kind === "comfort")!.text = "Como dice el ángulo principal";
    expect(copyProblems(p, facts).some((x) => x.includes("«ángulo principal»"))).toBe(true);
    // «fichar» o «ficharte» no son la palabra interna.
    p.blocks.find((x) => x.kind === "comfort")!.text = "Úsalo antes de fichar en la oficina";
    expect(copyProblems(p, facts)).toEqual([]);
  });

  it("al reescribir, lo aprobado cuenta y no se pide de nuevo", () => {
    const p = page();
    p.blocks = p.blocks.filter((b) => b.key !== "title" && b.key !== "benefit").concat({ key: "benefit", text: "Uno nuevo", angle: "secondary", note: "n", missing: null, kind: "value" });
    p.faq = [];
    expect(copyProblems(p, { ...facts, kept: { title: 1, benefit: 2, faq: 3 } })).toEqual([]);
    expect(copyProblems(p, { ...facts, kept: { title: 1, benefit: 1, faq: 3 } })).toContain("Faltan bloques benefit: trae 1 y deben ser al menos 2.");
  });

  // La API rechaza gramáticas muy grandes (400 «compiled grammar is too large»): el esquema de la
  // página no puede ser más grande que el del cliente ideal, que funciona en producción.
  it("el esquema no es más grande que el del cliente ideal", async () => {
    const { toJSONSchema } = await import("zod/v4");
    const size = (schema: unknown) => {
      let n = 0;
      const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const o = node as Record<string, unknown>;
        if (o.type === "object") n += 1 + Object.keys((o.properties as object) ?? {}).length;
        if (Array.isArray(o.enum)) n += o.enum.length;
        for (const v of Object.values(o)) walk(v);
      };
      walk(schema);
      return n;
    };
    expect(size(toJSONSchema(pageCopySchema))).toBeLessThanOrEqual(size(toJSONSchema(avatarStepSchema)));
  });
});

describe("progreso de la página", () => {
  const item = (key: string, status: "generado" | "aprobado" | "rechazado", extra: { edited?: boolean; original?: string } = {}) => ({ key, status, ...extra });

  it("descartar con original mantiene Shopify; sin original, obligatorio queda por aprobar", () => {
    expect(itemState(item("title", "rechazado", { original: "Corrector Postura" }))).toBe("kept");
    expect(itemState(item("shipping_payment", "rechazado"))).toBe("missing");
    expect(itemState(item("benefit", "rechazado"))).toBe("discarded");
    expect(itemState(item("benefit", "aprobado", { edited: true }))).toBe("edited");
  });

  it("completa sin pendientes y con cada obligatorio aprobado o con su original", () => {
    const required = BLOCKS.filter((b) => b.required).map((b) => item(b.key, "aprobado"));
    expect(copyProgress([...required, item("benefit", "rechazado")])).toMatchObject({ complete: true, approved: 8, total: 9, missing: [] });
    const withPending = copyProgress([...required, item("benefit", "generado")]);
    expect(withPending).toMatchObject({ complete: false, pending: 1 });
    const missing = copyProgress([...required.filter((r) => r.key !== "shipping_payment"), item("shipping_payment", "rechazado")]);
    expect(missing).toMatchObject({ complete: false, missing: ["Envío y pago"] });
    const kept = copyProgress([...required.filter((r) => r.key !== "title"), item("title", "rechazado", { original: "Corrector" })]);
    expect(kept.complete).toBe(true);
  });
});

describe("prompts del redactor de página", () => {
  const brief = (core: string) => ({ core_message: core, hooks: [{ text: "gancho" }], objection_handling: [{ objection: "¿Y si no me queda?", answer: "Talla única" }] }) as unknown as AngleBriefPayload;
  const ctx: CopyContext = {
    brief: { product_name: "Corrector", proof: { guarantee_days: null } } as unknown as ProductBrief,
    avatar: AVATAR,
    pricing,
    primary: { name: "Mecanismo único", payload: brief("La postura se corrige sola") },
    secondary: { name: "Oferta", payload: brief("Lleva 2") },
    shopify: { title: "Corrector Postura Unisex", description: null },
    countryCode: "CL",
    freeShipping: true,
  };

  it("el system depende solo del mercado y lista cada bloque con su límite", () => {
    const sys = copySystem(CL);
    expect(sys).toBe(copySystem(CL));
    expect(sys).toContain("- title (Título del producto; 1; ≤ 70 caracteres)");
    expect(sys).toContain("- faq (Pregunta frecuente; 3 a 6; pregunta ≤ 90 caracteres, respuesta ≤ 280)");
    expect(sys).toContain("pago contra entrega");
  });

  it("el usuario lleva precio, envío gratis, los 2 ángulos sin ganchos y lo de Shopify", () => {
    const u = copyUser(ctx);
    expect(u).toContain("PRECIO Y OFERTA");
    expect(u).toContain("- Envío gratis a todo Chile.");
    expect(u).toContain("ÁNGULO PRINCIPAL: Mecanismo único");
    expect(u).toContain("ÁNGULO SECUNDARIO: Oferta");
    expect(u).toContain("¿Y si no me queda?");
    expect(u).not.toContain("gancho");
    expect(u).toContain("- Título: Corrector Postura Unisex");
    expect(u).not.toContain("REESCRITURA");
  });

  it("al reescribir lleva lo aprobado y lo descartado; al reintentar, qué falló", () => {
    const u = copyUser({ ...ctx, approved: [{ label: "Título del producto", text: "Corrector ajustable" }], discarded: [{ label: "Beneficio 2", text: "Muy cómodo" }] }, ["title está vacío."]);
    expect(u).toContain("- Título del producto: Corrector ajustable");
    expect(u).toContain("- Beneficio 2: Muy cómodo");
    expect(u).toContain("Tu respuesta anterior no cumple las reglas: title está vacío.");
  });
});
