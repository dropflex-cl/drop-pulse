import { describe, expect, it } from "vitest";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { buildChatUgc, prepareUgcShots } from "./ugc-service";
import { ugcInputFixture } from "./ugc-fixtures";
import { parseToolInput } from "./validation";
import { montageName } from "@/lib/video/catalog";
import { ugcDestination } from "@/lib/ads/ugc-link";
import type { ScriptRow } from "@/lib/video/store";
const pricing = buildPricingPlan({ unitCost: 4000, avgShippingCost: 9000, purchaseCostLimit: 5000, confirmationRate: 75, deliveryRate: 75, extraUnitDiscount: 50, salePrice: 29990, compareAtPrice: 39990 }, "CLP")!;
const fixture = () => { const input = ugcInputFixture(); return { input, payload: buildChatUgc(input, pricing) }; };
describe("UGC desde chat", () => {
  it("arma K1 y claves, mantiene la apertura y valida sin proveedor", () => {
    const { payload } = fixture(); expect(payload.keyframes.map((k) => k.key)).toEqual(["K1", "K2", "K3"]);
    expect(payload.a_roll.map((a) => a.key)).toEqual(["A1", "A2", "A3", "A4"]); expect(payload.opening?.keyframe).toBe("K2");
  });
  it("rechaza voz con montos, tomas de otro guion y apertura incompatible", () => {
    const { input, payload } = fixture(); input.content.lines.a_roll[0].line = "Compra por $29.990.";
    expect(() => buildChatUgc(input, pricing)).toThrow("número");
    const script = { payload, format: "ugc", input: { market: { language: "es" } } } as unknown as ScriptRow & { payload: typeof payload };
    expect(() => prepareUgcShots(script, "keyframes", ["A1"])).toThrow("etapa");
    expect(() => prepareUgcShots(script, "clips", ["A7"])).toThrow("etapa");
  });
  it("separa escritura del chat y render; estimación solo de las tomas solicitadas", () => {
    expect(() => parseToolInput("generate_ugc", { ...ugcInputFixture(), stage: "script" })).toThrow();
    const { payload } = fixture(), script = { payload, format: "ugc", input: { market: { language: "es" } } } as unknown as ScriptRow & { payload: typeof payload };
    const one = prepareUgcShots(script, "keyframes", ["K1"]), all = prepareUgcShots(script, "keyframes", ["K1", "K2", "K3"]);
    expect(one.shots).toHaveLength(1); expect(all.estimated_usd).toBeCloseTo(one.estimated_usd*3);
    expect(prepareUgcShots(script, "clips", ["A1", "B1"]).shots.map((s) => s.kind)).toEqual(["a_roll", "b_roll"]);
  });
  it("conserva la tríada del hook en el plan y distingue archivos de ejecuciones", () => {
    const { input } = fixture(); input.content.plan.opening.first_motion = "A different motion.";
    expect(() => buildChatUgc(input, pricing)).toThrow("first_motion");
    expect(montageName("Organizador", 1, "ugc", "hook-a")).not.toBe(montageName("Organizador", 1, "ugc", "hook-b"));
    const another = ugcInputFixture(); another.content.plan.text_beats[0].text = "Otro texto";
    expect(() => buildChatUgc(another, pricing)).toThrow("screen");
  });
  it("preserva otros params, usa ángulo/hook por anuncio y rechaza mezclarlos", () => {
    const p = (hook: string) => ({ ugc_provenance: { landing_angle_id: "desk", landing_hook_id: hook } });
    expect(ugcDestination("https://tienda.test/products/a?utm_source=meta", [p("a")])).toBe("https://tienda.test/products/a?utm_source=meta&df_angle=desk&df_hook=a");
    expect(() => ugcDestination("https://tienda.test/products/a", [p("a"), p("b")])).toThrow("anuncios distintos");
    const staticMedia = { content_provenance: { kind: "static", landing_angle_id: "desk", landing_hook_id: "a" } };
    expect(ugcDestination("https://tienda.test/products/a?utm_source=meta", [staticMedia, p("a")])).toContain("utm_source=meta&df_angle=desk&df_hook=a");
    expect(() => ugcDestination("https://tienda.test/products/a", [staticMedia, p("b")])).toThrow("anuncios distintos");
    expect(() => ugcDestination("https://tienda.test/products/a", [{content_provenance: {landing_angle_id:"desk", landing_hook_id:"<script>"}}])).toThrow("selectores");
    expect(ugcDestination("https://tienda.test/products/a", [{}])).toBe("https://tienda.test/products/a");
  });
});
