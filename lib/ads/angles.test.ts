import { describe, expect, it } from "vitest";
import { draftAngles } from "./angles";

const stamp = [{ id: "b1", edited_at: null }, { id: "b2", edited_at: null }];
const since = new Map([
  [1, "2026-09-25T10:00:00Z"],
  [2, "2026-09-25T10:00:00Z"],
]);
const texts = ["uno", "dos"];
const current = { stamp, primaryTexts: texts, since };
const m = (id: string, angle_slot: number | null, created_at: string) => ({ id, angle_slot, created_at, status: "ready" });

describe("draftAngles", () => {
  it("sin borrador o sin ángulos, nada", () => {
    expect(draftAngles(null, current, [])).toBeNull();
    expect(draftAngles({ stamp, primaryTexts: texts, creatives: [] }, { ...current, stamp: [] }, [])).toBeNull();
  });

  it("al día", () => {
    expect(draftAngles({ stamp, primaryTexts: texts, creatives: [] }, current, [])?.stale).toBe(false);
  });

  it("los ángulos cambiaron y los textos son otros", () => {
    const d = draftAngles({ stamp: [{ id: "b0", edited_at: null }], primaryTexts: ["viejo"], creatives: [] }, current, []);
    expect(d?.stale).toBe(true);
  });

  it("los ángulos cambiaron pero el borrador ya calza: no avisa", () => {
    expect(draftAngles({ stamp: [{ id: "b0", edited_at: null }], primaryTexts: texts, creatives: [] }, current, [])?.stale).toBe(false);
  });

  it("creativos de un ángulo anterior y los nuevos que faltan; los subidos a mano no cuentan", () => {
    const media = [m("viejo", 1, "2026-09-20T00:00:00Z"), m("nuevo", 2, "2026-09-25T11:00:00Z"), m("mano", null, "2026-09-01T00:00:00Z"), m("sin-slot", 3, "2026-09-26T00:00:00Z")];
    const d = draftAngles({ stamp, primaryTexts: texts, creatives: ["viejo", "mano", "sin-slot"] }, current, media);
    expect(d).toEqual({ stale: true, oldCreatives: ["viejo", "sin-slot"], newCreatives: ["nuevo"] });
  });

  it("borrador de antes de la huella: se compara por los textos", () => {
    expect(draftAngles({ stamp: null, primaryTexts: texts, creatives: [] }, current, [])?.stale).toBe(false);
    expect(draftAngles({ stamp: null, primaryTexts: ["otro"], creatives: [] }, current, [])?.stale).toBe(true);
  });
});
