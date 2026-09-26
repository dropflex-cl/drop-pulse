import { describe, expect, it } from "vitest";
import { latestPieces, needsRender } from "./pieces";

const p = (id: string, ratio: "1:1" | "9:16", provider: "higgsfield" | "gemini", render: "queued" | "running" | "succeeded" | "failed" = "succeeded") => ({ id, ratio, provider, render });

describe("latestPieces", () => {
  it("una pieza de Gemini no esconde la de Higgsfield en la misma proporción", () => {
    expect(latestPieces([p("h", "1:1", "higgsfield"), p("g", "1:1", "gemini", "running")]).map((a) => a.id)).toEqual(["g", "h"]);
  });

  it("dentro del mismo proveedor, la más reciente reemplaza (el reintento del QA)", () => {
    expect(latestPieces([p("1", "1:1", "higgsfield"), p("2", "1:1", "higgsfield")]).map((a) => a.id)).toEqual(["2"]);
  });

  it("una falla no esconde una lista del mismo proveedor", () => {
    expect(latestPieces([p("ok", "1:1", "gemini"), p("x", "1:1", "gemini", "failed")]).map((a) => a.id)).toEqual(["ok"]);
  });
});

describe("needsRender", () => {
  it("con el otro proveedor elegido, se puede generar la misma proporción", () => {
    const assets = [p("h", "1:1", "higgsfield")];
    expect(needsRender(assets, "1:1", "gemini")).toBe(true);
    expect(needsRender(assets, "1:1", "higgsfield")).toBe(false);
  });
});
