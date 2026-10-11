import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("Migración de aprobación MCP · Supabase local", () => {
  let db: SupabaseClient, userId: string;
  const product = randomUUID(), file = randomUUID(), run = randomUUID();
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>) {
    const result = await op; if (result.error) throw new Error(JSON.stringify(result.error)); return result;
  }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const created = await checked(db.auth.admin.createUser({ email: `migration-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true }));
    userId = created.data.user!.id;
    await checked(db.from("products").insert({ id: product, user_id: userId, title: "Migration fixture", shopify_product_id: product, currency: "CLP" }));
  });
  afterAll(async () => { if (userId) await checked(db.auth.admin.deleteUser(userId)); });

  it("aprueba pendientes, conserva descartes y visibilidad, audita versiones y es idempotente", async () => {
    const common = { product_id: product, user_id: userId }, hash = createHash("sha256").update(file).digest("hex");
    await checked(db.from("product_intelligence").insert(common));
    await checked(db.from("copy_runs").insert({ ...common, id: run, status: "succeeded", input: { source: "mcp_chat" }, payload: {} }));
    await checked(db.from("page_components").insert({ ...common, run_id: run, component: "faq", position: 1, proposal: { state: "empty" }, status: "generated", enabled: false }));
    await checked(db.from("pi_visual_files").insert({ ...common, id: file, bucket: "page-media", storage_path: `${userId}/${product}/visual-fixture.webp`, sha256: hash, original_sha256: hash, mime_type: "image/webp", width: 600, height: 600, size_bytes: 100 }));
    const records = ["generated", "approved", "rejected"].map(status => ({ ...common, id: randomUUID(), kind: "asset", version: 1, etag: hash, status, payload: { file_id: file, dependencies: [] } }));
    await checked(db.from("pi_visual_records").insert(records));
    const binding = { ...common, id: randomUUID(), kind: "binding", version: 1, etag: hash, status: "selected", payload: { asset_id: records[1].id, target_key: "gallery:cover", target: { type: "gallery_shot", shot_key: "hero", slot: "cover", position: null }, dependencies: [] } };
    await checked(db.from("pi_visual_records").insert(binding));
    await checked(db.from("pi_visual_versions").insert([...records, binding].map(record => ({ ...common, record_id: record.id, version: 1, record, actor_id: userId }))));
    // Ejecuta solo el backfill sobre este producto: nunca altera otras fixtures o datos locales.
    const migration = readFileSync("supabase/migrations/20261208000000_mcp_content_approval.sql", "utf8");
    const backfill = migration.slice(migration.indexOf("-- Aprueba únicamente contenido MCP vigente"), migration.lastIndexOf("commit;"))
      .replace("where c.superseded_at", `where c.product_id='${product}' and c.superseded_at`)
      .replace("where status='generated'", `where product_id='${product}' and status='generated'`)
      .replace("where source='mcp_chat'", `where product_id='${product}' and source='mcp_chat'`)
      .replace("where usage_tip->>", `where id='${product}' and usage_tip->>`)
      .replace("where ((kind='asset'", `where product_id='${product}' and ((kind='asset'`);
    const apply = () => execFileSync("docker", ["exec", "-i", "supabase_db_dropflex-v2", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: `begin;\n${backfill}\ncommit;`, stdio: ["pipe", "pipe", "pipe"] });
    apply();
    const rows = (await checked(db.from("pi_visual_records").select("id,status,version,payload").eq("product_id", product))).data!;
    for (const original of records.slice(0, 2)) expect(rows.find(r => r.id === original.id)).toMatchObject({ status: "approved", version: 2, payload: { approval_source: "mcp" } });
    expect(rows.find(r => r.id === records[2].id)).toMatchObject({ status: "rejected", version: 1 });
    expect(rows.find(r => r.id === binding.id)).toMatchObject({ status: "selected", version: 2 });
    expect((await checked(db.from("page_components").select("status,enabled").eq("product_id", product).single())).data).toMatchObject({ status: "approved", enabled: false });
    const revision = (await checked(db.from("product_intelligence").select("revision").eq("product_id", product).single())).data!.revision;
    const audit = (await checked(db.from("pi_audit_events").select("base_revision,resulting_revision").eq("product_id", product).eq("actor_id", "migration:mcp_content_approval"))).data!;
    expect(audit).toHaveLength(3); expect(audit.every(r => r.base_revision === revision - 1 && r.resulting_revision === revision)).toBe(true);
    apply();
    expect((await checked(db.from("product_intelligence").select("revision").eq("product_id", product).single())).data!.revision).toBe(revision);
    expect((await checked(db.from("pi_visual_versions").select("version").eq("record_id", records[0].id))).data).toHaveLength(2);
  });
});
