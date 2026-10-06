// Opt-in, fixtures propios, sin proveedores ni acceso a producción.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { productMetafields } from "@/lib/shopify/publish/mapping";
import { createProductIntelligenceExecutor, PERSISTED_INTELLIGENCE_TOOLS } from "./knowledge-service";
import { createProductIntelligenceServer } from "./mcp";
import { contextAccess, createContextRepository } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import type { ToolName } from "./schemas";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("PI · landing persistente en Supabase local", () => {
  let db: SupabaseClient, execute: ReturnType<typeof createProductIntelligenceExecutor>, owner: Principal, other: Principal;
  const product = randomUUID(), users: string[] = [];
  const listing = { title: "Organizador para tu escritorio", short_name: "Organizador", short_description: "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.",
    offer_line: "Organiza tu escritorio · Paga al recibir", seo_title: "Organizador para escritorio", seo_description: "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa." };
  const benefit = CATALOG.find((c) => c.id === "pain-block")!;
  const entries = [{ component: "listing", content: listing }, { component: benefit.id, content: benefit.examples[0] }];
  const signal = () => AbortSignal.timeout(15000);
  async function checked<T extends { error: unknown }>(operation: PromiseLike<T>) { const result = await operation; if (result.error) throw new Error(JSON.stringify(result.error)); return result; }
  async function call<K extends ToolName>(tool: K, input: unknown, principal = owner) { return parseToolOutput(tool, await execute(principal, { tool, input: parseToolInput(tool, input) } as Parameters<typeof execute>[1], signal())); }
  async function read() { const r = await call("get_landing_content", { product_id: product }); if (!r.ok) throw new Error("read"); return r; }
  async function input() { const r = await read(); return { product_id: product, schema_version: "1.0", expected_revision: r.revision, expected_landing_etag: r.data.landing_etag, idempotency_key: randomUUID(), entries }; }
  async function count(table: string) { return (await checked(db.from(table).select("*", { head: true, count: "exact" }).eq("product_id", product))).count; }
  async function merchant() {
    const created = await checked(db.auth.admin.createUser({ email: `pi-landing-${randomBytes(8).toString("hex")}@example.test`, password: randomBytes(32).toString("base64url"), email_confirm: true }));
    const id = created.data.user!.id; users.push(id);
    await checked(db.from("merchant_settings").insert({ user_id: id, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: new Date().toISOString() }));
    return { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES } as Principal;
  }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    execute = createProductIntelligenceExecutor(createContextRepository(db)); owner = await merchant(); other = await merchant();
    await checked(db.from("products").insert({ id: product, user_id: owner.userId, title: "Organizador", shopify_product_id: "pi-landing", currency: "CLP" }));
  }, 20000);
  afterAll(async () => { for (const id of users) await checked(db.auth.admin.deleteUser(id)); }, 20000);
  it("lectura vacía no crea filas, descubre 17 contratos y exige pricing", async () => {
    const r = await read(); expect(r.data.catalog).toHaveLength(17); expect(r.data.current).toBeNull(); expect(await count("copy_runs")).toBe(0);
    await expect(call("save_landing_content", await input())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await call("save_product_context", { product_id: product, schema_version: "1.0", expected_revision: 0, idempotency_key: randomUUID(),
      context: { display_name: "Organizador", description: "Producto para organizar útiles." }, pricing: { mode: "recommended", unit_cost_minor: 4000 } });
  });
  it("dry_run no crea run, componentes, audit ni receipt", async () => {
    const before = await Promise.all(["copy_runs", "page_components", "pi_audit_events", "pi_idempotency_records"].map(count));
    expect(await call("save_landing_content", { ...await input(), dry_run: true })).toMatchObject({ ok: true, data: { applied: false, run_id: null, dry_run: true } });
    expect(await Promise.all(["copy_runs", "page_components", "pi_audit_events", "pi_idempotency_records"].map(count))).toEqual(before);
  });
  let initial: Awaited<ReturnType<typeof input>>, result: unknown;
  it("guarda propuesta, frozen contexto, audit y receipt sin AI ni publicaciones", async () => {
    initial = await input(); result = await call("save_landing_content", initial);
    expect(result).toMatchObject({ revision: initial.expected_revision, data: { applied: true, components: [{ status: "generated" }, { status: "generated" }] } });
    const rows = (await checked(db.from("page_components").select("*").eq("product_id", product))).data!;
    expect(rows).toHaveLength(2); expect(rows.find((r) => r.component === "listing").enabled).toBe(true); expect(rows.find((r) => r.component === benefit.id).enabled).toBe(false);
    const run = (await checked(db.from("copy_runs").select("input,status").eq("product_id", product).single())).data!;
    expect(run).toMatchObject({ status: "succeeded", input: { source: "mcp_chat", analysis_revision: initial.expected_revision } });
    expect(run.input.snapshot.knowledge.graph.persona).toEqual([]);
    expect(await count("ai_generations")).toBe(0); expect(await count("product_publications")).toBe(0);
    const legacy = await db.from("copy_runs").insert({ product_id: product, user_id: owner.userId, status: "queued", input: {} });
    expect(legacy.error?.message).toBe("PI_VALIDATION_ERROR"); expect(await count("copy_runs")).toBe(1);
  });
  it("replay antes de etag/revision, distinta carga con misma clave rechaza", async () => {
    expect(await call("save_landing_content", initial)).toEqual(result);
    await expect(call("save_landing_content", { ...initial, entries: [{ component: "listing", content: { ...listing, title: "Otro organizador para escritorio" } }] })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await count("copy_runs")).toBe(1);
  });
  it("aislamiento, permisos y ACL de RPC también para replay", async () => {
    await expect(call("get_landing_content", { product_id: product }, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("save_landing_content", initial, other)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("save_landing_content", initial, { ...owner, scopes: ["product_intelligence:read"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const delegated = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    expect((await delegated.rpc("pi_load_landing", { p_access: contextAccess(owner), p_product_id: product })).error?.code).toBe("42501");
  });
  it("UI cambia etag y nunca pierde contenido editado; merge conserva no enviados", async () => {
    const stale = await input(), current = (await read()).data.current!;
    await checked(db.from("page_components").update({ content: { ...listing, title: "Título editado desde la UI" }, status: "approved", updated_at: new Date().toISOString() }).eq("id", current.id));
    await expect(call("save_landing_content", stale)).rejects.toMatchObject({ code: "ARTIFACT_CONFLICT" });
    const request = { ...await input(), entries: [entries[1]] };
    await call("save_landing_content", request);
    expect((await read()).data.current).toMatchObject({ id: current.id, status: "approved", content: { title: "Título editado desde la UI" } });
    const r = await call("get_landing_content", { product_id: product, component: benefit.id });
    if (!r.ok) throw new Error("read");
    const mapped = productMetafields({ listing, components: [{ id: benefit.id, content: r.data.current!.content, images: {} }], reviews: [], packs: [], accent: null, gallery: [] }, new Map());
    expect(JSON.parse(mapped.set.find((m) => m.key === benefit.metafield!.key)!.value)).toEqual(benefit.examples[0]);
  });
  it("CAS concurrente confirma un único batch y conserva historial", async () => {
    const a = await input(), b = { ...a, idempotency_key: randomUUID() };
    const outcomes = await Promise.allSettled([call("save_landing_content", a), call("save_landing_content", b)]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((outcomes.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.code).toBe("ARTIFACT_CONFLICT");
    const same = await input(), results = await Promise.all([call("save_landing_content", same), call("save_landing_content", same)]);
    expect(results[0]).toEqual(results[1]);
    expect((await checked(db.from("page_components").select("id").eq("product_id", product).is("superseded_at", null))).data).toHaveLength(2);
  });
  it("rollback integral con componente inválido en RPC; SDK descubre once tools", async () => {
    const loaded = (await checked(db.rpc("pi_load_landing", { p_access: contextAccess(owner), p_product_id: product }))).data;
    const before = await Promise.all(["copy_runs", "page_components", "pi_audit_events", "pi_idempotency_records"].map(count));
    const fail = await db.rpc("pi_commit_landing", { p_access: contextAccess(owner), p_product_id: product, p_expected_revision: loaded.revision,
      p_etag: loaded.landing_etag, p_stamp: loaded.stamp, p_key: randomUUID(), p_hash: "a".repeat(64), p_entries: [entries[0], { component: "review-wall", content: {} }] });
    expect(fail.error?.message).toBe("PI_INVALID_REFERENCE");
    expect(await Promise.all(["copy_runs", "page_components", "pi_audit_events", "pi_idempotency_records"].map(count))).toEqual(before);
    const server = createProductIntelligenceServer(owner, execute, { availableTools: PERSISTED_INTELLIGENCE_TOOLS }), client = new Client({ name: "local-landing", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
    try {
      const tools: string[] = []; let cursor: string | undefined;
      do { const page = await client.listTools(cursor ? { cursor } : {}); tools.push(...page.tools.map((t) => t.name)); cursor = page.nextCursor; } while (cursor);
      expect(tools).toHaveLength(11);
      const r = await client.callTool({ name: "get_landing_content", arguments: { product_id: product, component: "pain-block" } }); expect(r.isError).toBe(false);
    } finally { await client.close(); await server.close(); }
  });
  it("persiste arrays completos, replay y validación de selectores en RPC", async () => {
    const array = [
      { key: "default", angle_id: null, hook_id: null, content: listing },
      { key: "comfort", angle_id: "angle_1", hook_id: null, content: { ...listing, title: "Organiza tus útiles con comodidad" } },
      { key: "opening", angle_id: "angle_1", hook_id: "hook_2", content: { ...listing, title: "Encuentra tus útiles en el escritorio" } },
    ];
    const request = { ...await input(), schema_version: "1.1", entries: [{ component: "listing", content: array }] };
    const saved = await call("save_landing_content", request);
    expect(await call("save_landing_content", request)).toEqual(saved);
    expect((await read()).data.current!.content).toEqual(array);
    const loaded = (await checked(db.rpc("pi_load_landing", { p_access: contextAccess(owner), p_product_id: product }))).data;
    const fail = await db.rpc("pi_commit_landing", { p_access: contextAccess(owner), p_product_id: product, p_expected_revision: loaded.revision,
      p_etag: loaded.landing_etag, p_stamp: loaded.stamp, p_key: randomUUID(), p_hash: "b".repeat(64),
      p_entries: [{ component: "listing", content: array.slice(1) }] });
    expect(fail.error?.message).toBe("PI_VALIDATION_ERROR");
    expect((await read()).data.current!.content).toEqual(array);
  });
  it("revisión UI serializada: aprueba arrays, rechaza edición vieja y grant delegado", async () => {
    const loaded = (await checked(db.rpc("pi_load_landing", { p_access: contextAccess(owner), p_product_id: product }))).data;
    const row = loaded.rows.find((r: { component: string }) => r.component === "listing");
    const args = { p_access: contextAccess(owner), p_product_id: product, p_component: "listing", p_id: row.id,
      p_updated_at: row.updated_at, p_stamp: loaded.stamp, p_patch: { approve: true } };
    await checked(db.rpc("pi_review_landing", args));
    expect((await read()).data.current!.status).toBe("approved");
    expect((await db.rpc("pi_review_landing", { ...args, p_patch: { content: listing } })).error?.message).toBe("PI_ARTIFACT_CONFLICT");
    expect((await db.rpc("pi_review_landing", { ...args, p_access: { ...args.p_access, actor_kind: "delegated" } })).error).toBeTruthy();
    const noOwner = { ...args, p_access: contextAccess(other) };
    expect((await db.rpc("pi_review_landing", noOwner)).error?.message).toBe("PI_NOT_FOUND");
  });
  it("revisión UI detecta cambio de contexto entre validación y commit", async () => {
    const loaded = (await checked(db.rpc("pi_load_landing", { p_access: contextAccess(owner), p_product_id: product }))).data;
    const row = loaded.rows.find((r: { component: string }) => r.component === "listing");
    await checked(db.from("product_pricing").update({ sale_price: 20990 }).eq("product_id", product));
    expect((await db.rpc("pi_review_landing", { p_access: contextAccess(owner), p_product_id: product, p_component: "listing", p_id: row.id,
      p_updated_at: row.updated_at, p_stamp: loaded.stamp, p_patch: { approve: true } })).error?.message).toBe("PI_REVISION_CONFLICT");
    await checked(db.from("product_pricing").update({ sale_price: loaded.snapshot.pricing.sale_price }).eq("product_id", product));
  });
  it("rechaza imágenes ajenas en variantes sin crear propuestas ni archivos", async () => {
    const request = { ...await input(), entries: [{ component: "image-with-benefits", content: [{ key: "default", angle_id: null, hook_id: null,
      content: CATALOG.find((c) => c.id === "image-with-benefits")!.examples[0], images: [{ slot: "main", source: "reference", id: randomUUID() }] }] }] };
    const before = await count("copy_runs");
    await expect(call("save_landing_content", request)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await count("copy_runs")).toBe(before);
    const loaded = (await checked(db.rpc("pi_load_landing", { p_access: contextAccess(owner), p_product_id: product }))).data;
    const result = await db.rpc("pi_commit_landing", { p_access: contextAccess(owner), p_product_id: product, p_expected_revision: loaded.revision,
      p_etag: loaded.landing_etag, p_stamp: loaded.stamp, p_key: randomUUID(), p_hash: "c".repeat(64), p_entries: request.entries });
    expect(result.error?.message).toBe("PI_INVALID_REFERENCE");
    expect(await count("copy_runs")).toBe(before);
  });
  it("producto en borrado impide replay y cascada borra propuestas/receipts", async () => {
    expect((await read()).data.context_stale).toBe(false);
    const before = await input();
    await call("save_product_context", { product_id: product, schema_version: "1.0", expected_revision: before.expected_revision,
      idempotency_key: randomUUID(), context: { description: "Contexto cambiado desde el chat." } });
    expect((await read()).data.context_stale).toBe(true);
    await expect(call("save_landing_content", before)).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(await call("save_landing_content", initial)).toEqual(result);
    await checked(db.from("products").update({ pi_deleting_at: new Date().toISOString() }).eq("id", product));
    await expect(call("save_landing_content", initial)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await checked(db.auth.admin.deleteUser(owner.userId)); users.splice(users.indexOf(owner.userId), 1);
    expect(await count("copy_runs")).toBe(0); expect(await count("page_components")).toBe(0); expect(await count("pi_idempotency_records")).toBe(0);
  });
});
