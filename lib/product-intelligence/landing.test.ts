import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { publishedSchemas } from "./mcp";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import { createLandingExecutor } from "./landing-service";
import { copyPhase } from "@/lib/products/stages";
import { contextFixture } from "./test-fixtures";

const id = randomUUID();
const owner: Principal = { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES };
const listing = { title: "Organizador para tu escritorio", short_name: "Organizador", short_description: "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",
  offer_line: "Organiza tu escritorio · Paga al recibir", seo_title: "Organizador para escritorio", seo_description: "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa." };
const request = () => ({ product_id: id, schema_version: "1.0", expected_revision: 1, expected_landing_etag: "a".repeat(64), idempotency_key: randomUUID(), entries: [{ component: "listing", content: listing }] });
function raw() { return { revision: 1, stamp: "b".repeat(64), landing_etag: "a".repeat(64), context_stale: false, rows: [], reviews: [], review_count: 0,
  snapshot: { context: null, settings: null, knowledge: { graph: { Fact: [] } }, pricing: { currency: "CLP", unit_cost: 4000, avg_shipping_cost: 3000, purchase_cost_limit: 3000,
    confirmation_rate: 75, delivery_rate: 75, sale_price: 19990, compare_at_price: null, extra_unit_discount: 50, minimum_price: 15000, recommended_price: 19990,
    profit: 6000, max_cpa: null, beroas: null, packs: [] } } }; }
describe("PI · contenido de Shopify desde chat", () => {
  it("deriva las 17 variantes del catálogo real, con campos y límites", () => {
    const schema = publishedSchemas().save_landing_content.input;
    expect(JSON.stringify(schema)).toContain("seo_description"); expect(JSON.stringify(schema)).toContain("faq-and-text");
    for (const c of CATALOG) expect(() => parseToolInput("save_landing_content", { ...request(), entries: [{ component: c.id, content: c.examples[0] }] })).not.toThrow();
  });
  it("rechaza IDs ajenos al catálogo, repetidos, HTML y campos inventados anidados", () => {
    expect(() => parseToolInput("save_landing_content", { ...request(), entries: [{ component: "fake", content: listing }] })).toThrow();
    const r = request(); expect(() => parseToolInput("save_landing_content", { ...r, entries: [...r.entries, ...r.entries] })).toThrow();
    expect(() => parseToolInput("save_landing_content", { ...r, entries: [{ component: "listing", content: { ...listing, title: "<b>Nombre de producto</b>" } }] })).toThrow();
    const c = CATALOG.find((c) => c.id === "inventory")!;
    expect(() => parseToolInput("save_landing_content", { ...r, entries: [{ component: c.id, content: { ...c.examples[0] as object, actual_stock: 500 } }] })).toThrow();
  });
  it("lee un contrato por llamada con catálogo y datos reales", async () => {
    const repository = { loadLanding: vi.fn(async () => raw()), commitLanding: vi.fn() };
    const run = createLandingExecutor(repository);
    const result = parseToolOutput("get_landing_content", await run(owner, { tool: "get_landing_content", input: parseToolInput("get_landing_content", { product_id: id, component: "faq-and-text" }) }, AbortSignal.timeout(1000)));
    expect(result).toMatchObject({ ok: true, data: { contract: { component: "faq-and-text" }, current: null, review_count: 0 } });
    if (result.ok) expect(result.data.catalog).toHaveLength(17); expect(repository.commitLanding).not.toHaveBeenCalled();
  });
  it("write no permite costos inventados, referencias de reseña ni saltar su mínimo", async () => {
    const repository = { loadLanding: vi.fn(async () => raw()), commitLanding: vi.fn() }, run = createLandingExecutor(repository);
    const call = (input: unknown) => run(owner, { tool: "save_landing_content", input: parseToolInput("save_landing_content", input) }, AbortSignal.timeout(1000));
    await expect(call({ ...request(), entries: [{ component: "listing", content: { ...listing, offer_line: "Llévalo por $99.999 · Paga al recibir" } }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const c = CATALOG.find((c) => c.id === "review-wall")!;
    await expect(call({ ...request(), entries: [{ component: c.id, content: c.examples[0] }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.commitLanding).not.toHaveBeenCalled();
  });
  it("no exige providers y reautoriza antes de replay", async () => {
    const result = { ok: true, product_id: id, revision: 1, request_id: id, data: { applied: true, dry_run: false, run_id: id, landing_etag: "c".repeat(64), components: [{ component: "listing", id, status: "generated" }], next_action: "Revisa" } };
    const repository = { loadLanding: vi.fn(async () => ({ replay: result })), commitLanding: vi.fn() }, run = createLandingExecutor(repository);
    const command = { tool: "save_landing_content" as const, input: parseToolInput("save_landing_content", request()) };
    expect(await run(owner, command, AbortSignal.timeout(1000))).toEqual(result);
    await expect(run({ ...owner, scopes: ["product_intelligence:read"] }, command, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.loadLanding).toHaveBeenCalledTimes(1);
  });
  it("evidencia contradictoria no respalda cifras de duración aunque el fact siga approved", async () => {
    const data = raw(), frozen = contextFixture();
    const fact = { ...frozen.strategy.facts[0], statement: "Rendimiento de treinta usos", value: "30 usos", verification_status: "verified", usage_status: "approved" };
    const link = { ...frozen.strategy.evidence_links[0], fact_id: fact.id, relation: "contradicts" };
    const repository = { loadLanding: vi.fn(async () => ({ ...data, snapshot: { ...data.snapshot, knowledge: { graph: { Fact: [fact], EvidenceLink: [link] } } } })), commitLanding: vi.fn() };
    const faq = CATALOG.find((c) => c.id === "faq-and-text")!.examples[0] as { items: unknown[] };
    const content = { ...faq, items: [...faq.items, { question: "¿Cuánto me dura?", answer: "Cada envase alcanza para treinta días, con 30 usos según el rendimiento.", topic: "duracion" }] };
    const command = { tool: "save_landing_content" as const, input: parseToolInput("save_landing_content", { ...request(), entries: [{ component: "faq-and-text", content }] }) };
    await expect(createLandingExecutor(repository)(owner, command, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(repository.commitLanding).not.toHaveBeenCalled();
  });
  it("contenido de chat permite revisión sin depender del pipeline viejo", () => {
    const facts = { price: 19990, currency: "CLP", copy: { fromChat: true, run: null, progress: { total: 1, enabled: 0, listing: "pending" as const, complete: false } } };
    expect(copyPhase(facts, "locked", false)).toBe("review");
  });
});
