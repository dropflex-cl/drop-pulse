import { describe, expect, it } from "vitest";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { COMPONENT_ARGUMENTS, componentGenerationContext, pdpCompletionReport } from "./component-generation";
import { visualFixture } from "./visual-fixtures";
import { makeVisualRecord, prepareIdentity, prepareIteration, prepareVisualPlan, prepareBindings, prepareVisualReview, recordRef, targetKey, vHash } from "./visual-domain";
import { parseToolInput, parseToolOutput } from "./validation";

function contextFixture() {
  const f = visualFixture();
  f.state.knowledge = { product: { title: "Organizador" }, context: null, pricing: { price: 24990 }, policies: {}, graph: {},
    strategy: { id: f.strategy, snapshot: { angles: [{ id: f.angle, hook: "Cada útil en su lugar" }] } },
    landing: { rows: CATALOG.map(c => ({ component: c.id, content: c.examples[0], proposal: null, enabled: true, status: "approved", images: [] })),
      image_catalog: [{ source: "reference", id: f.reference }], review_count: 0, reviews: [] } };
  return f;
}
describe("Contexto de cada componente desde el tema y el hook", () => {
  it("cubre el catálogo completo con tareas argumentales distintas y contratos nativos", () => {
    const f = contextFixture(), ids = ["listing", ...CATALOG.map(c => c.id)];
    expect(Object.keys(COMPONENT_ARGUMENTS).sort()).toEqual([...ids].sort());
    expect(new Set(Object.values(COMPONENT_ARGUMENTS)).size).toBe(ids.length);
    for (const id of ids) {
      const result = componentGenerationContext(f.state, id);
      expect(result.primary_direction?.hook).toBe("Cada útil en su lugar");
      expect(result.other_arguments).toHaveLength(ids.length - 1);
      expect(JSON.stringify(result.component.schema)).toContain('"properties"');
      expect(result.canonical_reference).toMatchObject({ id: f.reference, content_hash: f.hash });
      expect(result.component.image_slots).toEqual(CATALOG.find(c => c.id === id)?.imageSlots ?? []);
      expect(parseToolOutput("get_component_generation_context", { ok: true, request_id: f.product, product_id: f.product, revision: 3,
        data: { etag: f.state.etag, dependency_stamp: f.state.dependency_stamp, ...result } }).ok).toBe(true);
    }
  });
  it("reporta vacíos, errores y medios faltantes conservando ocultos y descartados", () => {
    const f = contextFixture(), k = f.state.knowledge as ReturnType<typeof contextFixture>["state"]["knowledge"] & { landing: { rows: { component: string; content: unknown; enabled: boolean; status: string }[] } };
    k.landing.rows.find(r => r.component === "mechanism")!.content = { state: "empty" };
    k.landing.rows.find(r => r.component === "pain-block")!.content = {};
    k.landing.rows.find(r => r.component === "use-cases")!.enabled = false;
    k.landing.rows.find(r => r.component === "guarantee")!.status = "rejected";
    const before = JSON.stringify(f.state), result = pdpCompletionReport(f.state);
    expect(result.summary.content_pending).toEqual(expect.arrayContaining(["listing", "mechanism", "pain-block"]));
    expect(result.summary.content_pending).not.toContain("use-cases");
    expect(result.summary.media_pending).toEqual(expect.arrayContaining(["gif-strip", "ugc-slider", "review-slider"]));
    expect(result.summary.images_pending).toContain("insta-story");
    expect(result.components.find(c => c.component === "pain-block")!.variants[0].missing_fields.length).toBeGreaterThan(0);
    expect(result.components.find(c => c.component === "guarantee")!.discarded).toBe(true);
    expect(JSON.stringify(f.state)).toBe(before);
  });
  it("aísla destinos por variante, slot y posición y comprueba el formato nativo", () => {
    const f = contextFixture(), assetId = f.identity;
    f.state.files = [{ id: assetId, bucket: "page-media", storage_path: "a.webp", mime_type: "image/webp", width: 600, height: 600, size_bytes: 100, sha256: f.hash }];
    const asset = makeVisualRecord(f.state, "asset", { file_id: assetId }, "approved");
    f.state.records.push(asset);
    const targets = [1, 2, 3].map(position => ({ type: "landing_component" as const, component: "insta-story", content_variant_key: "default", slot: "stories", position }));
    expect(new Set(targets.map(targetKey)).size).toBe(3);
    for (const target of targets) f.state.targets.push({ key: targetKey(target), etag: f.hash, value: { target, detail: { slot: { ratio: "9:16" } } } });
    const bindings = prepareBindings(f.state, asset.id, targets.map(target => ({ target, target_etag: f.hash })));
    f.state.records.push(...bindings);
    expect(() => prepareVisualReview(f.state, { record_id: bindings[0].id, decision: "select", reason: "", tags: [] })).toThrow("formato del destino");
    expect(parseToolInput("get_component_generation_context", { product_id: f.product, component: "insta-story" })).toMatchObject({ content_variant_key: "default" });
    expect(() => componentGenerationContext(f.state, "insta-story", "missing")).toThrow("variante no existe");
  });
  it("una toma nueva usa la base vigente; el cambio no invalida archivos ni planes existentes", () => {
    const f = contextFixture(), identity = prepareIdentity(f.state, f.identityInput);
    f.state.records.push(identity); f.state.live[`identity:${identity.id}`] = { hash: f.hash, value: identity.payload, blocked: false };
    f.plan.identity_ref = recordRef(identity);
    const plan = prepareVisualPlan(f.state, f.plan); f.state.records.push(plan);
    const input = { plan_ref: recordRef(plan), shot_key: "hero", parent_asset_id: null, reference_asset_ids: [], based_on_review_ids: [], resolved_instruction: null, source_system: "chatgpt", model: null };
    expect(prepareIteration(f.state, input).payload.reference_image_ids).toEqual([f.reference]);
    f.state.live[`reference:${f.reference}`].value = { content_hash: vHash("new bytes") };
    expect(() => prepareIteration(f.state, input)).toThrow("imagen base cambió");
    expect(f.state.records.find(r => r.id === plan.id)).toBe(plan);
  });
});
