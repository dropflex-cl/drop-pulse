import { describe, expect, it } from "vitest";
import { promptLimit, promptRate } from "./limits";

describe("topes del prompt", () => {
  it("pide un 10 % menos que el tope que valida el código", () => {
    expect(promptLimit(45)).toBe(40);
    expect(promptLimit(40)).toBe(36);
    expect(promptLimit(32)).toBe(28);
    expect(promptLimit(120)).toBe(108);
    expect(promptLimit(24)).toBe(21);
  });

  it("nunca pide más que el tope real", () => {
    for (let n = 1; n <= 200; n++) expect(promptLimit(n)).toBeLessThanOrEqual(n);
  });

  it("las tasas quedan en una décima", () => {
    expect(promptRate(3)).toBe(2.7);
  });
});
