import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { pricingPersistence, prepareProductContext, productContextResponse, storedPricingPlan, type ContextRead } from "./context";
import { storedDecimal } from "./pricing";
import { parseToolInput, parseToolOutput } from "./validation";
import { createContextExecutor } from "./service";
import { contextAccess, contextDatabaseError } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import type { ToolInputs } from "./schemas";

const productId = "00000000-0000-4000-8000-000000000001";
const principal: Principal = { userId: productId, actorId: productId, actorKind: "merchant", scopes: PI_SCOPES };
function read(): ContextRead {
  return { revision: 0, current_revision: 0, stamp: "a".repeat(64), snapshot: {
    catalog: { id: productId, title: "Catálogo", shopify_product_id: "123", currency: "CLP", is_upsell: false }, context: null, pricing: null, images: [], numbers: null,
    settings: { country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: null },
  } };
}
function input(): ToolInputs["save_product_context"] {
  return parseToolInput("save_product_context", { product_id: productId, schema_version: "1.0", expected_revision: 0,
    idempotency_key: "context-fixture", context: { display_name: "Producto", description: "Datos del comerciante" }, pricing: { mode: "recommended", unit_cost_minor: 4000 } });
}
describe("PI · servicio de contexto", () => {
  it("calcula packs con la calculadora existente y expone sus supuestos", () => {
    const candidate = prepareProductContext(read(), input(), randomUUID());
    expect(candidate.result).toMatchObject({ ok: true, revision: 1, data: { applied: true, pricing: { unit_cost_minor: 4000, extra_unit_discount: 50 } } });
    expect(candidate.pricing?.packs).toHaveLength(3);
    expect(candidate.result.warnings.map((warning) => warning.field)).toContain("pricing.avg_shipping_cost_minor");
    expect(parseToolOutput("save_product_context", candidate.result)).toEqual(candidate.result);
  });
  it("requiere costo explícito, sin usar costo del catálogo ni una IA", () => {
    const request = input(); request.pricing = { mode: "recommended", confirmation_rate: 75 };
    expect(() => prepareProductContext(read(), request, randomUUID())).toThrow("costo del proveedor");
    delete request.pricing;
    expect(() => prepareProductContext(read(), request, randomUUID())).toThrow("costo del proveedor");
  });
  it("no completa nombre/descripción desde el catálogo ni desde análisis legacy", () => {
    const request = input(); request.context = { supplier_text: "Proveedor" };
    expect(() => prepareProductContext(read(), request, randomUUID())).toThrow("nombre y la descripción");
  });
  it("un parche conserva omitidos, admite null y no aumenta revisión si es idéntico", () => {
    const request = input(), initial = read();
    const candidate = prepareProductContext(initial, request, randomUUID());
    initial.revision = initial.current_revision = 1;
    initial.snapshot.context = candidate.context;
    initial.snapshot.pricing = candidate.pricing;
    const same = prepareProductContext(initial, { ...request, expected_revision: 1 }, randomUUID());
    expect(same.result).toMatchObject({ revision: 1, data: { no_op: true, applied: false, diff: [] } });
    const patched = prepareProductContext(initial, { ...request, expected_revision: 1, context: { category: null, supplier_text: "Texto nuevo" } }, randomUUID());
    expect(patched.context).toMatchObject({ display_name: "Producto", description: "Datos del comerciante", category: null, supplier_text: "Texto nuevo" });
  });
  it("dry_run calcula sin mutar la lectura ni aumentar la revisión", () => {
    const initial = read(), before = structuredClone(initial);
    const candidate = prepareProductContext(initial, { ...input(), dry_run: true }, randomUUID());
    expect(candidate.result).toMatchObject({ revision: 0, data: { applied: false, dry_run: true, no_op: false } });
    expect(initial).toEqual(before);
  });
  it("rechaza revisiones viejas y referencias de imagen de otro producto", () => {
    expect(() => prepareProductContext(read(), { ...input(), expected_revision: 1 }, randomUUID())).toThrow("cambió desde tu lectura");
    const request = input(); request.context!.base_reference_image_id = randomUUID();
    expect(() => prepareProductContext(read(), request, randomUUID())).toThrow("referencia");
  });
  it("no pierde precisión ni desborda numeric al guardar", () => {
    const plan = storedPricingPlan(prepareProductContext(read(), input(), randomUUID()).pricing)!;
    expect(() => pricingPersistence({ ...plan, confirmationRate: 75.555 })).toThrow("más precisión");
    expect(() => pricingPersistence({ ...plan, salePrice: 1e12 })).toThrow("rango");
  });
  it("respeta la precisión decimal física y conserva números históricos sin recalcularlos", () => {
    expect(storedDecimal(1.005, 2)).toBe(1.01); expect(storedDecimal(-1.005, 2)).toBe(-1.01);
    const row = prepareProductContext(read(), input(), randomUUID()).pricing!;
    const historical = storedPricingPlan({ ...row, profit: 123.45, recommended_price: 29990 })!;
    expect(historical.profit).toBe(123.45); expect(historical.recommendedPrice).toBe(29990);
  });
  it("solo incluye etiquetas aprobadas con el precio vigente", () => {
    const state = read(); state.snapshot.pricing = prepareProductContext(state, input(), randomUUID()).pricing;
    const plan = storedPricingPlan(state.snapshot.pricing)!;
    state.snapshot.pack_labels = { status: "approved", payload: [{ units: 2, label: "Para compartir" }], prices: plan.packs.map(({ units, price }) => ({ units, price })) };
    const request = parseToolInput("get_product_context", { product_id: productId });
    const approved = productContextResponse(state, request, randomUUID());
    expect(approved.ok && approved.data.product.pricing?.packs.find((pack) => pack.units === 2)?.approved_label).toBe("Para compartir");
    state.snapshot.pack_labels.status = "generated";
    const generated = productContextResponse(state, request, randomUUID());
    expect(generated.ok && generated.data.product.pricing?.packs.find((pack) => pack.units === 2)?.approved_label).toBeNull();
    state.snapshot.pack_labels.status = "approved"; state.snapshot.pack_labels.prices[0].price++;
    const stale = productContextResponse(state, request, randomUUID());
    expect(stale.ok && stale.data.product.pricing?.packs.find((pack) => pack.units === 2)?.approved_label).toBeNull();
  });
  it("un cambio de moneda no reutiliza costos ni supuestos monetarios anteriores", () => {
    const state = read(); state.snapshot.pricing = prepareProductContext(state, input(), randomUUID()).pricing;
    state.snapshot.catalog.currency = "USD";
    expect(() => prepareProductContext(state, { ...input(), pricing: { mode: "recommended", unit_cost_minor: 400 } }, randomUUID())).toThrow("supuestos que faltan");
    const response = productContextResponse(state, parseToolInput("get_product_context", { product_id: productId }), randomUUID());
    expect(response.ok && response.warnings[0].code).toBe("PRICING_CURRENCY_CHANGED");
  });
  it("declara vacíos canónicos y unknown para auxiliares, sin atribuirles estrategia", () => {
    const response = productContextResponse(read(), parseToolInput("get_product_context", { product_id: productId, include: ["facts", "pdp", "performance"] }), randomUUID());
    expect(parseToolOutput("get_product_context", response)).toEqual(response);
    if (!response.ok) throw new Error("fixture");
    expect(response.data.blocks.map((block) => block.availability)).toEqual(["snapshot", "unknown", "unknown"]);
    expect(response.data.readiness).toMatchObject({ ready_for_execution: false, missing_fields: ["context", "pricing.unit_cost_minor", "strategy"] });
    expect(response.data.product.policies.delivery).toBeNull();
    expect(response.data.product.market.confirmed).toBe(false);
  });
  it("no inventa mercado y rechaza cursores sin contexto de lectura", () => {
    const state = read(); state.snapshot.settings = null;
    expect(() => productContextResponse(state, parseToolInput("get_product_context", { product_id: productId }), randomUUID())).toThrow("mercado");
    expect(() => productContextResponse(read(), parseToolInput("get_product_context", { product_id: productId, cursor: "ajeno" }), randomUUID())).toThrow("cursor");
  });
  it("liga identidad delegada al principal verificado y no a los argumentos", () => {
    expect(() => contextAccess({ ...principal, actorKind: "delegated", clientId: randomUUID() })).toThrow("identidad delegada");
  });
  it("replay sucede antes de validar CAS/preparar un cambio o llamar commit", async () => {
    const result = prepareProductContext(read(), input(), randomUUID()).result;
    const repository = { load: vi.fn(async () => ({ replay: result })), commit: vi.fn() };
    expect(await createContextExecutor(repository)(principal, { tool: "save_product_context", input: input() }, new AbortController().signal)).toEqual(result);
    expect(repository.commit).not.toHaveBeenCalled();
  });
  it("valida el output antes del commit y manda únicamente los campos preparados", async () => {
    const repository = { load: vi.fn(async () => read()), commit: vi.fn(async (args: Record<string, unknown>) => args.p_result) };
    await createContextExecutor(repository)(principal, { tool: "save_product_context", input: input() }, new AbortController().signal);
    expect(repository.commit.mock.calls[0][0]).toMatchObject({ p_access: { user_id: productId, actor_kind: "merchant" }, p_expected_revision: 0, p_stamp: "a".repeat(64), p_base_image: null });
  });
  it("no conecta tools que aún carecen de persistencia", async () => {
    const repository = { load: vi.fn(), commit: vi.fn() };
    await expect(createContextExecutor(repository)(principal, { tool: "get_product_strategy", input: { product_id: productId, include: "core" } }, new AbortController().signal)).rejects.toMatchObject({ code: "EXECUTION_NOT_READY" });
    expect(repository.load).not.toHaveBeenCalled();
  });
  it("errores SQL no exponen tablas, consultas ni datos", () => {
    expect(contextDatabaseError({ code: "23514", message: "secret raw row" })).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(contextDatabaseError({ message: "PI_REVISION_CONFLICT" })).toMatchObject({ code: "REVISION_CONFLICT" });
    expect(contextDatabaseError({ code: "40P01", message: "secret sql" })).toMatchObject({ code: "INTERNAL_ERROR", retryable: true });
    expect(contextDatabaseError({ message: "secret database" }).message).not.toContain("secret");
  });
});
