import { describe, expect, it } from "vitest";
import { WORDS_PER_SECOND_MAX, WORDS_PER_SECOND_PROMPT } from "./catalog";
import type { AngleForPrompt } from "@/lib/angles/approved";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import { linesContext, linesSystem, linesTail, openingInput, planContext, planSystem, planTail, type UgcContext } from "./prompts";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };

describe("guion: margen en las palabras por segundo", () => {
  it("el prompt pide menos palabras por segundo de las que acepta scriptProblems", () => {
    expect(WORDS_PER_SECOND_PROMPT).toBeLessThan(WORDS_PER_SECOND_MAX);
    for (const format of ["ugc", "mascot"] as const) {
      const sys = linesSystem(format, CL);
      expect(sys).toContain("2,7");
      expect(sys).toContain("5 s → 13");
      expect(sys).not.toContain("5 s → 15");
    }
  });
});

describe("guion en dos bloques (lo fijo en caché)", () => {
  it("los problemas van solo en el cierre, con la instrucción de su formato", () => {
    expect(linesTail()).toBe("Escribe el guion del video UGC.");
    expect(linesTail([], "mascot")).toBe("Escribe el guion del video de mascota animada.");
    expect(planTail()).toBe("Arma las tomas de este guion.");
    expect(planTail(["B1 se ancla a «x»."])).toMatch(/^Tu respuesta anterior no cumple las reglas: B1[\s\S]*Arma las tomas/);
    const retry = linesTail(["La toma A5 tiene 17 palabras para 5 s (máximo 15)."]);
    expect(retry).toMatch(/^Tu respuesta anterior no cumple las reglas: La toma A5/);
    expect(retry).toMatch(/Escribe el guion del video UGC\.$/);
  });
});

describe("guion: el gancho sale de la tríada", () => {
  const payload = {
    core_message: "c",
    handoff_to_ugc: "Vocera de 40, cálida",
    hooks: [
      { text: "Pensé que era puro cuento.", visual_first_3s: "Mujer escéptica", policy_ok: true, pattern: "confession", needs_real_material: "Un testimonio real" },
      { text: "Mira lo que pasa con el vaso.", on_screen: "PRUEBA DEL VASO", visual_first_3s: "Vaso sobre la lavadora", policy_ok: true, pattern: "demo", needs_real_material: null },
    ],
    recommended_hook: 1,
  } as unknown as AngleBriefPayload;
  const ctx = (format: "ugc" | "mascot"): UgcContext => ({
    brief: { product_name: "Almohadillas", what_it_does: "Frenan la vibración.", key_facts: [] } as unknown as UgcContext["brief"],
    avatar: { summary: "Carla, 40, dueña de casa", buyer: "", user: "", age_range: "35-45", why_buy: "MOTIVO-INTERNO", doubts: ["¿Sirve en piso flotante?"], cash_on_delivery: "", more_than_one: "" },
    differentiator: null,
    pricing: { currency: "CLP", salePrice: 1, compareAtPrice: null, packs: [], recommended: null } as unknown as PricingPlan,
    angle: { slot: 1, name: "A", frameName: "Mecanismo único", angle: { slot: 1, frame: "unique_mechanism", title: "No es la lavadora", hook: "Tu lavadora no está rota." }, payload } as unknown as AngleForPrompt,
    format,
  });

  it("solo pasa los ganchos usables, como texto, y la mascota sin el vocero humano", () => {
    const ugc = linesContext(ctx("ugc"));
    expect(ugc).toContain("GANCHOS DEL ÁNGULO");
    expect(ugc).toContain("1. «Mira lo que pasa con el vaso.» · en pantalla: «PRUEBA DEL VASO»");
    expect(ugc).not.toContain("Pensé que era puro cuento");
    expect(ugc).toContain("Vocera de 40");
    expect(linesContext(ctx("mascot"))).not.toContain("Vocera de 40");
  });

  it("el contexto es texto corto: sin la ficha ni el cliente ideal en JSON, con 3 frases de quien compra", () => {
    const u = linesContext(ctx("ugc"));
    expect(u).not.toMatch(/"(what_it_does|voice_of_customer|trigger_moments|summary)"\s*:/);
    expect(u).not.toMatch(/^\s*[{[]/m);
    expect(u).toContain("PRODUCTO: Almohadillas");
    expect(u).toContain("QUIÉN COMPRA, SEGÚN EL COMERCIANTE: Carla, 40, dueña de casa");
    // Solo quién compra (v10): sin su porqué ni sus dudas, y sin frases que copiar.
    expect(u).not.toContain("MOTIVO-INTERNO");
    expect(u).not.toContain("piso flotante");
    expect(u).toContain("Ángulo 1: «No es la lavadora»");
  });

  it("la mascota dice el gancho a su manera: A1 no tiene que abrir con la frase de la persona", () => {
    expect(openingInput(payload, "mascot")).toEqual({ hooks: [{ index: 1, shot: "mascot_scene", spoken: undefined }] });
    expect(linesSystem("mascot", CL)).toContain("dilo como el personaje, a su manera");
    // Los ganchos de hasta la versión 5 traen su versión de mascota: A1 abre con esa.
    const old = { ...payload, hooks: payload.hooks.map((h) => ({ ...h, mascot: { text: "Soy el vaso que tiembla.", on_screen: "YO TIEMBLO", scene: "s", first_motion: "f" } })) };
    expect(openingInput(old, "mascot").hooks[0].spoken).toBe("Soy el vaso que tiembla.");
    expect(openingInput(payload, "ugc")).toEqual({ hooks: [{ index: 1, shot: "selfie_talk", spoken: "Mira lo que pasa con el vaso." }] });
  });

  it("el guion no habla de imágenes clave ni cámaras: eso es el plan", () => {
    for (const format of ["ugc", "mascot"] as const) {
      const sys = linesSystem(format, CL);
      expect(sys).toContain("A1 abre con el gancho");
      expect(sys).not.toMatch(/keyframe|imagen clave|B-roll|camera/i);
      expect(sys.split("\n").length).toBeLessThan(25);
      expect(planSystem(format, CL)).toContain("K1 (el personaje solo, la referencia de su cara) lo pone el sistema");
      expect(planSystem(format, CL)).toContain("primeras 3 palabras de A1");
    }
    expect(planSystem("mascot", CL)).toMatch(/droplet \(gota\)[\s\S]*nunca color piel/);
  });

  it("el plan recibe el guion validado y la apertura del gancho", () => {
    const lines = { format_fit: { recommended: "ugc_ai", why: "" }, speaker: "Una mujer de 40, dueña de casa", hook_source: 1, hook_why: "", a_roll: [{ seconds: 5, line: "Mira lo que pasa con el vaso.", delivery: "", acting: "Points." }], end_card: { title: "", subtitle: "", cta: "", small_print: [] }, compliance_notes: [] } as const;
    const u = planContext(ctx("ugc"), { ...lines, a_roll: [...lines.a_roll], end_card: { ...lines.end_card, small_print: [] }, compliance_notes: [] }, { shot: "problem_scene", hook: { on_screen: "PRUEBA DEL VASO", visual: "Vaso sobre la lavadora" } });
    expect(u).toContain("QUIÉN HABLA: Una mujer de 40");
    expect(u).toContain("Abre con un inserto: B1 es la primera toma");
    expect(u).toContain("Texto en pantalla del gancho: «PRUEBA DEL VASO»");
    expect(u).toContain("A1 (5 s): «Mira lo que pasa con el vaso.» · Points.");
  });
});

describe("guion: tamaño de los esquemas", () => {
  // La API rechaza gramáticas muy grandes (400 «compiled grammar is too large»).
  it("no son más grandes que uno que ya funcionó en producción", async () => {
    const { toJSONSchema } = await import("zod/v4");
    const { PROVEN_GRAMMAR_SIZE } = await import("@/lib/ai/limits");
    const { scriptLinesSchema, ugcPlanSchema, mascotPlanSchema } = await import("./schemas");
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
    for (const s of [scriptLinesSchema, ugcPlanSchema, mascotPlanSchema]) expect(size(toJSONSchema(s))).toBeLessThanOrEqual(PROVEN_GRAMMAR_SIZE);
  });
});
