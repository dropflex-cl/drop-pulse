import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";

const source = readFileSync(new URL("./assets/df-gif-strip.js", import.meta.url), "utf8");
function mount(reduced = false) {
  const { document, window } = parseHTML("<html><body></body></html>");
  const media = { matches: reduced, addEventListener: vi.fn() };
  let enter: (entries: { target: Element; isIntersecting: boolean }[]) => void = () => {};
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  class Observer { constructor(callback: typeof enter) { enter = callback; } observe = observer.observe; disconnect = observer.disconnect; }
  Object.assign(window, { matchMedia: () => media });
  runInNewContext(source, { customElements: window.customElements, HTMLElement: window.HTMLElement, window, document, AbortController, IntersectionObserver: Observer, clearTimeout, setTimeout });
  const host = document.createElement("df-gif-strip");
  host.innerHTML = [1, 2].map(index => `<div data-df-gif-frame><img alt="Demostración ${index}"><canvas hidden aria-hidden="true"></canvas><button data-df-gif-toggle hidden><span data-df-gif-pause>Pausar</span><span data-df-gif-play hidden>Reproducir</span></button></div>`).join("");
  const draw = vi.fn();
  for (const image of host.querySelectorAll("img")) Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 240 }, naturalHeight: { value: 240 } });
  for (const canvas of host.querySelectorAll("canvas")) Object.assign(canvas, { getContext: () => ({ drawImage: draw }) });
  document.body.appendChild(host);
  const frames = [...host.querySelectorAll("[data-df-gif-frame]")];
  return { document, window, host, frames, draw, observer, visible: (isIntersecting: boolean, index = 0) => enter([{ target: frames[index], isIntersecting }]) };
}
afterEach(() => vi.useRealTimers());

describe("demostraciones animadas con control del comprador", () => {
  it("reproduce continuamente la pieza visible y permite pausar y reanudar manualmente", () => {
    vi.useFakeTimers(); const view = mount(); view.visible(true);
    expect(view.frames[0].hasAttribute("data-paused")).toBe(false);
    expect(view.frames[1].hasAttribute("data-paused")).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(view.frames[0].hasAttribute("data-paused")).toBe(false);
    view.frames[0].querySelector("button")!.click();
    expect(view.frames[0].hasAttribute("data-paused")).toBe(true);
    expect(view.frames[0].querySelector("canvas")!.getAttribute("aria-label")).toBe("Demostración 1");
    view.visible(false); view.visible(true);
    expect(view.frames[0].hasAttribute("data-paused")).toBe(true);
    view.frames[0].querySelector("button")!.click();
    expect(view.frames[0].hasAttribute("data-paused")).toBe(false);
    expect(view.draw).toHaveBeenCalled();
  });
  it("el movimiento reducido comienza quieto y permite reproducir por acción explícita", () => {
    vi.useFakeTimers(); const view = mount(true); view.visible(true);
    expect(view.frames.every(frame => frame.hasAttribute("data-paused"))).toBe(true);
    view.frames[0].querySelector("button")!.click();
    expect(view.frames[0].hasAttribute("data-paused")).toBe(false);
  });
  it("reproduce todas las piezas visibles sin seleccionar una y reanuda al volver a ellas", () => {
    const view = mount(); view.visible(true); view.visible(true, 1);
    expect(view.observer.observe).toHaveBeenCalledTimes(2);
    expect(view.frames.every(frame => !frame.hasAttribute("data-paused"))).toBe(true);
    view.visible(false);
    expect(view.frames[0].hasAttribute("data-paused")).toBe(true);
    expect(view.frames[1].hasAttribute("data-paused")).toBe(false);
    view.visible(true);
    expect(view.frames.every(frame => !frame.hasAttribute("data-paused"))).toBe(true);
    view.frames[0].querySelector("button")!.click();
    view.visible(false, 1); view.visible(true, 1);
    expect(view.frames[0].hasAttribute("data-paused")).toBe(true);
    expect(view.frames[1].hasAttribute("data-paused")).toBe(false);
  });
  it("reanuda al volver a la pestaña sin convertir la pausa automática en una elección manual", () => {
    const view = mount(); view.visible(true);
    Object.defineProperty(view.document, "hidden", { configurable: true, value: true });
    view.document.dispatchEvent(new view.window.Event("visibilitychange"));
    expect(view.frames[0].hasAttribute("data-paused")).toBe(true);
    Object.defineProperty(view.document, "hidden", { configurable: true, value: false });
    view.document.dispatchEvent(new view.window.Event("visibilitychange"));
    expect(view.frames[0].hasAttribute("data-paused")).toBe(false);
  });
  it("desconectar el bloque cancela la observación", () => {
    vi.useFakeTimers(); const view = mount(); view.visible(true);
    view.host.remove();
    expect(view.observer.disconnect).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
