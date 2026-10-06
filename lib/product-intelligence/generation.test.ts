import { describe, expect, it } from "vitest";
import { freezeGenerationContext, type FreezeInput } from "./generation";
import { contextFixture, graphFixture, principalFixture, strategyFixture } from "./test-fixtures";

function inputFixture(): FreezeInput {
  const context = contextFixture();
  const graph = graphFixture();
  const strategy = strategyFixture();
  return {
    principal: principalFixture(), productId: context.product_id, currentRevision: 5, strategy, graph,
    product: context.product, market: context.market, policies: context.policies, pricing: context.pricing,
    referenceImages: context.reference_images.map((image) => ({ userId: "merchant-a", productId: context.product_id, id: image.id, contentHash: image.content_hash, isBase: image.is_base })),
    pageImages: context.selected_page_image_ids.map((id, index) => ({ userId: "merchant-a", productId: context.product_id, id, contentHash: "b".repeat(64), isBase: false, slot: index === 0 ? "cover" : "gallery" })),
    angleIds: context.selected_angle_ids, kind: "ugc_script", imageQaEnabled: false, promptVersions: context.prompt_versions, costPolicy: context.cost_policy, now: new Date(context.captured_at),
  };
}

describe("PI · contexto congelado", () => {
  it("genera un snapshot determinista con un ángulo y base primero, sin aliases legacy", () => {
    const input = inputFixture(); const first = freezeGenerationContext(input); const second = freezeGenerationContext(inputFixture());
    expect(first.contextHash).toBe(second.contextHash);
    expect(first.context.selected_angle_ids).toHaveLength(1);
    expect(first.context.reference_images[0].is_base).toBe(true);
    expect(JSON.stringify(first.context)).not.toMatch(/avatar_id|brief_id|angle_slot/);
    input.strategy.snapshot.angles[0].hook = "Cambió después";
    expect(first.context.strategy.angles[0].hook).not.toBe("Cambió después");
  });
  it.each(["stale", "revoked", "price", "base", "other_owner", "real_footage", "draft"] as const)("bloquea contexto %s antes de gasto", (scenario) => {
    const input = inputFixture();
    if (scenario === "stale") input.strategy.readiness.stale = true;
    if (scenario === "revoked") input.graph.Fact[0].value.usage_status = "prohibited";
    if (scenario === "price") input.pricing.pricing_stamp = "b".repeat(64);
    if (scenario === "base") input.referenceImages[0].isBase = false;
    if (scenario === "other_owner") input.referenceImages[0].userId = "merchant-b";
    if (scenario === "real_footage") input.strategy.snapshot.angles[0].generation_guidance!.opening_shot = "real_footage";
    if (scenario === "draft") input.strategy.state = "draft";
    expect(() => freezeGenerationContext(input)).toThrow();
  });
  it("landing content exige imágenes seleccionadas, pedir imágenes no las exige", () => {
    const input = inputFixture(); input.pageImages = []; input.kind = "landing_content";
    expect(() => freezeGenerationContext(input)).toThrow("contexto");
    input.kind = "landing_images";
    expect(() => freezeGenerationContext(input)).not.toThrow();
  });
  it("no permite ocultar una edición de ángulo o fact con readiness antiguo", () => {
    const input = inputFixture(); input.graph.angle[0].value.last_revision = 6;
    expect(() => freezeGenerationContext(input)).toThrow();
    input.graph.angle[0].value.last_revision = 3; input.graph.Fact[0].value.last_revision = 6;
    expect(() => freezeGenerationContext(input)).toThrow();
  });
  it.each(["persona", "jtbd", "pain", "desire", "Source", "EvidenceLink", "offer", "objection", "customer_language"] as const)("revalida la dependencia %s antes de congelar", (kind) => {
    const input = inputFixture(); input.graph[kind][0].value.last_revision = 6;
    expect(() => freezeGenerationContext(input)).toThrow();
  });
});
