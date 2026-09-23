import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { extractJson } = await import("./claude");

describe("salida sin gramática", () => {
  it("toma el objeto JSON aunque venga entre ``` o con texto alrededor", () => {
    expect(extractJson('```json\n{"a":1,"b":{"c":[2]}}\n```')).toEqual({ a: 1, b: { c: [2] } });
    expect(extractJson('Aquí va: {"a":"}"} listo')).toEqual({ a: "}" });
  });

  it("falla si no hay objeto", () => {
    expect(() => extractJson("sin json")).toThrow();
  });
});
