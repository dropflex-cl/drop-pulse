import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { createContextRepository } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import { parseToolInput, parseToolOutput } from "./validation";
import type { ToolName, ToolOutputs } from "./schemas";
import { updateComponent } from "@/lib/pipeline/copy";
import { preparePublish } from "@/lib/pipeline/publish";
import { getEffectiveProductContent } from "@/lib/data/product-content";
import { requestFixture } from "./test-fixtures";
import { CATALOG } from "@/lib/shopify/components/catalog";

const listing = { title: "Organizador de escritorio", short_name: "Organizador", short_description: "Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.", offer_line: "Organiza tu escritorio · Paga al recibir", seo_title: "Organizador para escritorio", seo_description: "Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa." };
describe.runIf(process.env.PI_LOCAL_TEST === "1")("Contenido vigente · Supabase y Storage locales", () => {
  let db: SupabaseClient, owner: Principal, execute: ReturnType<typeof createProductIntelligenceExecutor>, path: string;
  const product = randomUUID(), asset = randomUUID(), file = randomUUID();
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>) { const result = await op; if (result.error) throw new Error(JSON.stringify(result.error)); return result; }
  async function call<K extends ToolName>(tool: K, input: Record<string, unknown>, principal = owner) {
    const result = parseToolOutput(tool, await execute(principal, { tool, input: parseToolInput(tool, { product_id: product, ...input }) } as Parameters<typeof execute>[1], AbortSignal.timeout(25000)));
    if (!result.ok) throw result.error; return result as ToolOutputs[K] & { ok: true };
  }
  async function row(component: string) { return (await checked(db.from("page_components").select("*").eq("product_id", product).eq("component", component).is("superseded_at", null).single())).data!; }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const user = await checked(db.auth.admin.createUser({ email: `current-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true }));
    owner = { userId: user.data.user!.id, actorId: user.data.user!.id, actorKind: "merchant", scopes: PI_SCOPES };
    execute = createProductIntelligenceExecutor(createContextRepository(db));
    await checked(db.from("merchant_settings").insert({ user_id: owner.userId, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: new Date().toISOString(), free_shipping: false, handling_days: 1, transit_days_min: 2, transit_days_max: 3, cutoff_hour: 13 }));
    await checked(db.from("products").insert({ id: product, user_id: owner.userId, title: "Fixture", shopify_product_id: product, currency: "CLP" }));
    await call("save_product_context", { schema_version: "1.0", context: { display_name: "Organizador", description: "Organizador para útiles." }, pricing: { mode: "recommended", unit_cost_minor: 4000 } });
    path = `${owner.userId}/${product}/visual-current.webp`;
    const bytes = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 25, g: 25, b: 25 } } }).webp().toBuffer(), hash = createHash("sha256").update(bytes).digest("hex");
    await checked(db.storage.from("page-media").upload(path, bytes, { contentType: "image/webp" }));
    await checked(db.from("pi_visual_files").insert({ id: file, product_id: product, user_id: owner.userId, bucket: "page-media", storage_path: path, sha256: hash, original_sha256: hash, mime_type: "image/webp", width: 600, height: 600, size_bytes: bytes.length }));
    // Simula una pieza ya guardada cuyo plan y estrategia de origen dejaron de estar vigentes.
    await checked(db.from("pi_visual_records").insert({ id: asset, product_id: product, user_id: owner.userId, kind: "asset", version: 1, etag: hash, status: "generated", payload: { file_id: file, representation: "product_depiction", shot_family: "product_clarity", dependencies: [{ kind: "strategy", key: randomUUID(), content_hash: hash, usage: "message" }] } }));
  }, 30000);
  afterAll(async () => { if (owner) { await db.storage.from("page-media").remove([path]); await checked(db.auth.admin.deleteUser(owner.userId)); } }, 20000);
  it("guardar MCP deja el texto disponible sin aprobaciones ni parámetros técnicos", async () => {
    await call("save_landing_content", { schema_version: "1.1", entries: [{ component: "listing", content: listing }, { component: "pain-block", content: CATALOG.find(c => c.id === "pain-block")!.examples[0] }] });
    expect((await preparePublish(owner.userId, product)).input.listing.title).toBe(listing.title);
    expect((await row("listing")).status).toBe("approved"); // Estado antiguo compatible, sin decisión adicional.
  });
  it("asignar una imagen existente la hace publicable sin identidad, plan ni revisión de binding", async () => {
    await call("bind_visual_asset", { schema_version: "1.0", asset_id: asset, bindings: [{ target: { type: "gallery_shot", shot_key: "hero", slot: "cover", position: null } }] });
    const prepared = await preparePublish(owner.userId, product);
    expect(prepared.missing).toEqual([]); expect(prepared.input.gallery[0].key).toBe(`page-media/${path}`);
  });
  it("editar hooks y estrategia mantiene el mismo ID y los usos existentes sin generar", async () => {
    const fixture = (name: string) => Object.fromEntries(Object.entries(requestFixture(name).payload as Record<string, unknown>).filter(([key]) => !["product_id", "expected_revision", "idempotency_key", "based_on_revision"].includes(key)));
    const research = await call("save_research", fixture("propose-research")), fact = research.data.id_map.compartments_fact;
    const analysis = JSON.parse(JSON.stringify(fixture("analysis-four-personas")).replaceAll("00000000-0000-0000-0000-00000000000b", fact));
    const saved = await call("save_product_analysis", analysis), map = saved.data.id_map;
    await call("save_research", { schema_version: "1.0", facts: [{ id: fact, verification_status: "verified", usage_status: "approved", reason: "Comprobación de fixture local" }] });
    const choice = { schema_version: "1.0", action: "select", primary_persona_id: map.persona_1, primary_jtbd_id: map.job_1, primary_pain_id: map.pain_1, primary_angle_id: map.angle_1_1, secondary_angle_ids: [], offer_id: map.offer_main, positioning: "Orden cotidiano", rationale: "Hipótesis local" };
    const selected = await call("set_product_strategy", choice), strategy = selected.data.strategy!.id;
    await call("patch_product_analysis", { schema_version: "1.0", operations: [{ op: "update", entity: "angle", id: map.angle_1_1, changes: { hook: "Encuentra tus útiles cuando los necesitas" } }] });
    const read = await call("get_product_strategy", {}); expect(read.data!.snapshot.angles[0].hook).toBe("Encuentra tus útiles cuando los necesitas");
    const changed = await call("set_product_strategy", { ...choice, positioning: "Todos los útiles a mano" }); expect(changed.data.strategy!.id).toBe(strategy);
    expect((await checked(db.from("pi_strategy_versions").select("id").eq("product_id", product))).data).toHaveLength(1);
    expect((await preparePublish(owner.userId, product)).missing).toEqual([]);
    expect((await checked(db.from("ai_generations").select("id").eq("product_id", product))).data).toEqual([]);
  });
  it("editar contexto y precio conserva textos, imágenes y usos", async () => {
    const before = await preparePublish(owner.userId, product);
    await call("save_product_context", { schema_version: "1.0", context: { description: "Contexto actualizado desde el chat." }, pricing: { mode: "recommended", unit_cost_minor: 4500 } });
    const after = await preparePublish(owner.userId, product);
    expect(after.missing).toEqual([]); expect(after.input.gallery).toEqual(before.input.gallery); expect(after.input.listing).toEqual(before.input.listing);
    expect((await checked(db.from("pi_visual_records").select("status,payload").eq("product_id", product).eq("kind", "binding").single())).data).toMatchObject({ status: "selected", payload: { selected: true } });
  });
  it("UI y MCP actualizan la misma fila vigente; el siguiente guardado explícito usa su contenido", async () => {
    const old = await row("listing"), manual = { ...listing, title: "Editado en DropFlex" };
    await updateComponent(owner.userId, product, "listing", { expected_id: old.id, expected_updated_at: old.updated_at, content: manual });
    const read = await call("get_landing_content", { component: "listing" });
    expect(read.data).toMatchObject({ current: { id: old.id, content: manual } });
    const fromChat = { ...listing, title: "Editado desde el chat" };
    await call("save_landing_content", { schema_version: "1.1", entries: [{ component: "listing", content: fromChat }] });
    expect(await row("listing")).toMatchObject({ id: old.id, content: fromChat });
    const rows = await checked(db.from("page_components").select("id").eq("product_id", product).eq("component", "listing")); expect(rows.data).toHaveLength(1);
  });
  it("guardar y migrar no recuperan descartes, secciones ocultas ni sobrescriben ediciones", async () => {
    let section = await row("pain-block");
    await updateComponent(owner.userId, product, "pain-block", { expected_id: section.id, expected_updated_at: section.updated_at, enabled: false });
    await call("save_landing_content", { schema_version: "1.1", entries: [{ component: "pain-block", content: section.proposal }] });
    section = await row("pain-block"); expect(section.enabled).toBe(false);
    await checked(db.from("page_components").update({ status: "rejected" }).eq("id", section.id));
    await call("save_landing_content", { schema_version: "1.1", entries: [{ component: "pain-block", content: section.proposal }] });
    const before = await row("listing"), chosen = (await checked(db.from("page_images").select("*").eq("product_id", product))).data!;
    const migration = readFileSync("supabase/migrations/20261211000000_current_product_content.sql", "utf8"), backfill = migration.split("-- BACKFILL CURRENT DECISIONS BEGIN")[1].split("-- BACKFILL CURRENT DECISIONS END")[0].replace("update public.page_images set", "update public.page_images set").replace("updated_at) end;", `updated_at) end where product_id='${product}';`).replace("where kind='binding'", `where product_id='${product}' and kind='binding'`);
    execFileSync("docker", ["exec", "-i", "supabase_db_dropflex-v2", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: `begin;\n${backfill}\ncommit;`, stdio: ["pipe", "pipe", "pipe"] });
    expect(await row("listing")).toEqual(before); expect(await row("pain-block")).toMatchObject({ status: "rejected", enabled: false });
    expect((await checked(db.from("page_images").select("*").eq("product_id", product))).data).toEqual(chosen);
  });
  it("editar una variante por MCP conserva imágenes omitidas; vaciarlas es una decisión explícita", async () => {
    const demo = CATALOG.find(c => c.id === "image-with-benefits")!.examples[0];
    await call("save_landing_content", { schema_version: "1.1", entries: [{ component: "image-with-benefits", content: demo, enabled: false }] });
    const before = await row("image-with-benefits"), cover = (await checked(db.from("page_images").select("id").eq("product_id", product).single())).data!;
    const images = [{ slot: "main", source: "page_image", id: cover.id }];
    await call("save_landing_content", { schema_version: "1.1", entries: [{ component: "image-with-benefits", content: [{ key: "default", angle_id: null, hook_id: null, content: demo, images }] }] });
    await call("save_landing_content", { schema_version: "1.1", entries: [{ component: "image-with-benefits", content: [{ key: "default", angle_id: null, hook_id: null, content: demo }] }] });
    expect(await row("image-with-benefits")).toMatchObject({ id: before.id, content: [{ images, content: demo }] });
    await call("save_landing_content", { schema_version: "1.1", entries: [{ component: "image-with-benefits", content: [{ key: "default", angle_id: null, hook_id: null, content: demo, images: [] }] }] });
    expect(await row("image-with-benefits")).toMatchObject({ content: [{ images: [] }] });
    expect((await preparePublish(owner.userId, product)).missing).toEqual([]);
  });
  it("vista previa y publicación resuelven el mismo contenido, orden y medios", async () => {
    const prepared = await preparePublish(owner.userId, product), page = await getEffectiveProductContent(owner.userId, product);
    expect(page.input).toEqual(prepared.input); expect(page.missing).toEqual(prepared.missing);
    expect(page.input.components).toEqual([]); expect(page.urls[`page-media/${path}`]).toContain("/object/sign/");
  });
  it("rechaza permisos insuficientes y muestra un archivo ausente como impedimento concreto", async () => {
    await expect(call("bind_visual_asset", { schema_version: "1.0", asset_id: asset, bindings: [{ target: { type: "gallery_shot", shot_key: "hero", slot: "cover", position: null } }] }, { ...owner, scopes: ["product_intelligence:read"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await checked(db.storage.from("page-media").remove([path]));
    const prepared = await preparePublish(owner.userId, product);
    expect(prepared.missing.join(" ")).toContain("archivo"); expect(prepared.missing.join(" ")).not.toMatch(/aproba|revis[iió]n|estrategia anterior/i);
  });
});
