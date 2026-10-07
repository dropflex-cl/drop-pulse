import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { generationContextJsonSchema, publishedSchemas } from "./mcp";
import { parseToolInput, parseToolOutput, jsonBytes, PI_LIMITS } from "./validation";
import { contextFixture, examplesFixture } from "./test-fixtures";
import type { ToolName } from "./schemas";

describe("PI · contratos Zod y JSON Schema 2020-12", () => {
  const generated = publishedSchemas();
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const inputValidators = Object.fromEntries(Object.entries(generated).map(([name, schemas]) => [name, ajv.compile(schemas.input)]));
  const outputValidators = Object.fromEntries(Object.entries(generated).map(([name, schemas]) => [name, ajv.compile(schemas.output)]));

  it("publica exactamente treinta y siete schemas raíz objeto con ramas completas", () => {
    expect(Object.keys(generated)).toHaveLength(37);
    for (const schemas of Object.values(generated)) {
      expect(schemas.input.type).toBe("object");
      expect(schemas.output.type).toBe("object");
      expect(schemas.input.$schema).toContain("2020-12");
    }
  });
  it.each(examplesFixture.requests)("acepta $name en dominio y schema generado", (entry) => {
    expect(() => parseToolInput(entry.tool as ToolName, entry.payload)).not.toThrow();
    expect(inputValidators[entry.tool](entry.payload), JSON.stringify(inputValidators[entry.tool].errors)).toBe(true);
  });
  it.each(examplesFixture.responses)("acepta la salida $name", (entry) => {
    expect(() => parseToolOutput(entry.tool as ToolName, entry.payload)).not.toThrow();
    expect(outputValidators[entry.tool](entry.payload), JSON.stringify(outputValidators[entry.tool].errors)).toBe(true);
  });
  it.each(examplesFixture.schema_invalid)("rechaza $name en ambos validadores", (entry) => {
    expect(() => parseToolInput(entry.tool as ToolName, entry.payload)).toThrow();
    expect(inputValidators[entry.tool](entry.payload)).toBe(false);
  });
  it("valida el contexto interno con el schema exportado", () => {
    expect(ajv.compile(generationContextJsonSchema())(contextFixture())).toBe(true);
  });
  it("aplica bytes UTF-8 además de caracteres", () => {
    expect(() => jsonBytes({ field: "😀".repeat(3000) }, PI_LIMITS.inputBytes)).toThrow();
    expect(() => jsonBytes({ fields: Array(40).fill("x".repeat(8000)) }, PI_LIMITS.inputBytes)).toThrow();
  });
  it("rechaza ciclos, getters, valores no JSON y profundidad maliciosa", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    expect(() => jsonBytes(cycle, PI_LIMITS.inputBytes)).toThrow();
    expect(() => jsonBytes({ get field() { throw new Error("No se ejecuta"); } }, PI_LIMITS.inputBytes)).toThrow("propiedades ejecutables");
    for (const value of [NaN, Infinity, undefined, new Date(), () => null]) expect(() => jsonBytes(value, PI_LIMITS.inputBytes)).toThrow();
    let nested: unknown = null; for (let i = 0; i < 70; i++) nested = { item: nested };
    expect(() => jsonBytes(nested, PI_LIMITS.inputBytes)).toThrow();
  });
  it("limita el value de facts aunque sus strings individuales quepan", () => {
    const input = structuredClone(examplesFixture.requests.find((entry) => entry.name === "propose-research")!.payload) as Record<string, unknown>;
    const facts = input.facts as Record<string, unknown>[];
    facts[0].value = Array(10).fill("x".repeat(1000));
    expect(() => parseToolInput("save_research", input)).toThrow();
    facts[0].value = { a: { a: { a: { a: { a: { a: 1 } } } } } };
    expect(() => parseToolInput("save_research", input)).toThrow("cinco niveles");
  });
});
