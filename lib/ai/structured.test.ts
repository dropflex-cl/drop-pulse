import { describe, expect, it } from "vitest";
import * as z from "zod/v4";
import { firstText, readStructured, sumUsage } from "./structured";

const schema = z.object({ hooks: z.array(z.object({ text: z.string(), delivery: z.enum(["confiding", "playful"]) })) });

describe("la salida estructurada la leemos nosotros", () => {
  it("devuelve los datos cuando calzan con el esquema", () => {
    expect(readStructured(schema, JSON.stringify({ hooks: [{ text: "Hola", delivery: "playful" }] }))).toEqual({ data: { hooks: [{ text: "Hola", delivery: "playful" }] } });
  });

  it("una respuesta cortada dice que no es JSON, sin lanzar", () => {
    const r = readStructured(schema, '{"hooks":[{"text":"Hola"');
    expect(r).toHaveProperty("problems");
    expect("problems" in r && r.problems[0]).toMatch(/^La respuesta no es un JSON válido \(24 caracteres\)/);
  });

  it("lo que no calza dice dónde, para guardarlo en ai_generations.problems", () => {
    const r = readStructured(schema, JSON.stringify({ hooks: [{ text: "Hola", delivery: "gritando" }] }));
    expect("problems" in r && r.problems.join(" ")).toMatch(/^hooks\.0\.delivery: /);
  });

  it("toma el primer bloque de texto, después del razonamiento", () => {
    expect(firstText([{ type: "thinking" }, { type: "text", text: "{}" }, { type: "text", text: "otro" }])).toBe("{}");
    expect(firstText([{ type: "thinking" }])).toBe("");
  });

  it("dos intentos de la misma llamada suman lo que se pagó", () => {
    const u = { model: "claude-opus-5", inputTokens: 100, outputTokens: 50, cacheReadTokens: 10, cacheWriteTokens: 5, costUsd: 0.1, latencyMs: 1000 };
    expect(sumUsage(u, { ...u, costUsd: 0.2, latencyMs: 2000 })).toEqual({ model: "claude-opus-5", inputTokens: 200, outputTokens: 100, cacheReadTokens: 20, cacheWriteTokens: 10, costUsd: 0.3, latencyMs: 3000 });
  });
});
