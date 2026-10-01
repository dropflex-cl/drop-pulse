import { describe, expect, it } from "vitest";
import { WORDS_PER_SECOND_MAX, WORDS_PER_SECOND_PROMPT } from "./catalog";
import type { AngleForPrompt } from "@/lib/angles/approved";
import type { AngleBriefPayload } from "@/lib/angles/schemas";
import type { PricingPlan } from "@/lib/pricing/plan";
import { scriptSystem, ugcContextText, ugcTail, type UgcContext } from "./prompts";

const CL = { countryCode: "CL", currency: "CLP", language: "es" };

describe("guion: margen en las palabras por segundo", () => {
  it("el prompt pide menos palabras por segundo de las que acepta scriptProblems", () => {
    expect(WORDS_PER_SECOND_PROMPT).toBeLessThan(WORDS_PER_SECOND_MAX);
    for (const format of ["ugc", "mascot"] as const) {
      const sys = scriptSystem(format, CL);
      expect(sys).toContain("2,7");
      expect(sys).toContain("5 s → 13");
      expect(sys).not.toContain("5 s → 15");
    }
  });
});

describe("guion en dos bloques (lo fijo en caché)", () => {
  it("los problemas van solo en el cierre, con la instrucción de su formato", () => {
    expect(ugcTail()).toBe("Escribe el guion del video UGC.");
    expect(ugcTail([], "mascot")).toBe("Escribe el guion del video de mascota animada.");
    const retry = ugcTail(["La toma A5 tiene 17 palabras para 5 s (máximo 15)."]);
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
    brief: {} as UgcContext["brief"],
    avatar: {} as UgcContext["avatar"],
    differentiator: null,
    pricing: { currency: "CLP", salePrice: 1, compareAtPrice: null, packs: [], recommended: null } as unknown as PricingPlan,
    angle: { slot: 1, name: "A", frameName: "Mecanismo único", angle: { slot: 1, frame: "unique_mechanism" }, payload } as unknown as AngleForPrompt,
    format,
  });

  it("solo pasa los ganchos usables, con su tríada, y la mascota sin el vocero humano", () => {
    const ugc = ugcContextText(ctx("ugc"));
    expect(ugc).toContain("GANCHOS DEL ÁNGULO");
    expect(ugc).toContain("PRUEBA DEL VASO");
    expect(ugc).not.toContain("Pensé que era puro cuento");
    expect(ugc).toContain("Vocera de 40");
    expect(ugcContextText(ctx("mascot"))).not.toContain("Vocera de 40");
  });

  it("los dos formatos piden abrir con el gancho y su texto en pantalla", () => {
    for (const format of ["ugc", "mascot"] as const) {
      const sys = scriptSystem(format, CL);
      expect(sys).toContain("EL GANCHO (los primeros 3 s");
      expect(sys).toContain("hook_source");
      expect(sys).toContain("primeras 3 palabras de A1");
    }
  });
});

describe("guion: tamaño del esquema", () => {
  // La API rechaza gramáticas muy grandes (400 «compiled grammar is too large»): el guion con la
  // apertura y las cámaras no puede pasar el del cliente ideal, que funciona en producción.
  it("no es más grande que el del cliente ideal", async () => {
    const { toJSONSchema } = await import("zod/v4");
    const { avatarStepSchema } = await import("@/lib/ai/schemas");
    const { ugcScriptSchema } = await import("./schemas");
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
    expect(size(toJSONSchema(ugcScriptSchema))).toBeLessThanOrEqual(size(toJSONSchema(avatarStepSchema)));
  });
});
