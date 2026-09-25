import { describe, expect, it } from "vitest";
import { accentCheck, contrast, MIN_CONTRAST } from "@/lib/copy/accent";
import { EVENT_KINDS, EVENT_THEMES, eventTheme, eventThemeSchema } from "./catalog";
import {
  activeEvent,
  effectiveWindow,
  eventMetafield,
  eventPhase,
  METAFIELD_EVENTS_MAX,
  resolveProductEvents,
  themeWithOverrides,
  type ActivationRow,
  type EventRow,
} from "./resolve";

const day = 86_400_000;
const T0 = Date.parse("2026-11-20T12:00:00-03:00");

function event(p: Partial<EventRow> = {}): EventRow {
  return {
    id: "bf",
    slug: "black-friday-2026",
    kind: "black_friday",
    name: "Black Friday",
    market: "CL",
    campaign_starts_at: "2026-11-16T00:00:00-03:00",
    starts_at: "2026-11-27T00:00:00-03:00",
    ends_at: "2026-11-30T23:59:59-03:00",
    priority: 40,
    theme: {},
    ...p,
  };
}

function act(p: Partial<ActivationRow> = {}): ActivationRow {
  return { id: "a1", event_id: "bf", product_id: null, enabled: true, intensity: "medium", overrides: {}, starts_at: null, ends_at: null, updated_at: "", ...p };
}

describe("temas por defecto", () => {
  it.each(EVENT_KINDS)("%s valida y pasa contraste AA", (kind) => {
    const t = EVENT_THEMES[kind];
    expect(eventThemeSchema.parse(t)).toEqual(t);
    expect(accentCheck(t.accent).ok).toBe(true);
    expect(contrast(t.surface, t.on_surface)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("aplica los cambios del calendario y cae al del tipo si no validan", () => {
    expect(eventTheme("cyber", { badge_label: "CYBERMONDAY" }).badge_label).toBe("CYBERMONDAY");
    expect(eventTheme("cyber", { accent: "rojo" })).toEqual(EVENT_THEMES.cyber);
  });
});

describe("ventana", () => {
  it("usa la antesala del evento o la de la activación", () => {
    const w = effectiveWindow(event(), null);
    expect(w.from).toBe(Date.parse("2026-11-16T00:00:00-03:00"));
    expect(w.start).toBe(Date.parse("2026-11-27T00:00:00-03:00"));
    const custom = effectiveWindow(event(), { starts_at: "2026-11-28T00:00:00-03:00", ends_at: null });
    // El evento no empieza antes de lo que se ve.
    expect(custom.start).toBe(custom.from);
  });

  it("da la fase correcta", () => {
    const w = effectiveWindow(event(), null);
    expect(eventPhase(w, w.from - 1)).toBe("upcoming");
    expect(eventPhase(w, T0)).toBe("teaser");
    expect(eventPhase(w, w.start)).toBe("live");
    expect(eventPhase(w, w.to)).toBe("ended");
  });
});

describe("resolveProductEvents", () => {
  it("la activación del producto le gana a la de la tienda, también para apagarlo", () => {
    const events = [event()];
    const store = act({ id: "s", intensity: "subtle" });
    const product = act({ id: "p", product_id: "prod", intensity: "full" });
    expect(resolveProductEvents(events, [store, product], "prod", T0)[0]).toMatchObject({ scope: "product", intensity: "full" });
    expect(resolveProductEvents(events, [store, product], "otro", T0)[0]).toMatchObject({ scope: "store", intensity: "subtle" });
    const off = act({ id: "p", product_id: "prod", enabled: false });
    expect(resolveProductEvents(events, [store, off], "prod", T0)).toEqual([]);
  });

  it("deja fuera lo terminado y ordena por prioridad", () => {
    const events = [event(), event({ id: "hw", kind: "halloween", slug: "halloween-2026", priority: 10, ends_at: "2026-11-01T23:59:59-03:00", campaign_starts_at: "2026-10-17T00:00:00-03:00", starts_at: "2026-10-31T00:00:00-03:00" }), event({ id: "nav", kind: "christmas", slug: "navidad-2026", priority: 20, campaign_starts_at: "2026-12-01T00:00:00-03:00", starts_at: "2026-12-18T00:00:00-03:00", ends_at: "2026-12-24T23:59:59-03:00" })];
    const acts = [act(), act({ id: "a2", event_id: "hw" }), act({ id: "a3", event_id: "nav" })];
    const list = resolveProductEvents(events, acts, "prod", T0);
    expect(list.map((r) => r.event.slug)).toEqual(["black-friday-2026", "navidad-2026"]);
    expect(activeEvent(list, T0)?.event.slug).toBe("black-friday-2026");
    expect(activeEvent(list, T0 + 12 * day)?.event.slug).toBe("navidad-2026");
  });

  it("si dos se cruzan, se ve el de mayor prioridad", () => {
    const events = [event(), event({ id: "cy", kind: "cyber", slug: "cyber-bf", priority: 30 })];
    const list = resolveProductEvents(events, [act(), act({ id: "a2", event_id: "cy" })], "prod", T0);
    expect(activeEvent(list, T0)?.event.id).toBe("bf");
  });
});

describe("overrides", () => {
  it("un acento sin contraste se ignora", () => {
    expect(themeWithOverrides(event(), { accent: "#fde047" }).accent).toBe(EVENT_THEMES.black_friday.accent);
    expect(themeWithOverrides(event(), { accent: "#1F4BD8" }).accent).toBe("#1f4bd8");
    expect(themeWithOverrides(event(), { announcement: "Solo este finde" }).announcement).toBe("Solo este finde");
  });
});

describe("eventMetafield", () => {
  const copy = { event_id: "bf", announcement: "Black Friday en tu cocina", subtitle: "El mejor precio del año", badge_label: "BLACK" };

  it("cada intensidad enciende sus capas", () => {
    const [subtle] = resolveProductEvents([event()], [act({ intensity: "subtle" })], "p", T0);
    const s = eventMetafield([subtle], [copy], T0)!.events[0];
    expect(s.accent).toBeUndefined();
    expect(s.countdown_before).toBeUndefined();
    expect(s.subtitle).toBeUndefined();
    expect(s.announcement).toBe(EVENT_THEMES.black_friday.announcement);

    const [full] = resolveProductEvents([event()], [act({ intensity: "full" })], "p", T0);
    const f = eventMetafield([full], [copy], T0)!.events[0];
    expect(f).toMatchObject({ accent: "#111827", on_accent: "#ffffff", decor: "tag", subtitle: copy.subtitle, announcement: copy.announcement });
    expect(f.to).toBe(Math.floor(Date.parse("2026-11-30T23:59:59-03:00") / 1000));
  });

  it("sin eventos es null; con muchos, lleva los más próximos ordenados por prioridad", () => {
    expect(eventMetafield([], [], T0)).toBeNull();
    const at = (i: number) => new Date(Date.parse("2026-12-01T00:00:00-03:00") + i * 10 * day).toISOString();
    // e0 es el más lejano pero el de mayor prioridad: queda fuera igual.
    const many = Array.from({ length: 6 }, (_, i) => event({ id: `e${i}`, slug: `e${i}`, priority: i === 0 ? 99 : i, campaign_starts_at: at(5 - i), starts_at: at(5 - i), ends_at: at(6 - i) }));
    const list = resolveProductEvents(many, many.map((e, i) => act({ id: `a${i}`, event_id: e.id })), "p", T0);
    const value = eventMetafield(list, [], T0)!;
    expect(value.events.map((e) => e.slug)).toEqual(["e5", "e4", "e3", "e2"].slice(0, METAFIELD_EVENTS_MAX));
  });
});

describe("fechas para la pantalla", async () => {
  const { rangeLabel, daysUntil, phaseLabel, parseDateInput, dateInput } = await import("./view");
  const tz = "America/Santiago";
  const w = effectiveWindow(event(), null);

  it("rango y días que faltan en la zona de la tienda", () => {
    expect(rangeLabel(Date.parse("2026-10-05T00:00:00-03:00"), Date.parse("2026-10-07T23:59:59-03:00"), tz)).toBe("5 – 7 oct");
    expect(rangeLabel(Date.parse("2026-09-28T00:00:00-03:00"), Date.parse("2026-10-07T23:59:59-03:00"), tz)).toBe("28 sep – 7 oct");
    expect(rangeLabel(Date.parse("2026-11-11T00:00:00-03:00"), Date.parse("2026-11-11T23:59:59-03:00"), tz)).toBe("11 nov");
    expect(daysUntil(Date.parse("2026-09-24T22:00:00-03:00"), Date.parse("2026-10-05T00:00:00-03:00"), tz)).toBe(11);
    expect(phaseLabel("teaser", w, T0, tz)).toBe("En antesala · el evento empieza en 7 días");
    expect(phaseLabel("live", w, w.start, tz)).toBe("En curso · termina el 30 nov");
  });

  it("los campos de fecha van de 00:00 a 23:59:59 en la zona", () => {
    expect(parseDateInput("2026-11-30", "end", tz)).toBe(new Date("2026-11-30T23:59:59-03:00").toISOString());
    expect(parseDateInput("2026-11-16", "start", tz)).toBe(new Date("2026-11-16T00:00:00-03:00").toISOString());
    expect(parseDateInput("30/11", "end", tz)).toBeNull();
    expect(dateInput(w.to, tz)).toBe("2026-11-30");
  });
});

describe("tema de Shopify", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { DECOR_PATHS } = await import("./decor");
  const { DECOR_KEYS } = await import("./catalog");
  const dir = join(process.cwd(), "lib", "shopify", "components", "_event", "snippets");

  it("los adornos del Liquid y de la vista previa son los mismos", () => {
    const liquid = readFileSync(join(dir, "df-event-decor.liquid"), "utf8");
    for (const key of DECOR_KEYS) expect(liquid).toContain(`when '${key}'\n      assign d = '${DECOR_PATHS[key]}'`);
  });

  it("todo texto del metafield se imprime escapado", () => {
    for (const f of ["df-event-bar.liquid", "df-event-badge.liquid", "df-event-countdown.liquid"]) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const m of src.matchAll(/\{\{\s*ev\.(announcement|badge_label|name|countdown_before|countdown_during|subtitle)\b[^}]*\}\}/g)) expect(m[0]).toContain("escape");
    }
  });
});
