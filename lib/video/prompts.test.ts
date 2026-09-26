import { describe, expect, it } from "vitest";
import { WORDS_PER_SECOND_MAX, WORDS_PER_SECOND_PROMPT } from "./catalog";
import { scriptSystem, ugcTail } from "./prompts";

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
