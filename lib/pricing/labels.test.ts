import { describe, expect, it } from "vitest";
import type { PackLabel } from "@/lib/ai/schemas";
import { labelsStale, normalizePackLabels } from "./labels";

const l = (units: number, o: Partial<PackLabel> = {}): PackLabel => ({
  units,
  label: `${units} meses de uso`,
  support: null,
  badge: null,
  basis: "duration",
  reason: "60 cápsulas, 2 al día",
  ...o,
});
const packs = [{ units: 1 }, { units: 2 }, { units: 3 }];

describe("normalizePackLabels", () => {
  it("deja una por pack, en el orden del plan, sin packs inventados", () => {
    const out = normalizePackLabels([l(3), l(1), l(4), l(2), l(2, { label: "otra" })], packs);
    expect(out.map((x) => x.units)).toEqual([1, 2, 3]);
    expect(out[1].label).toBe("2 meses de uso");
  });
  it("un solo distintivo", () => {
    const out = normalizePackLabels([l(1), l(2, { badge: "Más elegido" }), l(3, { badge: "Mejor precio" })], packs);
    expect(out.map((x) => x.badge)).toEqual([null, "Más elegido", null]);
  });
  it("recorta y descarta etiquetas vacías", () => {
    const out = normalizePackLabels([l(1, { label: "  " }), l(2, { label: "x".repeat(80), support: "" })], packs);
    expect(out).toHaveLength(1);
    expect(out[0].label).toHaveLength(40);
    expect(out[0].support).toBeNull();
  });
});

describe("labelsStale", () => {
  const plan = { packs: [{ units: 1, price: 24990 }, { units: 3, price: 49990 }] } as never;
  it("avisa si cambió algún precio", () => {
    expect(labelsStale([{ units: 1, price: 24990 }, { units: 3, price: 49990 }], plan)).toBe(false);
    expect(labelsStale([{ units: 1, price: 24990 }, { units: 3, price: 57990 }], plan)).toBe(true);
  });
});
