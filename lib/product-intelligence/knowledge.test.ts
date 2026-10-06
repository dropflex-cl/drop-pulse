import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildPricingPlan } from "@/lib/pricing/plan";
import { contextPricing, pricingPersistence } from "./context";
import { cursorBinding, signContextCursor, verifyContextCursor } from "./context-cursor";
import { canonicalHash } from "./concurrency";
import { graphMutationResult, mutationContext, operationalHash, prepareStrategy, strategyResponse, type KnowledgeRead, type StoredStrategy } from "./knowledge";
import { knowledgeContextResponse } from "./knowledge-context";
import { prepareAnalysisMutation } from "./mutations";
import { buildStrategySnapshot, validateSnapshotClosure } from "./strategy";
import { contextFixture, graphFixture, principalFixture, requestFixture } from "./test-fixtures";
import { parseToolInput, parseToolOutput } from "./validation";

const secret = "z".repeat(40);
function fixture() {
  const ctx = contextFixture(), principal = principalFixture(), graph = graphFixture();
  const choice = parseToolInput("set_product_strategy", requestFixture("strategy-select").payload);
  if (choice.action === "archive") throw new Error("fixture");
  const state: KnowledgeRead["snapshot"] = { catalog: { id: ctx.product_id, title: "Catálogo", shopify_product_id: "123", currency: "CLP", is_upsell: false },
    context: ctx.product, pricing: pricingPersistence(buildPricingPlan({ unitCost: 4000, avgShippingCost: 9000, purchaseCostLimit: 5000, confirmationRate: 75, deliveryRate: 75, extraUnitDiscount: 50, salePrice: 29990, compareAtPrice: 39990 }, "CLP")!),
    settings: { country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: "2026-10-06T00:00:00Z" },
    numbers: null, images: [{ id: ctx.reference_images[0].id, is_base: true, is_cover: true, excluded: false, position: 1 }], pack_labels: null };
  const offer = graph.offer[0].value, price = contextPricing(state)!;
  offer.financial_snapshot = price; offer.pricing_stamp = price.pricing_stamp; offer.policies_stamp = canonicalHash(state.settings as never);
  offer.items.forEach((item) => { item.price_minor = price.packs.find((p) => p.units === item.units)!.price_minor; item.approved_label = null; });
  const id = randomUUID();
  const read: KnowledgeRead = { revision: 7, current_revision: 7, snapshot: state, currentSnapshot: structuredClone(state), stamp: "a".repeat(64), graph,
    currentGraph: structuredClone(graph), methodologicalNotes: null, activeStrategyId: id, currentActiveStrategyId: id,
    strategy: null, requestedStrategy: null, effectiveScopes: principal.scopes, grantExpiresAt: new Date(Date.now() + 3600000).toISOString(), internalReferences: new Set() };
  const version: StoredStrategy = { id, state: "selected", analysis_revision: 6, selection_revision: 7, snapshot: buildStrategySnapshot(graph, principal.userId, ctx.product_id, choice), operational_hash: operationalHash(read) };
  read.strategy = version; read.requestedStrategy = version;
  return { ctx, principal, read, version, choice };
}
describe("PI · lecturas y decisiones persistentes", () => {
  it("mantiene lista una selección al avanzar una revisión por otra hipótesis", () => {
    const { read, version, ctx } = fixture(); read.current_revision++;
    expect(strategyResponse(version, read, ctx.product_id).readiness).toMatchObject({ stale: false, ready_for_execution: true, needs_review: false });
  });
  it("separa divergencia de contenido y restricción de uso vigente", () => {
    const { read, version, ctx } = fixture(); read.currentGraph.angle[0].value.last_revision++;
    expect(strategyResponse(version, read, ctx.product_id).readiness).toMatchObject({ stale: true, needs_review: false });
    read.currentGraph.angle[0].value.last_revision--;
    read.currentGraph.EvidenceLink.push({ ...read.currentGraph.EvidenceLink[0], value: { ...read.currentGraph.EvidenceLink[0].value, id: randomUUID(), relation: "contradicts" } });
    expect(strategyResponse(version, read, ctx.product_id).readiness).toMatchObject({ stale: false, needs_review: true, ready_for_execution: false });
    expect(version.snapshot.evidence_links).toHaveLength(1);
  });
  it("un histórico seleccionado deja de habilitar ejecución al archivar hoy", () => {
    const { read, version, ctx } = fixture(); read.currentActiveStrategyId = null;
    expect(strategyResponse(version, read, ctx.product_id).readiness).toMatchObject({ ready_for_execution: false, missing_fields: ["strategy.selected"] });
  });
  it("cambiar precio o imagen hace stale; no altera el snapshot congelado", () => {
    const { read, version, ctx } = fixture(); read.currentSnapshot.pricing!.unit_cost = 4500;
    expect(strategyResponse(version, read, ctx.product_id).readiness.stale).toBe(true);
    expect(version.snapshot.offer!.financial_snapshot!.unit_cost_minor).toBe(4000);
    read.currentSnapshot = structuredClone(read.snapshot); read.currentSnapshot.images[0].excluded = true;
    expect(strategyResponse(version, read, ctx.product_id).readiness.stale).toBe(true);
  });
  it("core proyecta auxiliares; execution conserva cierre e inmutabilidad", () => {
    const { read, version, ctx } = fixture(); const core = strategyResponse(version, read, ctx.product_id, "core");
    expect(core.snapshot.objections).toEqual([]); expect(core.snapshot.customer_language).toEqual([]); expect(core.snapshot.angles[0].generation_guidance).toBeNull();
    expect(() => validateSnapshotClosure(core.snapshot)).not.toThrow();
    expect(strategyResponse(version, read, ctx.product_id, "execution").snapshot.objections.length).toBeGreaterThan(0);
  });
  it("dry_run de selección no publica IDs provisionales ni cambia puntero/revisión", () => {
    const { read, principal, choice } = fixture(); const before = structuredClone(read);
    const prepared = prepareStrategy(read, { ...choice, expected_revision: 7, based_on_revision: 7, dry_run: true, positioning: "Otra propuesta" }, principal, randomUUID(), randomUUID());
    expect(prepared.result).toMatchObject({ revision: 7, data: { strategy: null, active_strategy_id: read.activeStrategyId, applied: false } });
    expect(prepared.result.ok && prepared.result.data.preview).toBeTruthy(); expect(read).toEqual(before);
    expect(parseToolOutput("set_product_strategy", prepared.result)).toEqual(prepared.result);
  });
  it("rechaza based_on_revision vieja y selección de otro producto", () => {
    const { read, principal, choice } = fixture();
    expect(() => prepareStrategy(read, { ...choice, expected_revision: 7, based_on_revision: 6 }, principal, randomUUID(), randomUUID())).toThrow("cambió");
    expect(() => prepareStrategy(read, { ...choice, expected_revision: 7, based_on_revision: 7, primary_angle_id: randomUUID() }, principal, randomUUID(), randomUUID())).toThrow("referencia");
  });
  it("analysis puede guardarse antes de mercado/precio y las notas aparecen en diff", () => {
    const { read, principal, ctx } = fixture(); read.snapshot.settings = null; read.snapshot.pricing = null;
    const input = parseToolInput("save_product_analysis", { product_id: ctx.product_id, schema_version: "1.0", expected_revision: 7, idempotency_key: "notes-before-setup", analysis: { personas: [] }, methodological_notes: "Hipótesis del chat" });
    const mutation = mutationContext(read, principal, ctx.product_id, randomUUID); expect(mutation.pricing).toBeNull();
    const prepared = prepareAnalysisMutation(mutation, input);
    expect(graphMutationResult(read, prepared, ctx.product_id, randomUUID(), null)).toMatchObject({ revision: 8, data: { diff: [{ changed_fields: ["methodological_notes"] }] } });
    const ready = fixture(); ready.read.methodologicalNotes = prepared.methodologicalNotes;
    const response = knowledgeContextResponse(ready.read, parseToolInput("get_product_context", { product_id: ctx.product_id, include: ["research"] }), principal, randomUUID(), secret);
    expect(response.data.blocks[0].summary).toBe("Hipótesis del chat");
  });
  it("full pagina por items totales, summary declara conteos y campos con IDs", () => {
    const { read, principal, ctx } = fixture();
    const input = parseToolInput("get_product_context", { product_id: ctx.product_id, include: ["personas", "angles"], page_size: 1, view: "full" });
    const response = knowledgeContextResponse(read, input, principal, randomUUID(), secret);
    expect(response.data.blocks.flatMap((b) => b.items)).toHaveLength(1); expect(response.data.next_cursor).toBeTruthy();
    const cursor = verifyContextCursor(response.data.next_cursor!, cursorBinding(principal, input), secret);
    const next = knowledgeContextResponse(read, input, principal, randomUUID(), secret, cursor);
    expect(next.data.blocks.flatMap((b) => b.items)).toHaveLength(1);
    expect(next.data.blocks.flatMap((b) => b.items)[0].id).not.toBe(response.data.blocks.flatMap((b) => b.items)[0].id);
    const summary = knowledgeContextResponse(read, { ...input, view: "summary", page_size: 50 }, principal, randomUUID(), secret);
    expect(summary.data.blocks[0].items[0]).toMatchObject({ provenance: "canonical", id: read.graph.persona[0].value.id });
  });
  it("cursor liga actor, revisión y parámetros; detecta alteración y vencimiento", () => {
    const { principal, ctx } = fixture(); const input = parseToolInput("get_product_context", { product_id: ctx.product_id });
    const binding = cursorBinding(principal, input), now = 1000000;
    const cursor = signContextCursor({ binding, revision: 7, offset: 4, expires: 1100 }, secret);
    expect(verifyContextCursor(cursor, binding, secret, now).revision).toBe(7);
    expect(() => verifyContextCursor(cursor, binding, secret, 1100000)).toThrow("venció");
    expect(() => verifyContextCursor(cursor + "x", binding, secret, now)).toThrow("no corresponde");
    expect(() => verifyContextCursor(cursor, cursorBinding({ ...principal, actorId: "different" }, input), secret, now)).toThrow("no corresponde");
    expect(() => verifyContextCursor(cursor, cursorBinding(principal, { ...input, page_size: 1 }), secret, now)).toThrow("no corresponde");
  });
  it("restricciones actuales se entregan junto a los facts históricos de la página", () => {
    const { read, principal, ctx } = fixture(); read.currentGraph.Fact[0].value.usage_status = "prohibited";
    const input = parseToolInput("get_product_context", { product_id: ctx.product_id, include: ["facts"], view: "full" });
    const result = knowledgeContextResponse(read, input, principal, randomUUID(), secret);
    expect(result.data.blocks[0].items[0]).toMatchObject({ usage_status: "approved" }); expect(result.data.current_usage_restrictions[0].fact_id).toBe(read.graph.Fact[0].value.id);
  });
});
