import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";

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
      querySelectorAll: (selector: string) => selector === "[data-df-review-count]" ? [counter] : selector === "[data-df-review-order]" ? [track] : [],
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
  it("normaliza cifras históricas al rango 4,4–4,9 sin rellenar notas ausentes", () => {
    for (const [input, expected] of [[5, 4.9], [3, 4.4], [4.46, 4.5]]) {
      const state = setup(); state.summary.summary.rating = input; state.sync();
      expect(JSON.parse(state.saved.get("df:reviews:123")!).rating).toBe(expected);
    }
    const state = setup(); Object.assign(state.summary.summary, { rating: null }); state.sync();
    expect(JSON.parse(state.saved.get("df:reviews:123")!).rating).toBeNull();
  });
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


describe("agregados compartidos al cambiar una variante", () => {
  it("sin importaciones sincroniza Google, textos, estrellas y caché; conserva notas individuales", () => {
    const { document } = parseHTML(`<html><body>
      <script data-df-review-state></script>
      <div data-df-rating-group data-df-rating-stars><span data-df-rating-template="Calificado {rating}/5 en Google"></span><span data-df-rating-template="({count} reseñas)"></span><span class="df-stars"><span class="df-visually-hidden"></span></span></div>
      <div data-df-rating-group data-df-rating-stars><span data-df-rating-template="{rating} · {count} reseñas"></span><span class="df-stars"><span class="df-visually-hidden"></span></span></div>
      <div id="individual"><span class="df-stars" style="--df-stars-fill:80%"></span></div>
    </body></html>`);
    document.querySelector('[data-df-review-state]')!.textContent = JSON.stringify({ product_id: "123", summary: { rating: 4.7, count: 1234,
      variants: [{ key: "default", angle_id: null, hook_id: null, rating: 4.7, count: 1234 }, { key: "hook", angle_id: "routine", hook_id: "morning", rating: 4.9, count: 18 }] } });
    const saved = new Map<string, string>();
    const selection = { angle: "", hook: "" };
    const window = { addEventListener() {}, DropFlexLanding: { selection: () => selection }, DropFlexReviews: undefined as unknown as { sync(): void } };
    runInNewContext(source, { window, document, Intl, Math, localStorage: { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) } });
    window.DropFlexReviews.sync();
    expect(document.body.textContent).toContain("Calificado 4,7/5 en Google");
    expect(document.body.textContent).toContain("(1.234 reseñas)");
    selection.angle = "routine"; selection.hook = "morning";
    window.DropFlexReviews.sync();
    expect(document.body.textContent).toContain("Calificado 4,9/5 en Google");
    expect(document.body.textContent).toContain("4,9 · 18 reseñas");
    for (const el of document.querySelectorAll('[data-df-rating-stars] .df-stars')) expect(el.getAttribute("style")).toContain("98%");
    expect(document.querySelector('#individual .df-stars')!.getAttribute("style")).toContain("80%");
    expect(JSON.parse(saved.get("df:reviews:123")!)).toMatchObject({ rating: 4.9, count: 18 });
  });
});
