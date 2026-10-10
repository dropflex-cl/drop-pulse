import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "components/_landing/assets/df-review-state.js"), "utf8");

function setup(initial?: string, blocked = false) {
  const saved = new Map(initial ? [["df:reviews:123", initial]] : []);
  const summary = { product_id: "123", summary: { count: 3, rating: 4.7 } };
  const counter = { textContent: "" };
  const slides = ["a", "b", "c"].map((id) => ({ dataset: { reviewId: id } }));
  const track = {
    children: [...slides],
    append(el: (typeof slides)[number]) {
      this.children = this.children.filter((child) => child !== el);
      this.children.push(el);
    },
    closest: () => null,
  };
  const window = { addEventListener: () => {}, DropFlexReviews: undefined as unknown as { sync: () => void } };
  runInNewContext(source, {
    window,
    document: {
      readyState: "loading", addEventListener: () => {},
      querySelector: (selector: string) => selector === "[data-df-review-state]" ? { textContent: JSON.stringify(summary) } : null,
      querySelectorAll: (selector: string) => selector === "[data-df-review-count]" ? [counter] : [track],
    },
    localStorage: {
      getItem(key: string) { if (blocked) throw new Error("blocked"); return saved.get(key) ?? null; },
      setItem(key: string, value: string) { if (blocked) throw new Error("blocked"); saved.set(key, value); },
    },
    Intl, Math,
  });
  return { saved, summary, counter, track, sync: window.DropFlexReviews.sync };
}

describe("reseñas compartidas por producto", () => {
  it("persiste un orden aleatorio y lo conserva en visitas y variantes", () => {
    const first = setup(); first.sync();
    const serialized = first.saved.get("df:reviews:123")!;
    const next = setup(serialized); next.sync();
    expect(next.track.children.map((s) => s.dataset.reviewId)).toEqual(JSON.parse(serialized).order);
    expect(next.counter.textContent).toBe("3");
  });
  it("una nueva publicación corrige cantidades antiguas y elimina ids retirados", () => {
    const state = setup(JSON.stringify({ count: 999, order: ["b", "removed", "b", "a"] }));
    state.summary.summary.count = 4;
    state.sync();
    const saved = JSON.parse(state.saved.get("df:reviews:123")!);
    expect(saved.count).toBe(4);
    expect(saved.order).toEqual(["b", "a", "c"]);
    expect(state.counter.textContent).toBe("4");
  });
  it("tolera caché corrupta y storage bloqueado", () => {
    const corrupt = setup("{"); expect(() => corrupt.sync()).not.toThrow();
    const blocked = setup(undefined, true);
    expect(() => blocked.sync()).not.toThrow();
    const order = blocked.track.children.map((s) => s.dataset.reviewId);
    blocked.sync();
    expect(blocked.track.children.map((s) => s.dataset.reviewId)).toEqual(order);
    expect(blocked.counter.textContent).toBe("3");
  });
});
