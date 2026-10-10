import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "components/_landing/assets/df-google-rating.js"), "utf8");
const snippet = readFileSync(join(__dirname, "components/_landing/snippets/df-google-rating.liquid"), "utf8");

function setup({ saved = new Map<string, string>(), ids = ["123"], random = (): number => 0, blocked = false } = {}) {
  const badges = ids.map(productId => {
    const label = { textContent: "" };
    const accessible = { textContent: "" };
    const styles = new Map<string, string>();
    return {
      dataset: { productId }, label, accessible, styles,
      querySelectorAll: () => [label],
      querySelector: () => ({
        style: { setProperty: (key: string, value: string) => styles.set(key, value) },
        querySelector: () => accessible,
      }),
    };
  });
  const listeners = new Map<string, (event: { key: string | null }) => void>();
  const window = {
    DropFlexGoogleRating: undefined as unknown as { sync: () => void },
    addEventListener: (name: string, callback: (event: { key: string | null }) => void) => listeners.set(name, callback),
  };
  runInNewContext(source, {
    window, Math: { random, floor: Math.floor }, Number, JSON, Map,
    document: { readyState: "loading", addEventListener: () => {}, querySelectorAll: () => badges },
    localStorage: {
      getItem(key: string) { if (blocked) throw new Error("blocked"); return saved.get(key) ?? null; },
      setItem(key: string, value: string) { if (blocked) throw new Error("blocked"); saved.set(key, value); },
    },
  });
  return { saved, badges, listeners, sync: window.DropFlexGoogleRating.sync };
}

describe("nota permanente del bloque Google", () => {
  it.each([[0, 44, "4,4", "88%"], [0.9999, 50, "5,0", "100%"]])(
    "incluye los extremos del rango con estrellas y texto accesible sincronizados (%s)",
    (random, stored, label, fill) => {
      const state = setup({ random: () => random as number }); state.sync();
      expect(state.saved.get("df:google-rating:123")).toBe(String(stored));
      expect(state.badges[0].label.textContent).toBe(label);
      expect(state.badges[0].accessible.textContent).toBe(`${label} de 5 estrellas`);
      expect(state.badges[0].styles.get("--df-stars-fill")).toBe(fill);
    },
  );
  it("persiste al recargar y separa los productos, sincronizando apariciones repetidas", () => {
    const values = [0.2, 0.9];
    const first = setup({ ids: ["123", "456", "123"], random: () => values.shift()! });
    first.sync();
    expect(first.badges.map(badge => badge.label.textContent)).toEqual(["4,5", "5,0", "4,5"]);
    const next = setup({ saved: first.saved, ids: ["456", "123"], random: () => { throw new Error("no debe regenerar"); } });
    next.sync(); next.sync();
    expect(next.badges.map(badge => badge.label.textContent)).toEqual(["5,0", "4,5"]);
  });
  it.each(["{", "null", "43", "51", "44.5", '"48"'])("repara datos inválidos (%s)", initial => {
    const state = setup({ saved: new Map([["df:google-rating:123", initial]]) }); state.sync();
    expect(state.saved.get("df:google-rating:123")).toBe("44");
  });
  it("tolera storage bloqueado y conserva la nota durante la visita", () => {
    let calls = 0;
    const state = setup({ blocked: true, random: () => { calls++; return 0.5; } });
    expect(() => { state.sync(); state.sync(); }).not.toThrow();
    expect(calls).toBe(1);
    expect(state.badges[0].label.textContent).toBe("4,7");
  });
  it("sincroniza cambios de otras pestañas y no guarda ids de producto vacíos", () => {
    const state = setup({ ids: ["123", ""] }); state.sync();
    state.saved.set("df:google-rating:123", "49");
    state.listeners.get("storage")!({ key: "df:google-rating:123" });
    expect(state.badges[0].label.textContent).toBe("4,9");
    expect(state.saved.size).toBe(1);
    expect(state.badges[1].label.textContent).toBe("");
  });
  it("renderiza logo, estrellas y nota sin depender de una fuente configurada", () => {
    expect(snippet).toContain("data-df-google-rating");
    expect(snippet).toContain("data-df-fixed");
    expect(snippet).toContain("rating: 4.4");
    expect(snippet).toContain("data-df-google-score>4,4");
    expect(snippet).toContain("df-google-rating.js");
    expect(snippet).not.toContain("google_verified");
    expect(snippet).not.toContain("Valoración pendiente");
  });
});
