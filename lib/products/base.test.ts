import { describe, expect, it } from "vitest";
import { baseFirst, pickBase } from "./base";

const img = (id: string, o: Partial<{ base: boolean; cover: boolean; excluded: boolean }> = {}) => ({
  id,
  base: false,
  cover: false,
  excluded: false,
  ...o,
});
const flags = (i: ReturnType<typeof img>) => i;

describe("pickBase", () => {
  it("prefiere la elegida por el comerciante", () => {
    expect(pickBase([img("a", { cover: true }), img("b", { base: true })], flags)?.id).toBe("b");
  });
  it("sin elección usa la portada y, si no, la primera en uso", () => {
    expect(pickBase([img("a"), img("b", { cover: true })], flags)?.id).toBe("b");
    expect(pickBase([img("a", { excluded: true }), img("b")], flags)?.id).toBe("b");
  });
  it("nunca devuelve una excluida", () => {
    expect(pickBase([img("a", { base: true, excluded: true }), img("b")], flags)?.id).toBe("b");
    expect(pickBase([img("a", { excluded: true })], flags)).toBeUndefined();
  });
});

describe("baseFirst", () => {
  it("pone la base primero y deja fuera las excluidas", () => {
    const list = [img("a"), img("b", { excluded: true }), img("c", { base: true })];
    expect(baseFirst(list, flags).map((i) => i.id)).toEqual(["c", "a"]);
  });
});
