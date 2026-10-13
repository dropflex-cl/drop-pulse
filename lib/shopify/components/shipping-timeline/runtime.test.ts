import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./assets/df-shipping-timeline.js", import.meta.url), "utf8");

function mount(instant: string, config: Record<string, unknown> = {}, motion = { reduced: false, aboveFold: false }) {
  const { window, document } = parseHTML("<html><body></body></html>");
  let now = Date.parse(instant);
  const animations: { frames: Keyframe[]; options: KeyframeAnimationOptions; cancelled: boolean }[] = [];
  let nextTick = 0;
  const intersections: ((entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void)[] = [];
  let resize: (() => void) | undefined;
  const reduced = { matches: motion.reduced, addEventListener() {}, removeEventListener() {} };
  Object.assign(window, { matchMedia: () => reduced, innerHeight: 800 });
  Object.defineProperty(document, "visibilityState", { value: "visible", writable: true });
  const HTMLElement = window.HTMLElement;
  HTMLElement.prototype.getBoundingClientRect = () => ({ top: motion.aboveFold ? 100 : 1000 }) as DOMRect;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 280 });
  HTMLElement.prototype.animate = (frames, options) => {
    const animation = { frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, cancelled: false };
    animations.push(animation);
    return { cancel: () => { animation.cancelled = true; } } as Animation;
  };
  const styles = { direction: "ltr", animationDuration: "1.16s", transitionTimingFunction: "ease",
    getPropertyValue: (key: string) => key === "--df-dur-base" ? "200ms" : "ease" };
  class ClockDate extends Date { static now() { return now; } }
  class Intersection { constructor(callback: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void) { intersections.push(callback); } observe() {} disconnect() {} }
  class Resize { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} }
  class Mutation { observe() {} disconnect() {} }
  Object.assign(window, { IntersectionObserver: Intersection, ResizeObserver: Resize });
  runInNewContext(source, { window, document, HTMLElement, customElements: window.customElements, Intl, Date: ClockDate,
    IntersectionObserver: Intersection, ResizeObserver: Resize, MutationObserver: Mutation, getComputedStyle: () => styles,
    setTimeout: (_callback: unknown, delay: number) => { nextTick = delay; return 1; }, clearTimeout() {} });
  const cfg = { cutoff: 13, handling: 1, tmin: 2, tmax: 3, biz: true, sat: false, shipSat: false,
    holidays: [], city: "Santiago", extra: 2, tz: "America/Santiago", locale: "es-CL", format: "weekday", ...config };
  const texts = { countdown: "Pide dentro de {time} y recíbelo desde {arrive}", closed: "Pide hoy y recíbelo desde {arrive}",
    arrival: "Recíbelo desde {arrive}", cutoff: "Confirma antes de {cutoff}", dispatch: "Despacho estimado: {ship}", regions: "Regiones" };
  const template = document.createElement("template");
  template.innerHTML = `<df-shipping-timeline class="df-shipping-timeline--animate"><p data-df-title></p>
    <div data-df-countdown data-pending><p data-df-clock><b data-df-hours></b><b data-df-minutes></b><b data-df-seconds></b></p><p data-df-cutoff></p></div>
    <h3 data-df-arrival></h3><div class="df-shipping-timeline__calendar"><span data-df-calendar-weekday></span><b data-df-calendar-date></b><span data-df-calendar-month></span></div>
    <div class="df-shipping-timeline__route"><span class="df-shipping-timeline__parcel"></span><span class="df-shipping-timeline__rail-fill"></span></div><div class="df-shipping-timeline__dates"></div>
    <p data-df-ship></p><strong data-df-ship-date></strong><strong data-df-arrival-date></strong><p data-df-delivery></p><p data-df-delivery-regions></p>
    <script type="application/json" data-df-config>${JSON.stringify(cfg)}</script><script type="application/json" data-df-texts>${JSON.stringify(texts)}</script>
  </df-shipping-timeline>`;
  document.body.append(template.content);
  const el = document.querySelector("df-shipping-timeline")! as HTMLElement & { render(): void };
  const text = (selector: string) => el.querySelector(selector)?.textContent;
  return { el, text, animations, resize: () => resize?.(), enter: () => intersections.forEach(callback => callback([{ isIntersecting: true, intersectionRatio: 1 }])),
    exit: () => intersections.forEach(callback => callback([{ isIntersecting: false, intersectionRatio: 0 }])),
    time: (instant: string) => { now = Date.parse(instant); el.render(); }, nextTick: () => nextTick };
}

describe("tarjeta de despacho: reloj real y recorrido único", () => {
  it("separa contador, corte, calendario y rangos; recalcula al vencer sin reset artificial", () => {
    const page = mount("2026-10-12T15:00:00Z"); // Lunes, 12:00 en Santiago.
    expect(page.text("[data-df-hours]")).toBe("01");
    expect(page.text("[data-df-minutes]")).toBe("00");
    expect(page.text("[data-df-cutoff]")).toContain("hoy, 13:00");
    expect(page.text("[data-df-calendar-date]")).toBe("15");
    expect(page.text("[data-df-arrival]")).toBe("Recíbelo desde el jueves");
    const before = page.text("[data-df-delivery-regions]");
    page.time("2026-10-12T16:00:00Z");
    expect(page.text("[data-df-cutoff]")).toContain("mañana, 13:00");
    expect(page.text("[data-df-calendar-date]")).toBe("16");
    expect(page.text("[data-df-delivery-regions]")).not.toBe(before);
  });
  it("no presenta un contador lejano después del corte del viernes y salta el feriado", () => {
    const page = mount("2026-10-16T17:00:00Z", { holidays: ["2026-10-19"] });
    expect(page.el.querySelector("[data-df-countdown]")?.hasAttribute("hidden")).toBe(true);
    expect(page.text("[data-df-ship]")).toContain("miércoles");
    expect(page.text("[data-df-calendar-date]")).toBe("23");
  });
  it("el corte de medianoche y los sub minutos tienen etiquetas correctas", () => {
    const midnight = mount("2026-10-12T15:00:00Z", { cutoff: 0 });
    expect(midnight.text("[data-df-cutoff]")).toContain("mañana, 00:00");
    const near = mount("2026-10-12T15:59:50Z");
    expect(near.text("[data-df-minutes]")).toBe("00");
    expect(near.text("[data-df-seconds]")).toBe("10");
    near.time("2026-10-12T15:59:59Z");
    expect(near.text("[data-df-seconds]")).toBe("01");
    expect(near.nextTick()).toBeLessThanOrEqual(1050);
    near.time("2026-10-12T16:00:00Z");
    expect(near.text("[data-df-cutoff]")).toContain("mañana, 13:00");
    expect(near.text("[data-df-arrival-date]")).toContain("16");
  });
  it("anima una vez al entrar, usa tokens y no la cancela el resize inicial", () => {
    const page = mount("2026-10-12T15:00:00Z");
    page.enter(); page.resize(); page.enter();
    expect(page.animations).toHaveLength(3);
    expect(page.animations.every(animation => animation.options.duration === 1160 && !animation.cancelled)).toBe(true);
    // El paquete pequeño no se desplaza por encima del texto ni fuera de su espacio.
    const parcel = page.animations[0];
    expect(parcel.frames.every(frame => String(frame.translate).startsWith("0 "))).toBe(true);
    expect(parcel.frames.every(frame => Math.abs(parseFloat(String(frame.translate).split(" ")[1])) <= 4)).toBe(true);
    page.exit();
    expect(page.animations.every(animation => animation.cancelled)).toBe(true);
    page.enter();
    expect(page.animations).toHaveLength(3);
  });
  it.each([{ reduced: true, aboveFold: false }, { reduced: false, aboveFold: true }])("deja la escena estática con $reduced / sobre el pliegue $aboveFold", motion => {
    const page = mount("2026-10-12T15:00:00Z", {}, motion);
    page.enter();
    expect(page.animations).toHaveLength(0);
    expect(page.text("[data-df-calendar-date]")).toBe("15");
  });
});
