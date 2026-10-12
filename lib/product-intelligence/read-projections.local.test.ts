import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { CATALOG } from "@/lib/shopify/components/catalog";
import { createContextRepository, contextAccess } from "./repository";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { createVisualExecutor } from "./visual-service";
import { createLandingExecutor } from "./landing-service";
import { hydrateVisualState } from "./visual-state";
import { createVisualUrlSigner } from "./visual-url-signer";
import { recordServerVisualEvent } from "./visual-transfer";
import { parseToolInput } from "./validation";
import { PI_SCOPES, type Principal } from "./policy";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("Proyecciones MCP · Supabase local", () => {
  let db: SupabaseClient, owner: Principal, other: Principal, repo: ReturnType<typeof createContextRepository>, path: string;
  const product = randomUUID(), file = randomUUID(), operation = randomUUID(), iteration = randomUUID(), identity = randomUUID();
  const users: string[] = [];
  const args = () => ({ p_access: contextAccess(owner), p_product_id: product });
  const signal = () => AbortSignal.timeout(10000);
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>) { const r = await op; if (r.error) throw new Error(JSON.stringify(r.error)); return r; }
  async function rpc(name: string, extra: Record<string, unknown> = {}) { return (await checked(db.rpc(name, { ...args(), ...extra }))).data; }
  async function snapshots() { return (await checked(db.from("pi_visual_read_snapshots").select("id", { count: "exact" }).eq("product_id", product))).count!; }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    for (let i = 0; i < 2; i++) {
      const u = (await checked(db.auth.admin.createUser({ email: `projection-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true }))).data.user!;
      users.push(u.id);
    }
    owner = { userId: users[0], actorId: users[0], actorKind: "merchant", scopes: PI_SCOPES };
    other = { ...owner, userId: users[1], actorId: users[1] }; repo = createContextRepository(db);
    await checked(db.from("products").insert({ id: product, user_id: owner.userId, title: "Proyección local", currency: "CLP", shopify_product_id: product }));
    await checked(db.from("merchant_settings").insert({ user_id: owner.userId, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago" }));
    await createProductIntelligenceExecutor(repo)(owner, { tool: "save_product_context", input: parseToolInput("save_product_context", {
      product_id: product, schema_version: "1.0", pricing: { mode: "recommended", unit_cost_minor: 4000 }, context: { display_name: "Fixture", description: "Fixture local" },
    }) }, signal());
    const run = randomUUID();
    await checked(db.from("copy_runs").insert({ id: run, product_id: product, user_id: owner.userId, status: "succeeded" }));
    await checked(db.from("page_components").insert(CATALOG.map((c, i) => ({ product_id: product, user_id: owner.userId, run_id: run, component: c.id, position: i,
      proposal: c.examples[0] ?? { state: "empty" }, content: null, images: [], enabled: true, status: "approved" }))));
    path = `${owner.userId}/${product}/visual-local.webp`;
    const bytes = await sharp({ create: { width: 600, height: 600, channels: 3, background: "white" } }).webp().toBuffer();
    await checked(db.storage.from("page-media").upload(path, bytes, { contentType: "image/webp" }));
    await checked(db.from("pi_visual_files").insert({ id: file, product_id: product, user_id: owner.userId, bucket: "page-media", storage_path: path, mime_type: "image/webp", width: 600, height: 600, size_bytes: bytes.length, sha256: "a".repeat(64), original_sha256: "a".repeat(64) }));
    const now = new Date().toISOString(), fields = { product_id: product, user_id: owner.userId, version: 1, etag: "a".repeat(64), created_at: now, updated_at: now };
    await checked(db.from("pi_visual_records").insert([
      ...Array.from({ length: 30 }, (_, i) => ({ ...fields, id: randomUUID(), kind: "asset", status: "approved", payload: { plan_ref: { id: randomUUID() }, file_id: file, name: `Asset ${i}`, shot_family: "product_clarity" } })),
      { ...fields, id: identity, kind: "identity", status: "approved", payload: { identity_description: "Identidad actual" } },
      { ...fields, id: iteration, kind: "iteration", status: "prepared", payload: { result_asset_ids: [] } },
    ]));
    await checked(db.from("pi_visual_versions").insert([{ record_id: identity, product_id: product, user_id: owner.userId, version: 1, actor_id: owner.userId,
      record: { id: identity, version: 1, kind: "identity", etag: "a".repeat(64), status: "approved", payload: { identity_description: "Identidad histórica" }, created_at: now, updated_at: now } }]));
    await checked(db.from("pi_visual_operations").insert({ id: operation, product_id: product, user_id: owner.userId, iteration_id: iteration, access: contextAccess(owner), source: {}, kind: "ingest", status: "pending" }));
  }, 20000);
  afterAll(async () => {
    if (db && path) await checked(db.storage.from("page-media").remove([path]));
    for (const id of users) await checked(db.auth.admin.deleteUser(id));
  });
  it("la consulta pequeña conserva los tokens exactos y no transfiere ni persiste estado amplio", async () => {
    const full = await rpc("pi_load_visual"), before = await snapshots();
    const projected = await rpc("pi_read_visual_operation", { p_operation_id: operation });
    expect(projected).toMatchObject({ revision: full.revision, etag: full.etag, dependency_stamp: full.dependency_stamp, operation: { id: operation, status: "pending" } });
    expect(Object.keys(projected).sort()).toEqual(["dependency_stamp", "etag", "operation", "revision"]);
    expect(Object.keys(projected.operation).sort()).toEqual(["error_message", "expires_at", "id", "iteration_id", "kind", "result", "status"]);
    expect(await snapshots()).toBe(before);
    const read = vi.spyOn(repo, "readVisualOperation");
    await createVisualExecutor(repo)(owner, { tool: "get_visual_ingestion_status", input: parseToolInput("get_visual_ingestion_status", { product_id: product, operation_id: operation }) }, signal());
    expect(read).toHaveBeenCalledTimes(1); expect(await snapshots()).toBe(before);
  });
  it("el contexto añade medios específicos y conserva la representación anterior y los tokens exactos", async () => {
    const oldSource = readFileSync("supabase/migrations/20261202000000_visual_removed_targets.sql", "utf8").split("as $$\n", 2)[1].split("\n$$;", 1)[0];
    const oldPdp = readFileSync("supabase/migrations/20261211000000_current_product_content.sql", "utf8").split("-- pi_pdp_state\n", 2)[1].split("AS $function$\n", 2)[1].split("\n$function$;", 1)[0];
    const sql = (value: string) => value.replaceAll("p_product_id", `'${product}'::uuid`).replaceAll("p_owner_id", `'${owner.userId}'::uuid`);
    const comparison = JSON.parse(execFileSync("docker", ["exec", "-i", "supabase_db_dropflex-v2", "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
      encoding: "utf8", input: `with legacy_source as (${sql(oldSource)}), legacy_pdp as (${sql(oldPdp)}) select jsonb_build_object(
        'source_equal',(select * from legacy_source)=(public.pi_visual_source_state('${product}','${owner.userId}')-'page_images'),
        'pdp_equal',(select * from legacy_pdp)=public.pi_pdp_state('${product}','${owner.userId}'),
        'gifs',public.pi_visual_source_state('${product}','${owner.userId}')->'page_images',
        'stamp',public.pi_snapshot_hash((select * from legacy_source)||jsonb_build_object('page_images','[]'::jsonb)));`,
    }));
    expect(comparison).toMatchObject({ source_equal: true, pdp_equal: true, gifs: [] });
    expect((await rpc("pi_read_visual_operation", { p_operation_id: operation })).dependency_stamp).toBe(comparison.stamp);
  });
  it("lectura sin cursor omite historia y replica la hidratación vigente; la historia explícita permanece", async () => {
    const full = await rpc("pi_load_visual"), before = await snapshots(), projected = await rpc("pi_read_visual");
    expect(projected.history).toEqual([]); expect(projected).not.toHaveProperty("snapshot_id"); expect(projected).not.toHaveProperty("knowledge");
    const old = await hydrateVisualState(full, owner, product), fresh = await hydrateVisualState(projected, owner, product);
    expect(fresh).toEqual({ ...old, history: [], snapshot_id: undefined });
    const historical = await createVisualExecutor(repo)(owner, { tool: "get_visual_identity", input: parseToolInput("get_visual_identity", { product_id: product, identity_id: identity, version: 1 }) }, signal());
    expect(historical).toMatchObject({ ok: true, data: { current: { payload: { identity_description: "Identidad histórica" } } } });
    expect(await snapshots()).toBe(before);
  });
  it("ambos lectores pueden continuar snapshots anteriores y nuevos, con la misma expiración", async () => {
    const previous = await rpc("pi_load_visual"), before = await snapshots();
    expect(await rpc("pi_read_visual", { p_snapshot_id: previous.snapshot_id })).toEqual(previous);
    const fresh = await rpc("pi_read_visual", { p_paginate: true, p_history: true });
    expect(await snapshots()).toBe(before + 1);
    expect(await rpc("pi_load_visual", { p_snapshot_id: fresh.snapshot_id })).toEqual(fresh);
    expect(fresh.history).toEqual(previous.history);
    await checked(db.from("pi_visual_read_snapshots").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", fresh.snapshot_id));
    for (const name of ["pi_load_visual", "pi_read_visual"]) expect((await db.rpc(name, { ...args(), p_snapshot_id: fresh.snapshot_id })).error?.message).toContain("PI_NOT_FOUND");
  });
  it("persistir una página hace un solo INSERT y ninguna reescritura del snapshot", () => {
    const writes = (name: string) => JSON.parse(execFileSync("docker", ["exec", "-i", "supabase_db_dropflex-v2", "psql", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      encoding: "utf8", input: `begin; do $$ begin perform public.${name}('${JSON.stringify(contextAccess(owner))}'::jsonb,'${product}'::uuid${name === "pi_read_visual" ? ",p_paginate=>true" : ""}); end $$;
        select jsonb_build_object('inserts',n_tup_ins,'updates',n_tup_upd) from pg_stat_xact_user_tables where relname='pi_visual_read_snapshots'; rollback;`,
    }));
    expect(writes("pi_load_visual")).toEqual({ inserts: 1, updates: 1 });
    expect(writes("pi_read_visual")).toEqual({ inserts: 1, updates: 0 });
  });
  it("la paginación pública mantiene orden, total y valores ante una edición concurrente", async () => {
    const execute = createVisualExecutor(repo);
    const command = (cursor?: string) => ({ tool: "list_visual_assets" as const, input: parseToolInput("list_visual_assets", { product_id: product, ...(cursor ? { cursor } : {}) }) });
    const first = await execute(owner, command(), signal()) as { data: { next_cursor: string; items: { id: string; payload: Record<string, unknown> }[]; total: number; etag: string } };
    expect(first.data.next_cursor).toBeTruthy(); expect(first.data.total).toBe(30);
    const full = await rpc("pi_load_visual"), firstId = first.data.items[0].id;
    await checked(db.from("pi_visual_records").update({ payload: { ...first.data.items[0].payload, name: "Edición concurrente" } }).eq("id", firstId));
    const items = [...first.data.items]; let cursor = first.data.next_cursor;
    while (cursor) {
      const page = await execute(owner, command(cursor), signal()) as typeof first;
      expect(page.data.etag).toBe(first.data.etag); expect(page.data.total).toBe(30);
      items.push(...page.data.items); cursor = page.data.next_cursor;
    }
    expect(new Set(items.map(r => r.id)).size).toBe(30);
    expect(items.map(r => ({ id: r.id, payload: r.payload }))).toEqual(full.records.filter((r: { kind: string }) => r.kind === "asset").reverse().map((r: { id: string; payload: unknown }) => ({ id: r.id, payload: r.payload })));
    expect(await execute(owner, command(), signal())).toMatchObject({ data: { items: expect.arrayContaining([expect.objectContaining({ id: firstId, payload: expect.objectContaining({ name: "Edición concurrente" }) })]) } });
  });
  it.each(["listing", "pain-block", "image-with-benefits"])("landing %s mantiene toda la respuesta pública con una sola lectura", async component => {
    const full = await rpc("pi_load_landing"), projected = await rpc("pi_read_landing_component", { p_component: component });
    expect(projected.landing_etag).toBe(full.landing_etag);
    expect(projected.image_catalog).toEqual(full.image_catalog); expect(projected.reviews).toEqual(full.reviews);
    expect(projected.rows).toEqual(full.rows.filter((r: { component: string }) => r.component === component));
    expect(projected.snapshot).toEqual({ pricing: full.snapshot.pricing, settings: full.snapshot.settings });
    const command = { tool: "get_landing_content" as const, input: parseToolInput("get_landing_content", { product_id: product, component }) };
    const legacy = { ...repo, readLandingComponent: undefined };
    const old = await createLandingExecutor(legacy)(owner, command, signal());
    const read = vi.spyOn(repo, "readLandingComponent"), accent = vi.spyOn(repo, "loadPageAccent"), wide = vi.spyOn(repo, "loadLanding");
    try {
      const fresh = await createLandingExecutor(repo)(owner, command, signal());
      expect({ ...fresh as object, request_id: null }).toEqual({ ...old as object, request_id: null });
      expect(read).toHaveBeenCalledTimes(1); expect(accent).not.toHaveBeenCalled(); expect(wide).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });
  it("el callback diferido persiste en auditoría, es idempotente y no altera los tokens del producto", async () => {
    const callbacks: (() => Promise<void>)[] = [], attempt = randomUUID();
    const before = await rpc("pi_read_visual_operation", { p_operation_id: operation });
    const deferred = { ...repo, deferVisualTelemetry: (task: () => Promise<void>) => { callbacks.push(task); } };
    const rows = async () => (await checked(db.from("pi_audit_events").select("diff").eq("product_id", product).eq("diff->>attempt_id", attempt))).data!;
    await recordServerVisualEvent(deferred, contextAccess(owner), product, { attempt_id: attempt, stage: "tool_execution", state: "succeeded", duration_ms: 4, tool: "get_visual_ingestion_status" });
    expect(await rows()).toEqual([]); expect(callbacks).toHaveLength(1);
    await callbacks[0](); await callbacks[0]();
    expect(await rows()).toEqual([{ diff: expect.objectContaining({ attempt_id: attempt, reported_by: "server", state: "succeeded", duration_ms: 4 }) }]);
    expect(await rpc("pi_read_visual_operation", { p_operation_id: operation })).toEqual(before);
  });
  it("otro comerciante, scopes insuficientes, archivos ausentes y ACL siguen fallando", async () => {
    for (const [name, extra] of [["pi_read_visual", {}], ["pi_read_visual_operation", { p_operation_id: operation }], ["pi_read_landing_component", { p_component: "listing" }]] as const) {
      expect((await db.rpc(name, { ...args(), ...extra, p_access: contextAccess(other) })).error?.message).toContain("PI_NOT_FOUND");
      expect((await db.rpc(name, { ...args(), ...extra, p_access: contextAccess({ ...owner, scopes: [] }) })).error?.message).toContain("PI_FORBIDDEN");
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      expect((await anon.rpc(name, { ...args(), ...extra })).error?.code).toBe("42501");
    }
    const sign = createVisualUrlSigner(db);
    const signed = await Promise.allSettled([sign("page-media", path), sign("page-media", `${owner.userId}/${product}/missing.webp`)]);
    expect(signed[0].status).toBe("fulfilled"); expect(signed[1]).toMatchObject({ status: "rejected", reason: new Error("No pudimos abrir la imagen. Intenta de nuevo.") });
    const execute = createVisualExecutor(repo), input = parseToolInput("list_visual_assets", { product_id: product });
    const first = await execute(owner, { tool: "list_visual_assets", input }, signal()) as { data: { next_cursor: string } };
    await checked(db.storage.from("page-media").remove([path]));
    await expect(execute(owner, { tool: "list_visual_assets", input: parseToolInput("list_visual_assets", { product_id: product, cursor: first.data.next_cursor }) }, signal())).rejects.toThrow("No pudimos abrir la imagen. Intenta de nuevo.");
    await checked(db.rpc("pi_begin_product_deletion", { p_user_id: owner.userId, p_product_id: product }));
    expect((await db.rpc("pi_read_visual", args())).error?.message).toContain("PI_NOT_FOUND");
  });
});
