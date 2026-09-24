import { describe, expect, it } from "vitest";
import { fromClp, fromMinorUnits, roundBudget, toMinorUnits } from "./currency";
import { derive, initiatedCheckoutsOf, sumMetrics, toInsightRow } from "./meta/insights";
import { buildTargeting, dynamicCreative, needsDynamicCreative, singleCreative, URL_TAGS } from "./meta/payloads";
import { buildPreset, countChanges, SYSTEM_PRESETS } from "./presets";
import { addDays, localDate, nextMorning, startLabel } from "./schedule";
import { adsetCount, dailyTotal, engineSchema, launchSchema } from "./schemas";

describe("currency", () => {
  it("usa la unidad mínima de cada moneda (CLP sin decimales, USD en centavos, KWD en milésimas)", () => {
    expect(toMinorUnits(5000, "CLP")).toBe(5000);
    expect(toMinorUnits(5, "USD")).toBe(500);
    expect(toMinorUnits(1.5, "KWD")).toBe(1500);
    expect(fromMinorUnits(1250, "USD")).toBe(12.5);
  });
  it("convierte los montos de plantilla a la moneda de la cuenta, redondeados", () => {
    expect(fromClp(5000, "CLP")).toBe(5000);
    expect(fromClp(4750, "USD")).toBe(5);
    expect(fromClp(40000, "COP")).toBe(173_900);
    expect(roundBudget(12, "CLP")).toBe(100);
  });
});

describe("insights", () => {
  it("lee compras omni_purchase y el máximo de las dos familias de pagos iniciados", () => {
    const row = toInsightRow(
      {
        ad_id: "9",
        date_start: "2026-09-22",
        spend: "4200.5",
        impressions: "1500",
        reach: "1200",
        inline_link_clicks: "30",
        actions: [
          { action_type: "omni_purchase", value: "2" },
          { action_type: "omni_initiated_checkout", value: "3" },
          { action_type: "initiate_checkout", value: "3" },
          { action_type: "add_payment_info", value: "5" },
        ],
        action_values: [{ action_type: "omni_purchase", value: "59980" }],
      },
      "ad",
    );
    expect(row).toMatchObject({ metaId: "9", spend: 4200.5, clicks: 30, purchases: 2, purchase_value: 59980, initiated_checkouts: 5 });
    expect(initiatedCheckoutsOf([])).toBe(0);
  });
  it("calcula CTR, CPA y ROAS sin dividir por cero", () => {
    const m = derive(sumMetrics([{ spend: 6000, impressions: 2000, reach: 0, clicks: 20, purchases: 2, purchase_value: 40000, initiated_checkouts: 0 }]));
    expect(m).toMatchObject({ ctr: 1, cpc: 300, cpa: 3000, cpm: 3000 });
    expect(m.roas).toBeCloseTo(6.67, 2);
    expect(derive(sumMetrics([])).cpa).toBeNull();
  });
});

describe("payloads", () => {
  const launch = { countries: ["CL"], excluded_regions: [{ key: "123", name: "Aysén" }], location: "home_recent" as const, min_age: 23 };
  it("público abierto con Advantage+ y las regiones excluidas", () => {
    expect(buildTargeting(launch, { kind: "open", interests: [] })).toEqual({
      geo_locations: { countries: ["CL"], location_types: ["home", "recent"] },
      excluded_geo_locations: { regions: [{ key: "123" }] },
      age_min: 23,
      targeting_automation: { advantage_audience: 1 },
    });
  });
  it("intereses apagan Advantage+ y van en flexible_spec", () => {
    const t = buildTargeting({ ...launch, excluded_regions: [], location: "home" }, { kind: "interests", interests: [{ id: "1", name: "Yoga" }] });
    expect(t.targeting_automation.advantage_audience).toBe(0);
    expect(t.flexible_spec).toEqual([{ interests: [{ id: "1", name: "Yoga" }] }]);
    expect(t.geo_locations.location_types).toEqual(["home"]);
  });
  it("un anuncio de ABO es un creativo normal con UTM", () => {
    const c = singleCreative("Ad", "page", { kind: "video", videoId: "v1", thumbnailHash: "h" }, { primaryText: "Texto", headline: "Título", description: "", link: "https://x.cl/products/y", cta: "SHOP_NOW" });
    expect(c.asset_feed_spec).toBeUndefined();
    expect(c.url_tags).toBe(URL_TAGS);
    expect(c.object_story_spec).toMatchObject({ page_id: "page", video_data: { video_id: "v1", image_hash: "h", message: "Texto", title: "Título" } });
    expect(needsDynamicCreative(1, { primaryTexts: ["a"], headlines: ["b"] })).toBe(false);
  });
  it("el DCO lleva todos los medios y textos", () => {
    const c = dynamicCreative("Ad", "p", [{ kind: "image", imageHash: "a" }, { kind: "video", videoId: "v", thumbnailHash: "t" }], { primaryTexts: ["1", "2"], headlines: ["h"], description: "d", link: "l", cta: "SHOP_NOW" });
    expect(c.asset_feed_spec).toMatchObject({ images: [{ hash: "a" }], videos: [{ video_id: "v", thumbnail_hash: "t" }], ad_formats: ["SINGLE_IMAGE", "SINGLE_VIDEO"] });
    expect(needsDynamicCreative(2, { primaryTexts: ["a"], headlines: ["b"] })).toBe(true);
  });
});

describe("schedule", () => {
  it("mañana a las 06:00 en la hora de la cuenta, también con horario de verano", () => {
    // Chile en septiembre: UTC−3 → 09:00Z.
    expect(nextMorning(new Date("2026-09-23T15:00:00Z"), 6, "America/Santiago")).toBe("2026-09-24T09:00:00.000Z");
    // Chile en julio: UTC−4 → 10:00Z.
    expect(nextMorning(new Date("2026-07-10T15:00:00Z"), 6, "America/Santiago")).toBe("2026-07-11T10:00:00.000Z");
    // Ciudad de México (UTC−6).
    expect(nextMorning(new Date("2026-09-23T15:00:00Z"), 5, "America/Mexico_City")).toBe("2026-09-24T11:00:00.000Z");
  });
  it("la fecha local y los rótulos", () => {
    expect(localDate(new Date("2026-09-24T02:00:00Z"), "America/Santiago")).toBe("2026-09-23");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(startLabel("2026-09-24T09:00:00.000Z", new Date("2026-09-23T15:00:00Z"), "America/Santiago")).toBe("mañana 6:00");
  });
});

describe("plantillas", () => {
  const ctx = { country: "CL", currency: "CLP", cpaLimit: 6000, creatives: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"], texts: { primary_texts: ["Texto"], headlines: ["Título"], description: "Paga al recibir" } };
  it("todas validan contra el esquema", () => {
    for (const p of SYSTEM_PRESETS) {
      const t = buildPreset(p.key, ctx);
      expect(t.structure).toBe(p.structure);
      expect(engineSchema.safeParse(t.engine).success, p.key).toBe(true);
      const launch = launchSchema.safeParse(t.launch);
      // Las de intereses piden elegirlos: es lo único que falta.
      if (!launch.success) expect(launch.error.issues.every((i) => i.path.includes("interests")), p.key).toBe(true);
    }
  });
  it("Impulso: 2 conjuntos de $5.000 a las 06:00, recomendar, tope 6× el total", () => {
    const t = buildPreset("impulso", ctx);
    expect(adsetCount(t.structure, t.launch)).toBe(2);
    expect(dailyTotal(t.structure, t.launch)).toBe(10_000);
    expect(t.launch).toMatchObject({ budget: 5000, start: "tomorrow", start_hour: 6, min_age: 18 });
    expect(t.engine.mode).toBe("suggest");
    expect(t.engine.rules.find((r) => r.type === "daily_cap")).toMatchObject({ amount: 60_000 });
  });
  it("GEM cruza cada creativo con los dos públicos", () => {
    const t = buildPreset("gem", ctx);
    expect(adsetCount(t.structure, t.launch)).toBe(4);
  });
  it("en USD los montos se convierten", () => {
    expect(buildPreset("tfl", { ...ctx, currency: "USD" }).launch.budget).toBe(5);
  });
  it("cuenta los cambios sobre la plantilla", () => {
    const base = buildPreset("impulso", ctx);
    const edited = structuredClone(base);
    edited.launch.min_age = 23;
    edited.launch.budget = 10_000;
    edited.engine.rules = edited.engine.rules.map((r) => (r.id === "pause-no-sales" ? { ...r, spend_x: 1.5 } : r));
    edited.launch.creatives = [];
    expect(countChanges(base, edited)).toBe(3);
  });
});
