import { describe, expect, it } from "vitest";
import { authorizeResearchChanges, ReferenceResolver, usageRestrictions, validateGraph, validateStrategyChoice, assertNoArchivedSelectionDependencies } from "./graph";
import { authorizeTool, checkArtifact, checkRevision, type DelegatedGrant } from "./policy";
import { commandHash, replayReceipt, canonicalHash } from "./concurrency";
import { calculateProductPricing, currencyScale, toMajor, toMinor, pricingSnapshot } from "./pricing";
import { buildPricingPlan, CLP_DEFAULTS, DEFAULT_EXTRA_UNIT_DISCOUNT } from "@/lib/pricing/plan";
import { contextFixture, graphFixture, principalFixture, requestFixture, strategyFixture } from "./test-fixtures";
import { parseToolInput } from "./validation";

describe("PI · pertenencia, evidencia y selección", () => {
  it("acepta un grafo ficticio completo y no declara un ganador", () => {
    const graph = graphFixture();
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).not.toThrow();
    const input = parseToolInput("set_product_strategy", requestFixture("strategy-select").payload);
    if (input.action === "archive") throw new Error("Fixture incorrecta");
    expect(() => validateStrategyChoice(graph, input)).not.toThrow();
    expect(strategyFixture().state).toBe("selected");
  });
  it("rechaza un dueño distinto y referencias cruzadas entre productos/personas", () => {
    const graph = graphFixture(); graph.pain[0].userId = "merchant-b";
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow();
    graph.pain[0].userId = "merchant-a"; graph.pain[0].productId = "other-product";
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow();
    graph.pain[0].productId = contextFixture().product_id;
    graph.persona.push({ ...structuredClone(graph.persona[0]), value: { ...graph.persona[0].value, id: "00000000-0000-0000-0000-000000000999", priority: 2 } });
    graph.pain[0].value.persona_id = graph.persona[1].value.id;
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow();
  });
  it("exige fuente para observed y nota para validated", () => {
    const graph = graphFixture(); graph.persona[0].value.epistemic_status = "observed";
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow("evidencia");
    graph.persona[0].value.evidence = [{ source_id: graph.Source[0].value.id, fragment: graph.Source[0].value.excerpt, relation: "contextualizes" }];
    graph.persona[0].value.epistemic_status = "validated";
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow("cómo validaste");
  });
  it("separa voz sintética de testimonio observado", () => {
    const graph = graphFixture(); graph.customer_language[0].value.type = "customer_quote";
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow("sintético");
    graph.customer_language[0].value.origin = "observed";
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow("fuente");
  });
  it("rechaza fuente ambigua, fragmento inexistente, y aprobación sin verificación", () => {
    const graph = graphFixture(); graph.Source[0].value.internal_ref = { kind: "asset", id: contextFixture().product_id };
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow("solo una");
    graph.Source[0].value.internal_ref = null; graph.EvidenceLink[0].value.fragment = "Fragmento inventado";
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow("excerpt");
    graph.EvidenceLink[0].value.fragment = graph.Source[0].value.excerpt;
    graph.Fact[0].value.verification_status = "unverified";
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow("verificados");
  });
  it("exige verify al cambiar un fact, source o respaldo ya revisado", () => {
    const previous = graphFixture(); const ordinary = { ...principalFixture(), scopes: ["product_intelligence:write" as const] };
    for (const kind of ["Fact", "Source", "EvidenceLink"] as const) {
      const next = structuredClone(previous);
      if (kind === "Fact") next.Fact[0].value.statement = "Afirmación nueva";
      if (kind === "Source") next.Source[0].value.excerpt = "Fuente cambiada";
      if (kind === "EvidenceLink") next.EvidenceLink[0].value.fragment = "Respaldo cambiado";
      expect(() => authorizeResearchChanges(ordinary, previous, next)).toThrow();
      expect(() => authorizeResearchChanges(principalFixture(), previous, next)).not.toThrow();
    }
  });
  it("conserva nueva contradicción ordinaria y bloquea su uso", () => {
    const previous = graphFixture(); const next = structuredClone(previous);
    next.EvidenceLink.push({ ...structuredClone(next.EvidenceLink[0]), value: { ...next.EvidenceLink[0].value, id: "00000000-0000-0000-0000-000000000888", relation: "contradicts" } });
    expect(() => authorizeResearchChanges({ ...principalFixture(), scopes: ["product_intelligence:write"] }, previous, next)).not.toThrow();
    expect(usageRestrictions(next)[0].fact_id).toBe(next.Fact[0].value.id);
    expect(previous.EvidenceLink).toHaveLength(1);
  });
  it("quitar respaldo revisado exige verify, un cambio solo de revisión no", () => {
    const previous = graphFixture(); const ordinary = { ...principalFixture(), scopes: ["product_intelligence:write" as const] };
    const next = structuredClone(previous); next.EvidenceLink = [];
    expect(() => authorizeResearchChanges(ordinary, previous, next)).toThrow();
    const metadata = structuredClone(previous); metadata.Fact[0].value.last_revision++;
    expect(() => authorizeResearchChanges(ordinary, previous, metadata)).not.toThrow();
  });
  it("protege archivos de selección y prioridades sin huecos", () => {
    const graph = graphFixture(); graph.angle[0].value.lifecycle = "archived";
    expect(() => assertNoArchivedSelectionDependencies(graph, [graph.angle[0].value.id])).toThrow("estrategia seleccionada");
    graph.angle[0].value.lifecycle = "active"; graph.persona[0].value.priority = 3;
    expect(() => validateGraph(graph, "merchant-a", contextFixture().product_id)).toThrow("contiguas");
  });
  it("resuelve refs locales por tipo, rechaza duplicados y no permite IDs ajenos", () => {
    const resolver = new ReferenceResolver(graphFixture(), "merchant-a", contextFixture().product_id);
    resolver.register("persona", { client_ref: "local_persona" }, () => "00000000-0000-0000-0000-000000000777");
    expect(resolver.resolve("persona", { client_ref: "local_persona" })).toBe(resolver.idMap().local_persona);
    expect(() => resolver.resolve("pain", { client_ref: "local_persona" })).toThrow();
    expect(() => resolver.register("persona", { client_ref: "local_persona" }, () => "other")).toThrow();
    expect(() => resolver.resolve("persona", { id: "other-owner-id" })).toThrow();
  });
});

describe("PI · permisos, revisión y replay", () => {
  const input = parseToolInput("save_product_analysis", requestFixture("analysis-four-personas").payload);
  const product = { id: input.product_id, userId: "merchant-a", deleting: false };
  const now = new Date("2026-10-06T15:00:00Z");
  it("no permite acceso ajeno ni gasto con permiso write solamente", () => {
    expect(() => authorizeTool(principalFixture(), { ...product, userId: "merchant-b" }, "save_product_analysis", input, null, now)).toThrow("No encontramos");
    const generate = parseToolInput("generate_ugc", requestFixture("start-keyframes").payload);
    expect(() => authorizeTool({ ...principalFixture(), scopes: ["product_intelligence:write"] }, product, "generate_ugc", generate, null, now)).toThrow();
  });
  it("revalida grants y limita scopes efectivos, incluso antes de replay", () => {
    const principal = { ...principalFixture(), actorKind: "delegated" as const, clientId: "client-a" };
    const grant: DelegatedGrant = { userId: principal.userId, actorId: principal.actorId, clientId: "client-a", productId: product.id, scopes: ["product_intelligence:write"], revoked: false, expiresAt: "2026-10-07T00:00:00Z" };
    expect(authorizeTool(principal, product, "save_product_analysis", input, grant, now).scopes).toEqual(["product_intelligence:write"]);
    expect(() => authorizeTool(principal, product, "save_product_analysis", input, { ...grant, revoked: true }, now)).toThrow();
    expect(() => authorizeTool(principal, product, "save_product_analysis", input, { ...grant, productId: "other" }, now)).toThrow();
  });
  it("revisión y etag cubren cambios distintos", () => {
    expect(() => checkRevision(5, 6)).toThrow("cambió");
    expect(() => checkArtifact("a".repeat(64), "b".repeat(64))).toThrow("pieza cambió");
    expect(() => checkRevision(5, 5)).not.toThrow();
  });
  it("replay devuelve recibo original; otra intención/key no se acepta", () => {
    const result = { ok: false as const, request_id: contextFixture().product_id, error: { code: "INTERNAL_ERROR" as const, message: "Fixture", retryable: true, details: {} } };
    const receipt = { tool: "save_product_analysis" as const, userId: "merchant-a", productId: product.id, key: input.idempotency_key, payloadHash: commandHash("save_product_analysis", input), requiredScopes: ["product_intelligence:write" as const], expiresAt: "2026-10-07T00:00:00Z", result };
    expect(replayReceipt(receipt, principalFixture(), "save_product_analysis", input, now)).toEqual(result);
    expect(() => replayReceipt(receipt, principalFixture(), "save_product_analysis", { ...input, expected_revision: 3 }, now)).toThrow("otro contenido");
    expect(replayReceipt(receipt, principalFixture(), "save_product_analysis", { ...input, dry_run: true }, now)).toBeNull();
    expect(replayReceipt({ ...receipt, expiresAt: "invalid" }, principalFixture(), "save_product_analysis", input, now)).toBeNull();
  });
  it("el hash normaliza sets/keys pero conserva orden significativo y null", () => {
    expect(canonicalHash({ fact_ids: ["b", "a"], name: "x" })).toBe(canonicalHash({ name: "x", fact_ids: ["a", "b"] }));
    expect(canonicalHash({ secondary_angle_ids: ["b", "a"] })).not.toBe(canonicalHash({ secondary_angle_ids: ["a", "b"] }));
    expect(canonicalHash({ selected_page_image_ids: ["b", "a"] })).not.toBe(canonicalHash({ selected_page_image_ids: ["a", "b"] }));
    expect(canonicalHash({})).not.toBe(canonicalHash({ value: null }));
  });
});

describe("PI · calculadora compartida y precisión", () => {
  it("reproduce el precio/packs guardado con el servicio existente", () => {
    const setup = parseToolInput("save_product_context", requestFixture("setup-price").payload);
    const calculated = calculateProductPricing(setup.pricing!, "CLP", null, {});
    expect(calculated.snapshot.packs.map((pack) => pack.price_minor)).toEqual(contextFixture().pricing.packs.map((pack) => pack.price_minor));
    expect(calculated.snapshot.packs[2].per_unit_price_decimal).toBe(contextFixture().pricing.packs[2].per_unit_price_decimal);
    expect(calculated.snapshot.max_cpa_decimal).toBe(contextFixture().pricing.max_cpa_decimal);
  });
  it("costo solo aplica defaults CLP inyectados; sin defaults exige faltantes", () => {
    const input = { mode: "recommended" as const, unit_cost_minor: 7000 };
    const calculated = calculateProductPricing(input, "CLP", null, { ...CLP_DEFAULTS, extraUnitDiscount: DEFAULT_EXTRA_UNIT_DISCOUNT });
    expect(calculated.plan.salePrice).toBe(27990);
    expect(calculated.defaultedFields).toContain("avg_shipping_cost_minor");
    expect(() => calculateProductPricing(input, "USD", null, {})).toThrow("supuestos");
    expect(() => calculateProductPricing({ mode: "recommended", avg_shipping_cost_minor: 0 }, "CLP", null, { unitCost: 7000, ...CLP_DEFAULTS, extraUnitDiscount: 50 })).toThrow("proveedor");
  });
  it("conversión exacta en CLP y USD; no usa reglas de Meta ni redondea entradas", () => {
    expect(currencyScale("CLP")).toBe(0); expect(currencyScale("USD")).toBe(2);
    expect(toMinor("70.00", 2)).toBe(7000); expect(toMajor(7000, 2)).toBe(70);
    expect(() => toMinor("70.001", 2)).toThrow("precisión");
    expect(() => toMinor("9007199254740992", 0)).toThrow("rango");
    expect(() => currencyScale("XXX")).toThrow();
  });
  it("rechaza tasas/precios inválidos y conserva rentabilidad del cálculo actual", () => {
    const setup = parseToolInput("save_product_context", requestFixture("setup-price").payload);
    expect(() => calculateProductPricing({ ...setup.pricing!, delivery_rate: 0 }, "CLP", null, {})).toThrow("Precio y packs");
    const plan = buildPricingPlan({ unitCost: 7000, ...CLP_DEFAULTS, salePrice: 29990, compareAtPrice: 44990, extraUnitDiscount: 50 }, "CLP")!;
    expect(pricingSnapshot(plan).profit_decimal).toBe(String(plan.profit));
  });
});
