import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prepareAnalysisMutation, preparePatchMutation, prepareResearchMutation, type MutationContext } from "./mutations";
import { emptyGraph } from "./graph";
import { parseToolInput } from "./validation";
import { contextFixture, graphFixture, principalFixture, requestFixture } from "./test-fixtures";

function base(graph = graphFixture(), revision = 5): MutationContext {
  return { principal: principalFixture(), product: { id: contextFixture().product_id, userId: "merchant-a", deleting: false }, graph, revision, selectedDependencyIds: [], pricing: contextFixture().pricing, policiesStamp: "a".repeat(64), grant: null, assignId: randomUUID, now: new Date("2026-10-06T15:00:00Z"), methodologicalNotes: null, authorizedInternalReferences: new Set() };
}
describe("PI · preparación de mutaciones sin I/O", () => {
  it("persiste el grafo de cuatro personas con refs hacia arrays posteriores", () => {
    const context = base(); context.graph.persona = []; context.graph.jtbd = []; context.graph.pain = []; context.graph.desire = []; context.graph.objection = []; context.graph.angle = []; context.graph.customer_language = []; context.graph.offer = [];
    context.revision = 2;
    const result = prepareAnalysisMutation(context, parseToolInput("save_product_analysis", requestFixture("analysis-four-personas").payload));
    expect(result.graph.persona).toHaveLength(4); expect(result.graph.angle).toHaveLength(8);
    expect(result.graph.angle[0].value.jtbd_ids).toEqual([result.idMap.job_1]);
    expect(result.resultingRevision).toBe(3);
    expect(result.methodologicalNotes).toContain("ficticio");
    expect(context.graph.persona).toHaveLength(0);
  });
  it("merge omitido/vacío conserva datos; no-op no incrementa", () => {
    const context = base(); context.revision = 6;
    const result = prepareAnalysisMutation(context, parseToolInput("save_product_analysis", requestFixture("analysis-empty-keeps-data").payload));
    expect(result.graph).toEqual(context.graph); expect(result.noOp).toBe(true); expect(result.resultingRevision).toBe(6);
  });
  it("research crea source/fact/enlace en una sola preparación y no aprueba", () => {
    const context = base(emptyGraph(), 1);
    const result = prepareResearchMutation(context, parseToolInput("save_research", requestFixture("propose-research").payload));
    expect(result.graph.Fact[0].value.verification_status).toBe("unverified");
    expect(result.graph.EvidenceLink[0].value.fact_id).toBe(result.idMap.compartments_fact);
    expect(context.graph.Fact).toEqual([]);
  });
  it("batch inválido no modifica el grafo y dry-run no entrega IDs durables", () => {
    const context = base(emptyGraph(), 1);
    const input = parseToolInput("save_research", requestFixture("propose-research").payload);
    const preview = prepareResearchMutation(context, { ...input, dry_run: true });
    expect(preview.idMap).toEqual({}); expect(preview.resultingRevision).toBe(1); expect(context.graph.Fact).toEqual([]);
    input.evidence_links![0] = { ...input.evidence_links![0], source_ref: { client_ref: "missing" } };
    expect(() => prepareResearchMutation(context, input)).toThrow();
    expect(context.graph.Fact).toEqual([]);
  });
  it("cambio de costo o política no permite que oferta anuncie importes del chat", () => {
    const context = base(); const offer = context.graph.offer[0].value;
    const input = parseToolInput("save_product_analysis", { product_id: context.product.id, schema_version: "1.0", expected_revision: 5, idempotency_key: "offer-change-0001", analysis: { personas: [] }, offer: { id: offer.id, headline: "Otra propuesta" } });
    const result = prepareAnalysisMutation(context, input);
    expect(result.graph.offer[0].value.items.map((item) => item.price_minor)).toEqual(context.pricing!.packs.map((pack) => pack.price_minor));
  });
  it("refs internas no comprobadas y verificación sin grant son rechazadas", () => {
    const context = base(emptyGraph(), 1); context.principal = { ...context.principal, scopes: ["product_intelligence:write"] };
    const input = parseToolInput("save_research", requestFixture("propose-research").payload);
    input.sources![0] = { ...input.sources![0], url: null, internal_ref: { kind: "asset", id: context.product.id } };
    expect(() => prepareResearchMutation(context, input)).toThrow();
    input.sources![0] = { ...input.sources![0], url: "https://example.com/organizer", internal_ref: null };
    input.facts![0] = { ...input.facts![0], verification_status: "verified", usage_status: "approved" };
    expect(() => prepareResearchMutation(context, input)).toThrow("autorización");
  });
  it("rechaza revisión anterior antes de asignar IDs", () => {
    const context = base(emptyGraph(), 2);
    let assignments = 0; context.assignId = () => { assignments++; return randomUUID(); };
    expect(() => prepareResearchMutation(context, parseToolInput("save_research", requestFixture("propose-research").payload))).toThrow("cambió");
    expect(assignments).toBe(0);
  });
  it("patch actualiza campos tipados y rechaza un batch inválido sin cambios", () => {
    const context = base();
    const input = parseToolInput("patch_product_analysis", requestFixture("patch-hook").payload);
    const result = preparePatchMutation(context, input);
    expect(result.resultingRevision).toBe(6);
    expect(result.graph.angle[0].value.hook).not.toBe(context.graph.angle[0].value.hook);
    input.operations.push({ op: "update", entity: "persona", id: randomUUID(), changes: { name: "Ajeno" } });
    const original = structuredClone(context.graph);
    expect(() => preparePatchMutation(context, input)).toThrow();
    expect(context.graph).toEqual(original);
  });
  it("archiva y restaura manteniendo prioridades y protegiendo selección", () => {
    const context = base(); const angleId = context.graph.angle[0].value.id;
    const command = (op: "archive" | "restore", revision: number) => parseToolInput("patch_product_analysis", { product_id: context.product.id, schema_version: "1.0", expected_revision: revision, idempotency_key: "archive-angle-001", operations: [{ op, entity: "angle", id: angleId, reason: "Revisión de enfoque" }, ...context.graph.customer_language.map(({ value }) => ({ op, entity: "customer_language", id: value.id, reason: "Revisión de enfoque" }))] });
    context.selectedDependencyIds = [angleId];
    expect(() => preparePatchMutation(context, command("archive", 5))).toThrow("seleccionada");
    context.selectedDependencyIds = [];
    const archived = preparePatchMutation(context, command("archive", 5));
    expect(archived.graph.angle[0].value.lifecycle).toBe("archived");
    const restored = preparePatchMutation({ ...context, graph: archived.graph, revision: 6 }, command("restore", 6));
    expect(restored.graph.angle[0].value.lifecycle).toBe("active");
    expect(restored.graph.angle[0].value.archived_reason).toBeNull();
  });
  it("reordenar exige todo el conjunto y desplaza filas sin perder ediciones", () => {
    const context = base(); const second = structuredClone(context.graph.angle[0]);
    second.value.id = randomUUID(); second.value.priority = 2; context.graph.angle.push(second);
    const ids = context.graph.angle.map(({ value }) => value.id).reverse();
    const input = parseToolInput("patch_product_analysis", { product_id: context.product.id, schema_version: "1.0", expected_revision: 5, idempotency_key: "reorder-angle-001", operations: [{ op: "reprioritize", entity: "angle", persona_id: context.graph.persona[0].value.id, ordered_ids: ids }] });
    const result = preparePatchMutation(context, input);
    expect(result.graph.angle.map(({ value }) => value.priority)).toEqual([2, 1]);
    expect(result.graph.angle.every(({ value }) => value.last_revision === 6)).toBe(true);
    const reorder = input.operations[0]; if (reorder.op !== "reprioritize") throw new Error("fixture");
    reorder.ordered_ids.pop();
    expect(() => preparePatchMutation(context, input)).toThrow("todos");
  });
  it("no permite archivar una persona mientras sus entidades siguen activas", () => {
    const context = base();
    const input = parseToolInput("patch_product_analysis", { product_id: context.product.id, schema_version: "1.0", expected_revision: 5, idempotency_key: "archive-persona-001", operations: [{ op: "archive", entity: "persona", id: context.graph.persona[0].value.id, reason: "Descartar" }] });
    expect(() => preparePatchMutation(context, input)).toThrow();
    expect(context.graph.persona[0].value.lifecycle).toBe("active");
  });
  it("rechaza un ID repetido entre update y reprioritize sin regla de último gana", () => {
    const context = base(); const id = context.graph.angle[0].value.id;
    const input = parseToolInput("patch_product_analysis", { product_id: context.product.id, schema_version: "1.0", expected_revision: 5, idempotency_key: "duplicate-angle-001", operations: [{ op: "update", entity: "angle", id, changes: { hook: "Otro gancho" } }, { op: "reprioritize", entity: "angle", persona_id: context.graph.persona[0].value.id, ordered_ids: [id] }] });
    expect(() => preparePatchMutation(context, input)).toThrow("repitas");
    expect(context.graph.angle[0].value.hook).not.toBe("Otro gancho");
  });
  it("verify no hereda aprobación al cambiar contenido sin una revisión explícita", () => {
    const context = base(); const id = context.graph.Fact[0].value.id;
    const input = parseToolInput("save_research", { product_id: context.product.id, schema_version: "1.0", expected_revision: 5, idempotency_key: "review-change-001", facts: [{ id, statement: "La fuente indica tres compartimentos para organizar objetos." }] });
    expect(() => prepareResearchMutation(context, input)).toThrow("motivo explícito");
    input.facts![0] = { ...input.facts![0], reason: "Revisé la nueva formulación contra la fuente." };
    expect(() => prepareResearchMutation(context, input)).not.toThrow();
    const sourceInput = parseToolInput("save_research", { product_id: context.product.id, schema_version: "1.0", expected_revision: 5, idempotency_key: "source-change-001", sources: [{ id: context.graph.Source[0].value.id, title: "Ficha corregida" }] });
    expect(() => prepareResearchMutation(context, sourceInput)).toThrow("motivo explícito");
    sourceInput.facts = [{ id, reason: "Revisé la fuente actualizada y su respaldo." }];
    expect(() => prepareResearchMutation(context, sourceInput)).not.toThrow();
  });
});
