// Opt-in, usuarios ficticios, URL local exacta; sin proveedores ni publicación.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createProductIntelligenceExecutor, PERSISTED_INTELLIGENCE_TOOLS } from "./knowledge-service";
import { createProductIntelligenceServer } from "./mcp";
import { contextAccess, createContextRepository } from "./repository";
import { decidePackLabels } from "./pack-labels-service";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import type { ToolName } from "./schemas";
import type { PackLabel } from "@/lib/pricing/labels-schemas";

const signal = () => AbortSignal.timeout(15000);
const labels: PackLabel[] = [1, 2, 3].map((units) => ({ units, label: units === 1 ? "Uno para ti" : "Para compartir", support: null, badge: null, basis: "sharing", reason: "Unidades para compartir." }));
describe.runIf(process.env.PI_LOCAL_TEST === "1")("PI · etiquetas persistentes en Supabase local", () => {
  let db: SupabaseClient, execute: ReturnType<typeof createProductIntelligenceExecutor>, owner: Principal, other: Principal, product: string;
  const users: string[] = [];
  async function checked<T extends { error: unknown }>(request: PromiseLike<T>) { const r = await request; if (r.error) throw new Error(JSON.stringify(r.error)); return r; }
  async function merchant() {
    const r = await checked(db.auth.admin.createUser({ email: `pi-packs-${randomBytes(8).toString("hex")}@example.test`, password: randomBytes(32).toString("base64url"), email_confirm: true }));
    const id = r.data.user!.id; users.push(id);
    await checked(db.from("merchant_settings").insert({ user_id: id, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: new Date().toISOString() }));
    return { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES } as Principal;
  }
  async function call<K extends ToolName>(tool: K, input: unknown, principal = owner) { return parseToolOutput(tool, await execute(principal, { tool, input: parseToolInput(tool, input) } as Parameters<typeof execute>[1], signal())); }
  async function read() { const r = await call("get_pack_labels", { product_id: product }); if (!r.ok) throw new Error("read"); return r; }
  async function input() { const r = await read(); return { product_id: product, schema_version: "1.0", expected_revision: r.revision, expected_pack_labels_etag: r.data.pack_labels_etag, idempotency_key: randomUUID(), labels }; }
  async function price(cost = 4000) { const r = await read(); return call("save_product_context", { product_id: product, schema_version: "1.0", expected_revision: r.revision, idempotency_key: randomUUID(), pricing: { mode: "recommended", unit_cost_minor: cost } }); }
  async function count(table: string) { return (await checked(db.from(table).select("*", { head: true, count: "exact" }).eq("product_id", product))).count; }
  async function counts() { return Promise.all(["pack_labels", "pi_revisions", "pi_audit_events", "pi_idempotency_records"].map(count)); }
  async function current() { const r = await read(); return r.data.current as { id: string; status: string; payload: PackLabel[]; evidence_stale: boolean }; }
  async function approve(action: "approve" | "reopen" = "approve", expected?: string) {
    return decidePackLabels(createContextRepository(db), owner, product, { action, expected_etag: expected ?? (await read()).data.pack_labels_etag }, signal());
  }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    execute = createProductIntelligenceExecutor(createContextRepository(db)); owner = await merchant(); other = await merchant();
  }, 20000);
  beforeEach(async () => { product = randomUUID(); await checked(db.from("products").insert({ id: product, user_id: owner.userId, shopify_product_id: product, title: "Organizador", currency: "CLP" })); });
  afterAll(async () => { for (const id of users) await checked(db.auth.admin.deleteUser(id)); }, 20000);
  it("lectura vacía no crea filas y guardar necesita pricing", async () => {
    expect(await read()).toMatchObject({ revision: 0, data: { pricing: null, current: null } }); expect(await counts()).toEqual([0, 0, 0, 0]);
    await expect(call("save_pack_labels", await input())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("dry_run no crea IDs, historia, audit ni receipt", async () => {
    await price(); const before = await counts();
    expect(await call("save_pack_labels", { ...await input(), dry_run: true })).toMatchObject({ data: { dry_run: true, applied: false, proposal_id: null } });
    expect(await counts()).toEqual(before);
  });
  it("propuesta generada, snapshot exacto, revisión/audit atómicos; cero AI/publicación", async () => {
    await price(); const i = await input(), r = await call("save_pack_labels", i);
    expect(r).toMatchObject({ revision: i.expected_revision + 1, data: { status: "generated", applied: true } });
    const row = (await checked(db.from("pack_labels").select("*").eq("product_id", product).single())).data!;
    expect(row).toMatchObject({ source: "mcp_chat", model: "chat", status: "generated", provenance: { analysis_revision: i.expected_revision, actor_id: owner.userId } });
    expect(row.provenance.snapshot.pricing).toBeTruthy(); expect(row.prices.map((p: { units: number }) => p.units)).toEqual([1, 2, 3]);
    const audit = (await checked(db.from("pi_audit_events").select("operation,actor_id").eq("product_id", product).eq("operation", "pack_labels_propose").single())).data!;
    expect(audit.actor_id).toBe(owner.userId); expect(await count("ai_generations")).toBe(0); expect(await count("product_publications")).toBe(0);
  });
  it("replay precede CAS, carga distinta rechaza, no-op no crea revisión/propuesta", async () => {
    await price(); const i = await input(), r = await call("save_pack_labels", i);
    expect(await call("save_pack_labels", i)).toEqual(r);
    await expect(call("save_pack_labels", { ...i, labels: labels.map((l) => ({ ...l, label: "Otro nombre" })) })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    const before = await counts(), same = await call("save_pack_labels", await input()); expect(same).toMatchObject({ data: { applied: false } });
    const after = await counts(); expect(after.slice(0, 3)).toEqual(before.slice(0, 3)); expect(after[3]).toBe(before[3]! + 1);
  });
  it("CAS concurrente: una escritura con claves distintas; misma clave un resultado", async () => {
    await price(); const a = await input(), b = { ...a, idempotency_key: randomUUID(), labels: labels.map((l) => ({ ...l, label: "Para regalar" })) };
    const results = await Promise.allSettled([call("save_pack_labels", a), call("save_pack_labels", b)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1); expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code).toBe("REVISION_CONFLICT");
    const i = await input(), same = await Promise.all([call("save_pack_labels", i), call("save_pack_labels", i)]); expect(same[0]).toEqual(same[1]);
  });
  it("aislamiento, scopes y ACL también en replay; delegado no puede aprobar", async () => {
    await price(); const i = await input(); await call("save_pack_labels", i);
    await expect(call("get_pack_labels", { product_id: product }, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("save_pack_labels", i, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("save_pack_labels", i, { ...owner, scopes: ["product_intelligence:read"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    expect((await anon.rpc("pi_load_pack_labels", { p_access: contextAccess(owner), p_product_id: product })).error?.code).toBe("42501");
    const denied = await db.rpc("pi_commit_pack_labels", { p_access: { ...contextAccess(owner), actor_kind: "delegated" }, p_product_id: product,
      p_expected_revision: 1, p_etag: "a".repeat(64), p_stamp: "b".repeat(64), p_key: randomUUID(), p_hash: "c".repeat(64), p_action: "approve", p_labels: labels });
    expect(denied.error?.message).toBe("PI_FORBIDDEN");
  });
  it("UI aprueba/reabre sin IA; contexto solo consume etiquetas aprobadas", async () => {
    await price(); await call("save_pack_labels", await input());
    const before = await call("get_product_context", { product_id: product }); expect(JSON.stringify(before)).not.toContain("Uno para ti");
    await approve(); expect(await current()).toMatchObject({ status: "approved" });
    const after = await call("get_product_context", { product_id: product }); expect(JSON.stringify(after)).toContain("Uno para ti");
    await approve("reopen"); expect(await current()).toMatchObject({ status: "in_review" }); expect(await count("ai_generations")).toBe(0);
  });
  it("una pantalla vieja no aprueba nueva propuesta ni precio cambiado", async () => {
    await price(); await call("save_pack_labels", await input()); const old = (await read()).data.pack_labels_etag, id = (await current()).id;
    await call("save_pack_labels", { ...await input(), labels: labels.map((l) => ({ ...l, label: "Para regalar" })) });
    await expect(approve("approve", old)).rejects.toMatchObject({ code: "ARTIFACT_CONFLICT" });
    expect(await current()).toMatchObject({ status: "generated" });
    const historical = (await checked(db.from("pack_labels").select("superseded_at").eq("id", id).single())).data!; expect(historical.superseded_at).toBeTruthy();
    const etag = (await read()).data.pack_labels_etag; await price(5000);
    await expect(approve("approve", etag)).rejects.toMatchObject({ code: "ARTIFACT_CONFLICT" });
    expect((await read()).data.pricing_stale).toBe(true);
  });
  it("cambiar la moneda del catálogo exige recalcular antes de proponer o aprobar", async () => {
    await price(); await call("save_pack_labels", await input());
    await checked(db.from("products").update({ currency: "USD" }).eq("id", product));
    expect((await read()).data.pricing_stale).toBe(true);
    await expect(call("save_pack_labels", await input())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(approve()).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("edición exacta se confirma junto con aprobación e invalida un chat viejo", async () => {
    await price(); await call("save_pack_labels", await input()); const stale = await input(), etag = (await read()).data.pack_labels_etag;
    await decidePackLabels(createContextRepository(db), owner, product, { action: "edit", expected_etag: etag, approve: true, labels: labels.map((l) => ({ ...l, label: "Un regalo útil" })) }, signal());
    expect(await current()).toMatchObject({ status: "approved", payload: [{ label: "Un regalo útil" }, { label: "Un regalo útil" }, { label: "Un regalo útil" }] });
    await expect(call("save_pack_labels", stale)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
  it("evidencia revisada/revocada exige otra revisión y no se consume como aprobada", async () => {
    await price(); let r = await read();
    const research = await call("save_research", { product_id: product, schema_version: "1.0", expected_revision: r.revision, idempotency_key: randomUUID(),
      sources: [{ client_ref: "supplier", title: "Ficha ficticia del proveedor", source_type: "supplier", retrieved_at: new Date().toISOString(), excerpt: "Cada envase dura 1 mes de uso.", author: null, editor: null, url: "https://example.test/facts", internal_ref: null }],
      evidence_links: [{ client_ref: "support", fact_ref: { client_ref: "duration" }, source_ref: { client_ref: "supplier" }, relation: "supports", fragment: "Cada envase dura 1 mes de uso." }],
      facts: [{ client_ref: "duration", key: "duration", statement: "Duración por envase", value: "1 mes de uso", unit: "month", verification_status: "verified", usage_status: "approved", reason: "Dato real revisado por el comerciante." }] });
    if (!research.ok) throw new Error("research"); const factId = research.data.id_map.duration;
    await call("save_pack_labels", { ...await input(), duration_fact_ids: [factId], labels: labels.map((l) => ({ ...l, basis: "duration", label: `${l.units} ${l.units === 1 ? "mes" : "meses"} de uso` })) });
    await approve(); expect((await current()).evidence_stale).toBe(false);
    r = await read(); await call("save_research", { product_id: product, schema_version: "1.0", expected_revision: r.revision, idempotency_key: randomUUID(), facts: [{ id: factId, reason: "Revisé otra vez la ficha del proveedor." }] });
    expect((await current()).evidence_stale).toBe(true);
    await approve(); expect((await current()).evidence_stale).toBe(false);
    r = await read(); await call("save_research", { product_id: product, schema_version: "1.0", expected_revision: r.revision, idempotency_key: randomUUID(), facts: [{ id: factId, usage_status: "prohibited", reason: "El dato no puede usarse." }] });
    expect((await current()).evidence_stale).toBe(true);
    await expect(approve()).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await approve("reopen"); expect(await current()).toMatchObject({ status: "in_review" });
    const context = await call("get_product_context", { product_id: product }); if (!context.ok) throw new Error("context"); expect(JSON.stringify(context.data.product.pricing)).not.toContain("mes de uso");
  });
  it("RPC inválida revierte todo y writers legacy en vuelo no reemplazan MCP", async () => {
    await price(); const before = await counts(), read = (await checked(db.rpc("pi_load_pack_labels", { p_access: contextAccess(owner), p_product_id: product }))).data;
    const bad = await db.rpc("pi_commit_pack_labels", { p_access: contextAccess(owner), p_product_id: product, p_expected_revision: read.revision,
      p_etag: read.pack_labels_etag, p_stamp: read.stamp, p_key: randomUUID(), p_hash: "a".repeat(64), p_action: "propose", p_labels: [...labels, labels[0]] });
    expect(bad.error?.message).toBe("PI_VALIDATION_ERROR"); expect(await counts()).toEqual(before);
    await call("save_pack_labels", await input()); const currentId = (await current()).id;
    const legacy = await db.from("pack_labels").insert({ product_id: product, user_id: owner.userId, payload: labels, prices: [], prompt_version: 2, model: "legacy" });
    expect(legacy.error?.message).toBe("PI_ARTIFACT_CONFLICT");
    expect((await db.from("pack_labels").update({ status: "approved" }).eq("id", currentId)).error?.message).toBe("PI_ARTIFACT_CONFLICT");
    expect(await count("pack_labels")).toBe(1);
  });
  it("SDK descubre dieciséis tools y lee/guarda/reproduce etiquetas", async () => {
    await price(); const server = createProductIntelligenceServer(owner, execute, { availableTools: PERSISTED_INTELLIGENCE_TOOLS }), client = new Client({ name: "packs", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
    try {
      const names: string[] = []; let cursor: string | undefined;
      do { const p = await client.listTools(cursor ? { cursor } : {}); names.push(...p.tools.map((t) => t.name)); cursor = p.nextCursor; } while (cursor);
      expect(names).toHaveLength(PERSISTED_INTELLIGENCE_TOOLS.length); expect(names).toContain("save_pack_labels");
      const i = await input(), r = await client.callTool({ name: "save_pack_labels", arguments: i }); expect(r.isError).toBe(false);
      expect(await client.callTool({ name: "save_pack_labels", arguments: i })).toEqual(r);
      expect((await client.callTool({ name: "get_pack_labels", arguments: { product_id: product } })).isError).toBe(false);
    } finally { await client.close(); await server.close(); }
  });
  it("borrado rechaza replay y conserva la cascada de propuestas/historia/receipts", async () => {
    await price(); const i = await input(); await call("save_pack_labels", i);
    await checked(db.from("products").update({ pi_deleting_at: new Date().toISOString() }).eq("id", product));
    await expect(call("save_pack_labels", i)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // La cascada de usuario simula la eliminación completa sin Storage ni productos reales.
    await checked(db.auth.admin.deleteUser(owner.userId)); users.splice(users.indexOf(owner.userId), 1);
    expect(await counts()).toEqual([0, 0, 0, 0]);
  });
});
