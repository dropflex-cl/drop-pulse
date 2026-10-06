import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { buildPricingPlan, CLP_DEFAULTS } from "@/lib/pricing/plan";
import { packLabelsStale } from "@/lib/pricing/labels";
import { pricingPersistence } from "./context";
import { createPackLabelsExecutor, decidePackLabels } from "./pack-labels-service";
import { validateChatPackLabels } from "./pack-labels-validation";
import { parseToolInput, parseToolOutput } from "./validation";
import { PI_SCOPES, type Principal } from "./policy";
import { regeneratePackLabels } from "@/lib/pipeline/pack-labels";
import { contextFixture } from "./test-fixtures";

const id = randomUUID(), owner: Principal = { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES };
const plan = buildPricingPlan({ ...CLP_DEFAULTS, unitCost: 4000, salePrice: 29990, compareAtPrice: 39990, extraUnitDiscount: 50 }, "CLP")!;
const labels = plan.packs.map(({ units }) => ({ units, label: units === 1 ? "Uno para ti" : "Para compartir", support: null, badge: null, basis: "sharing" as const, reason: "Más unidades para compartir." }));
const input = () => ({ product_id: id, schema_version: "1.0", expected_revision: 1, expected_pack_labels_etag: "a".repeat(64), idempotency_key: randomUUID(), labels });
const raw = () => ({ revision: 1, stamp: "b".repeat(64), pack_labels_etag: "a".repeat(64), current: null, snapshot: { pricing: pricingPersistence(plan), knowledge: { graph: {} } } });
const fact = () => ({ ...contextFixture().strategy.facts[0], statement: "Duración por envase", value: "1 mes de uso", verification_status: "verified", usage_status: "approved" });
describe("PI · etiquetas de packs escritas en chat", () => {
  it("rechaza campos desconocidos, packs repetidos, distintivos múltiples y texto demasiado largo", () => {
    for (const request of [{ ...input(), approved: true }, { ...input(), labels: [labels[0], labels[0]] },
      { ...input(), labels: labels.map((l) => ({ ...l, badge: "Mejor" })) }, { ...input(), labels: [{ ...labels[0], label: "a".repeat(81) }] },
      { ...input(), labels: [{ ...labels[0], price: 1 }] }]) expect(() => parseToolInput("save_pack_labels", request)).toThrow();
  });
  it("exige exactamente los packs calculados y devuelve su orden sin truncar", () => {
    expect(validateChatPackLabels([...labels].reverse(), plan, [], {}, id, id)).toEqual(labels);
    expect(() => validateChatPackLabels(labels.slice(1), plan, [], {}, id, id)).toThrow("Cada pack");
  });
  it("montos y descuentos pertenecen a ese pack, y no admite HTML/tratamiento/claims", () => {
    for (const label of ["<b>Uno para ti</b>", "Tratamiento completo", "Cura todo", "$99.999", "Ahorras 98%"])
      expect(() => validateChatPackLabels([{ ...labels[0], label }, ...labels.slice(1)], plan, [], {}, id, id)).toThrow();
    const valid = [{ ...labels[0], support: "$29.990" }, ...labels.slice(1)];
    expect(validateChatPackLabels(valid, plan, [], {}, id, id)).toEqual(valid);
  });
  it("ni duración pequeña ni cantidades escritas en palabras eluden la evidencia", () => {
    for (const label of ["1 mes de uso", "Dos meses de uso"])
      expect(() => validateChatPackLabels([{ ...labels[0], label, basis: "duration" }, ...labels.slice(1)], plan, [], {}, id, id)).toThrow("duración");
  });
  it("duración usa cantidad/unidad real, sus múltiplos y facts actuales sin contradicción", () => {
    const f = fact(), duration = labels.map((l) => ({ ...l, label: `${l.units} ${l.units === 1 ? "mes" : "meses"} de uso`, basis: "duration" as const }));
    expect(validateChatPackLabels(duration, plan, [f.id], { Fact: [f] }, id, id)).toEqual(duration);
    expect(validateChatPackLabels(duration, plan, [f.id], { Fact: [{ ...f, value: 1, unit: "month" }] }, id, id)).toEqual(duration);
    for (const value of ["30 días de uso", "Dos meses de uso"])
      expect(() => validateChatPackLabels(duration, plan, [f.id], { Fact: [{ ...f, value }] }, id, id)).toThrow();
    expect(() => validateChatPackLabels(duration, plan, [randomUUID()], { Fact: [f] }, id, id)).toThrow();
    const e = { ...contextFixture().strategy.evidence_links[0], fact_id: f.id, relation: "contradicts" };
    expect(() => validateChatPackLabels(duration, plan, [f.id], { Fact: [f], EvidenceLink: [e] }, id, id)).toThrow();
  });
  it("lectura no escribe, entrega contrato y packs físicos; exige pricing para guardar", async () => {
    const repository = { loadPackLabels: vi.fn(async () => raw()), commitPackLabels: vi.fn() }, run = createPackLabelsExecutor(repository);
    const result = await run(owner, { tool: "get_pack_labels", input: { product_id: id } }, AbortSignal.timeout(1000));
    expect(result).toMatchObject({ ok: true, data: { current: null, pricing: { sale_price: 29990 }, contract: { type: "array" } } });
    expect(repository.commitPackLabels).not.toHaveBeenCalled();
    repository.loadPackLabels.mockResolvedValueOnce({ ...raw(), snapshot: { pricing: null, knowledge: { graph: {} } } } as unknown as ReturnType<typeof raw>);
    await expect(run(owner, { tool: "save_pack_labels", input: parseToolInput("save_pack_labels", input()) }, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("la lectura pagina facts completos para respetar el presupuesto de respuesta", async () => {
    const f = fact(), records = Array.from({ length: 50 }, () => ({ ...f, id: randomUUID(), statement: "x".repeat(7000), value: "1 mes de uso" }));
    const repository = { loadPackLabels: vi.fn(async () => ({ ...raw(), snapshot: { pricing: pricingPersistence(plan), knowledge: { graph: { Fact: records } } } })), commitPackLabels: vi.fn() };
    const result = parseToolOutput("get_pack_labels", await createPackLabelsExecutor(repository)(owner, { tool: "get_pack_labels", input: { product_id: id } }, AbortSignal.timeout(1000)));
    expect(result).toMatchObject({ ok: true, data: { duration_facts_has_more: true } });
    if (result.ok) {
      expect(result.data.duration_facts).toHaveLength(2);
      expect((result.data.duration_facts as { statement: string }[])[0].statement).toHaveLength(7000);
    }
  });
  it("scope e identidad se comprueban antes del replay; guardar no permite aprobar", async () => {
    const receipt = { ok: true, product_id: id, revision: 2, request_id: id, data: { applied: true, dry_run: false, proposal_id: id, status: "generated", pack_labels_etag: "c".repeat(64), next_action: "Revisa" } };
    const repository = { loadPackLabels: vi.fn(async () => ({ replay: receipt })), commitPackLabels: vi.fn() }, run = createPackLabelsExecutor(repository);
    const command = { tool: "save_pack_labels" as const, input: parseToolInput("save_pack_labels", input()) };
    expect(await run(owner, command, AbortSignal.timeout(1000))).toEqual(receipt);
    await expect(run({ ...owner, scopes: ["product_intelligence:read"] }, command, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.loadPackLabels).toHaveBeenCalledTimes(1); expect(repository.commitPackLabels).not.toHaveBeenCalled();
  });
  it("aprobación UI revalida duración vigente y transmite la versión leída", async () => {
    const f = fact(), current = { id, source: "mcp_chat", payload: labels, provenance: { duration_fact_ids: [f.id] } };
    const repository = { loadPackLabels: vi.fn(async () => ({ ...raw(), current, snapshot: { pricing: pricingPersistence(plan), knowledge: { graph: { Fact: [f] } } } })), commitPackLabels: vi.fn(async () => ({})) };
    await decidePackLabels(repository, owner, id, { action: "approve", expected_etag: "a".repeat(64) }, AbortSignal.timeout(1000));
    expect(repository.commitPackLabels).toHaveBeenCalledWith(expect.objectContaining({ p_action: "approve", p_etag: "a".repeat(64), p_fact_ids: [f.id] }), expect.any(AbortSignal));
    repository.loadPackLabels.mockResolvedValueOnce({ ...raw(), current, snapshot: { pricing: pricingPersistence(plan), knowledge: { graph: { Fact: [{ ...f, usage_status: "prohibited" }] } } } });
    await expect(decidePackLabels(repository, owner, id, { action: "approve", expected_etag: "a".repeat(64) }, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  });
  it("la acción anterior de generar etiquetas está retirada antes de cualquier llamada de IA", async () => {
    await expect(regeneratePackLabels(id, id)).rejects.toMatchObject({ status: 409 });
  });
  it("stale cubre cambio de moneda, packs removidos y evidencia revocada", () => {
    const row = { prices: plan.packs.map(({ units, price }) => ({ units, price })), provenance: { currency: "CLP" } };
    expect(packLabelsStale(row, plan)).toBe(false);
    expect(packLabelsStale(row, { ...plan, currency: "USD" })).toBe(true);
    expect(packLabelsStale(row, { ...plan, packs: plan.packs.slice(1) })).toBe(true);
    expect(packLabelsStale({ ...row, evidence_stale: true }, plan)).toBe(true);
  });
});
