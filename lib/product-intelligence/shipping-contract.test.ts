import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { shippingTimeline } from "@/lib/shopify/components/shipping-timeline/content";
import { productMetafields, type PublishInput } from "@/lib/shopify/publish/mapping";
import { createLandingExecutor } from "./landing-service";
import { componentGenerationContext, pdpCompletionReport } from "./component-generation";
import { visualFixture } from "./visual-fixtures";
import { parseToolInput } from "./validation";
import { PI_SCOPES } from "./policy";

const product = randomUUID();
const legacy = shippingTimeline.examples[1] as Record<string, unknown>;
const graphic = { ...legacy, heading: "Que el próximo lleve el tuyo", parcel_label: "Tu pedido", countdown_label: "El próximo despacho cierra en", arrival_template: "Recíbelo desde {arrive}",
  cutoff_template: "Confirma antes de {cutoff}", dispatch_template: "Despacho estimado: {ship}" };

describe("paridad del contrato de despacho gráfico", () => {
  it("descubre los campos opcionales sin volver incompleto el contenido anterior", () => {
    const f = visualFixture();
    f.state.knowledge = { product: { title: "Producto" }, context: null, pricing: {}, policies: {}, graph: {}, strategy: null,
      landing: { rows: [{ component: "shipping-timeline", content: legacy, proposal: null, enabled: true, status: "approved", images: [] }], image_catalog: [], reviews: [], review_count: 0 } };
    const context = componentGenerationContext(f.state, "shipping-timeline");
    for (const key of ["heading", "parcel_label", "countdown_label", "arrival_template", "cutoff_template", "dispatch_template"]) {
      expect(JSON.stringify(context.component.schema)).toContain(`"${key}"`);
    }
    expect(context.component.real_data.join(" ")).toContain("{cutoff}");
    expect(pdpCompletionReport(f.state).summary.content_pending).not.toContain("shipping-timeline");
  });
  it("valida y entrega al writer vigente las variantes; publicación conserva todos los textos", async () => {
    const variants = [{ key: "default", angle_id: null, hook_id: null, content: graphic },
      { key: "other", angle_id: "other-angle", hook_id: "other-hook", content: legacy }];
    const raw = { revision: 3, stamp: "b".repeat(64), landing_etag: "a".repeat(64), context_stale: false, rows: [], reviews: [], review_count: 0,
      snapshot: { context: null, settings: null, knowledge: { graph: {} }, pricing: { currency: "CLP", unit_cost: 4000, avg_shipping_cost: 3000,
        purchase_cost_limit: 3000, confirmation_rate: 75, delivery_rate: 75, sale_price: 19990, compare_at_price: null, extra_unit_discount: 50,
        minimum_price: 15000, recommended_price: 19990, profit: 6000, max_cpa: null, beroas: null, packs: [] } } };
    const writer = vi.fn(async () => ({ ok: true, request_id: randomUUID(), product_id: product, revision: 4,
      data: { landing_etag: "c".repeat(64), applied: true, dry_run: false, run_id: null, components: [{ component: "shipping-timeline", id: product, status: "generated" }], next_action: "Contenido guardado" } }));
    const input = parseToolInput("save_landing_content", { product_id: product, schema_version: "1.2", entries: [{ component: "shipping-timeline", content: variants }] });
    await createLandingExecutor({ loadLanding: vi.fn(async () => raw), commitLanding: writer })({ userId: product, actorId: product, actorKind: "merchant", scopes: PI_SCOPES },
      { tool: "save_landing_content", input }, AbortSignal.timeout(1000));
    expect(writer).toHaveBeenCalledWith(expect.objectContaining({ p_entries: [{ component: "shipping-timeline", content: variants }] }), expect.any(AbortSignal));
    const publish: PublishInput = { listing: { title: "Producto", short_name: "Producto", short_description: "Descripción del producto.", offer_line: "Oferta", seo_title: "Producto", seo_description: "Descripción del producto." },
      components: [{ id: "shipping-timeline", content: input.entries[0].content, images: {} }], reviews: [], packs: [], gallery: [], accent: "#0f766e" };
    const field = productMetafields(publish, new Map()).set.find(field => field.key === "shipping_timeline")!;
    expect(JSON.parse(field.value)).toMatchObject(variants);
  });
  it.each([
    { heading: "Quedan solo 3 cupos" },
    { parcel_label: "Paquete {stock}" },
    { cutoff_template: "Confirma antes de mañana a las 13" },
    { cutoff_template: "Confirma antes de {stock}" },
    { arrival_template: "Recíbelo el viernes" },
    { dispatch_template: "Sale en {time}" },
  ])("rechaza fechas inventadas y tokens que no corresponden ($cutoff_template $arrival_template $dispatch_template)", invalid => {
    expect(() => parseToolInput("save_landing_content", { product_id: product, entries: [{ component: "shipping-timeline", content: { ...graphic, ...invalid } }] })).toThrow();
  });
});
