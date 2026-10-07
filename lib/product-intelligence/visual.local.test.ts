import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createProductIntelligenceExecutor } from "./knowledge-service";
import { createContextRepository, contextAccess } from "./repository";
import { PI_SCOPES, type Principal } from "./policy";
import { requestFixture } from "./test-fixtures";
import { parseToolInput, parseToolOutput } from "./validation";
import { persuasionPlanFixture } from "./persuasion-fixtures";
import { ugcInputFixture } from "./ugc-fixtures";
import { reviewUgc } from "./ugc-service";
import { assertVisualBindingsPublishable } from "./visual-publication";
import { vHash } from "./visual-domain";
import { visualFixture } from "./visual-fixtures";
import { visualRecordSchema, type VisualRecord } from "./visual-schemas";
import { reviewVisualRecord } from "./visual-service";
import { runVisualIngestion } from "./visual-operations";
import { deleteProducts } from "@/lib/products/delete";
import { getVisualWorkbench } from "@/lib/data/visual-production";
import type { ToolName, ToolOutputs } from "./schemas";

describe.runIf(process.env.PI_LOCAL_TEST === "1")("Visual production · Supabase local", () => {
  let db: SupabaseClient, owner: Principal, execute: ReturnType<typeof createProductIntelligenceExecutor>, strategyId: string, angleId: string;
  let identity: VisualRecord, plan: VisualRecord, iteration: VisualRecord, asset: VisualRecord;
  const product = randomUUID(), reference = randomUUID(), prefixPaths: { bucket: string; path: string }[] = [];
  async function checked<T extends { error: unknown }>(op: PromiseLike<T>) { const result = await op; if (result.error) throw new Error(JSON.stringify(result.error)); return result; }
  async function call<K extends ToolName>(tool: K, raw: unknown, principal = owner) {
    let input; try { input = parseToolInput(tool, raw); } catch (e) { throw new Error(JSON.stringify(e)); }
    const result = parseToolOutput(tool, await execute(principal, { tool, input } as Parameters<typeof execute>[1], AbortSignal.timeout(30000)));
    if (!result.ok) throw result; return result as ToolOutputs[K] & { ok: true };
  }
  function repository() { const repo = createContextRepository(db); return { ...repo, commitVisual: async (args: Record<string, unknown>) => (await checked(db.rpc("pi_commit_visual", args))).data }; }
  async function state() { return (await checked(db.rpc("pi_load_visual", { p_access: contextAccess(owner), p_product_id: product }))).data; }
  async function preconditions() { const s = await state(); return { product_id: product, schema_version: "1.0", expected_revision: s.revision, expected_etag: s.etag, expected_dependency_stamp: s.dependency_stamp, idempotency_key: randomUUID(), dry_run: false }; }
  async function approve(record: VisualRecord) {
    const result = await reviewVisualRecord(repository(), owner, { ...await preconditions(), record_id: record.id, decision: "approve", reason: "Fiel al producto", tags: ["good_product_fidelity"] }, AbortSignal.timeout(30000));
    return visualRecordSchema.parse((result as { data: { records: unknown[] } }).data.records[0]);
  }
  beforeAll(async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const user = await checked(db.auth.admin.createUser({ email: `visual-${randomUUID()}@example.test`, password: randomUUID(), email_confirm: true }));
    const id = user.data.user!.id; owner = { userId: id, actorId: id, actorKind: "merchant", scopes: PI_SCOPES }; execute = createProductIntelligenceExecutor(repository());
    await checked(db.from("merchant_settings").insert({ user_id: id, country_code: "CL", currency: "CLP", language: "es", timezone: "America/Santiago", market_confirmed_at: new Date().toISOString() }));
    await checked(db.from("products").insert({ id: product, user_id: id, title: "Organizador visual de prueba", shopify_product_id: product, currency: "CLP" }));
    expect(await getVisualWorkbench(id, product)).toMatchObject({ records: [], canonical_reference: null });
    const canonical = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 20, g: 20, b: 20 } } }).webp().toBuffer();
    const path = `${id}/${product}/canonical.webp`; prefixPaths.push({ bucket: "product-references", path });
    await checked(db.storage.from("product-references").upload(path, canonical, { contentType: "image/webp" }));
    await checked(db.from("product_reference_images").insert({ id: reference, product_id: product, user_id: id, source: "upload", storage_path: path, mime_type: "image/webp", is_cover: true, is_base: true }));
    const env = (revision: number) => ({ product_id: product, schema_version: "1.0", expected_revision: revision, idempotency_key: randomUUID() });
    const researched = await call("save_research", { ...requestFixture("propose-research").payload as object, ...env(0) }); const fact = researched.data.id_map.compartments_fact;
    await call("save_product_context", { ...env(1), context: { display_name: "Organizador", description: "Organizador con compartimentos", base_reference_image_id: reference }, pricing: { mode: "recommended", unit_cost_minor: 4000 } });
    const analysis = JSON.parse(JSON.stringify(requestFixture("analysis-four-personas").payload).replaceAll("00000000-0000-0000-0000-00000000000b", fact));
    const analyzed = await call("save_product_analysis", { ...analysis, ...env(2) }), map = analyzed.data.id_map;
    await call("save_research", { ...env(3), facts: [{ id: fact, verification_status: "verified", usage_status: "approved", reason: "Solo fixture local" }] });
    const selected = await call("set_product_strategy", { ...env(4), based_on_revision: 4, action: "select", primary_persona_id: map.persona_1, primary_jtbd_id: map.job_1, primary_pain_id: map.pain_1, primary_angle_id: map.angle_1_1, secondary_angle_ids: [], offer_id: map.offer_main, positioning: "Orden cotidiano", rationale: "Hipótesis local" });
    strategyId = selected.data.strategy!.id; angleId = map.angle_1_1;
  }, 40000);
  afterAll(async () => {
    if (!db || !owner) return;
    for (const bucket of ["product-references", "page-media", "creative-media", "ad-media"]) {
      const listed = await db.storage.from(bucket).list(`${owner.userId}/${product}`, { limit: 1000 });
      if (listed.data?.length) await checked(db.storage.from(bucket).remove(listed.data.map(f => `${owner.userId}/${product}/${f.name}`)));
    }
    await checked(db.auth.admin.deleteUser(owner.userId));
  }, 20000);
  it("lee referencia consumible, CAS, dry-run y replay previo a CAS", async () => {
    const context = await call("get_visual_generation_context", { product_id: product });
    expect(context.data.canonical_reference).toMatchObject({ id: reference, width: 600, height: 600 });
    const ref = context.data.canonical_reference as { content_hash: string; url: string };
    expect((await fetch(ref.url)).ok).toBe(true);
    const write = { ...await preconditions(), identity: { ...visualFixture().identityInput, canonical_reference_image_id: reference, reference_content_hash: ref.content_hash } };
    expect(await call("save_visual_identity", { ...write, dry_run: true })).toMatchObject({ data: { applied: false } });
    const saved = await call("save_visual_identity", write); identity = visualRecordSchema.parse((saved.data.records as unknown[])[0]);
    expect(await call("save_visual_identity", write)).toEqual(saved);
    await expect(call("save_visual_identity", { ...write, idempotency_key: randomUUID() })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(call("save_visual_identity", { ...write, identity: { ...write.identity, identity_description: "Otro" } })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    identity = await approve(identity);
  });
  it("persiste el plan y congela la toma solo después de la revisión merchant", async () => {
    const value = visualFixture().plan; value.strategy_id = strategyId; value.identity_ref = { id: identity.id, version: identity.version, etag: identity.etag }; value.shots[0].angle_id = angleId;
    const saved = await call("save_visual_generation_plan", { ...await preconditions(), plan: value }); plan = visualRecordSchema.parse((saved.data.records as unknown[])[0]);
    const input = { plan_ref: { id: plan.id, version: plan.version, etag: plan.etag }, shot_key: "hero", source_system: "chatgpt", resolved_instruction: "Conserva la forma del organizador canónico" };
    await expect(call("prepare_visual_iteration", { ...await preconditions(), ...input })).rejects.toThrow("Aprueba");
    plan = await approve(plan);
    const prepared = await call("prepare_visual_iteration", { ...await preconditions(), ...input, plan_ref: { id: plan.id, version: plan.version, etag: plan.etag } });
    iteration = visualRecordSchema.parse((prepared.data.records as unknown[])[0]);
    const recovered = await call("get_visual_generation_plan", { product_id: product, plan_id: plan.id, shot_key: "hero" });
    expect(recovered.data.identity).toMatchObject({ id: identity.id });
  });
  it("ticket firmado → optimización → copia propia → asset por revisar; deduplica sin autoaprobar", async () => {
    const bytes = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: { r: 30, g: 35, b: 40 } } }).png().toBuffer();
    const ticket = await call("prepare_visual_asset_upload", { ...await preconditions(), iteration_id: iteration.id, mime_type: "image/png", size_bytes: bytes.length });
    const upload = ticket.data.upload as { path: string; token: string };
    expect((await fetch((ticket.data.upload as { url: string }).url, { method: "PUT", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: new Uint8Array(bytes) })).ok).toBe(true);
    const ingestion = await call("ingest_external_visual_asset", { ...await preconditions(), iteration_id: iteration.id, source: { type: "upload_ticket", ticket_id: ticket.data.operation_id } });
    await runVisualIngestion(String(ingestion.data.operation_id));
    const status = await call("get_visual_ingestion_status", { product_id: product, operation_id: ingestion.data.operation_id });
    expect(status.data, JSON.stringify(status.data)).toMatchObject({ state: "succeeded" });
    const assets = await call("list_visual_assets", { product_id: product }); asset = visualRecordSchema.parse((assets.data.items as unknown[])[0]); expect(asset.status).toBe("generated");
    expect((assets.data.items as { file: { mime_type: string } }[])[0].file.mime_type).toBe("image/webp");
    const again = await call("prepare_visual_asset_upload", { ...await preconditions(), iteration_id: iteration.id, mime_type: "image/png", size_bytes: bytes.length });
    const second = again.data.upload as { path: string; token: string }; await checked(db.storage.from("page-media").uploadToSignedUrl(second.path, second.token, bytes, { contentType: "image/png" }));
    const repeated = await call("ingest_external_visual_asset", { ...await preconditions(), iteration_id: iteration.id, source: { type: "upload_ticket", ticket_id: again.data.operation_id } });
    await runVisualIngestion(String(repeated.data.operation_id));
    expect((await call("get_visual_ingestion_status", { product_id: product, operation_id: repeated.data.operation_id })).data.result).toMatchObject({ asset_id: asset.id });
    expect((await state()).files).toHaveLength(1);
  }, 30000);
  it("selección merchant proyecta portada; conserva feedback, historial y candidatos reutilizables", async () => {
    const context = await call("get_visual_generation_context", { product_id: product });
    const target = (context.data.targets as { key: string; etag: string; value: { target: unknown } }[]).find(t => t.key === "gallery:cover")!;
    const bound = await call("bind_visual_asset", { ...await preconditions(), asset_id: asset.id, bindings: [{ target: target.value.target, target_etag: target.etag }] });
    const binding = visualRecordSchema.parse((bound.data.records as unknown[])[0]);
    await expect(reviewVisualRecord(repository(), owner, { ...await preconditions(), record_id: binding.id, decision: "select" }, AbortSignal.timeout(30000))).rejects.toThrow("Aprueba la imagen");
    asset = await approve(asset);
    await reviewVisualRecord(repository(), owner, { ...await preconditions(), record_id: binding.id, decision: "select" }, AbortSignal.timeout(30000));
    const bridge = (await checked(db.from("page_images").select("*").eq("visual_binding_id", binding.id).single())).data;
    expect(bridge).toMatchObject({ status: "approved", slot: "cover", source: "upload" });
    const workbench = await getVisualWorkbench(owner.userId, product); expect(workbench?.records.find(r => r.id === asset.id)?.reviews).toHaveLength(1);
    expect((await call("get_visual_reuse_candidates", { product_id: product, plan_ref: { id: plan.id, version: plan.version, etag: plan.etag }, shot_key: "hero" })).data.items).toHaveLength(1);
    expect((await call("get_visual_iteration_history", { product_id: product, plan_id: plan.id })).data.items).toHaveLength(1);
    await expect(reviewVisualRecord(repository(), owner, { ...await preconditions(), record_id: asset.id, decision: "archive" }, AbortSignal.timeout(30000))).rejects.toThrow("Quita los usos");
  });
  it("reutiliza el mismo archivo en PDP, Meta y UGC; B-roll permanece un storyboard", async () => {
    const copyRun = randomUUID(), componentId = randomUUID(), persuasionId = randomUUID(), experienceId = randomUUID(), creativeRun = randomUUID(), conceptId = randomUUID();
    await checked(db.from("copy_runs").insert({ id: copyRun, product_id: product, user_id: owner.userId, status: "succeeded" }));
    const content = { heading: "Razones para organizar tu mesa", benefits: Array.from({ length: 4 }, () => ({ icon: "target", title: "Orden práctico", body: "Los compartimentos separan tus útiles para encontrarlos cuando los necesitas." })) };
    await checked(db.from("page_components").insert({ id: componentId, product_id: product, user_id: owner.userId, run_id: copyRun, component: "image-with-benefits", position: 2, proposal: content, content: null, images: [], enabled: true, status: "approved" }));
    const pp = persuasionPlanFixture(); pp.strategy_id = strategyId; pp.angle_id = angleId;
    await checked(db.from("pi_persuasion_plans").insert({ id: persuasionId, product_id: product, user_id: owner.userId, strategy_id: strategyId, angle_id: angleId, landing_angle_id: "desk", revision: 1, etag: vHash(pp), payload: pp }));
    const section = { section_key: "fit", component: "image-with-benefits", content_variant_key: "default", persuasion_job: "product_fit", belief_keys: ["fit"], enabled: true, images: [], asset_refs: [], manual_overrides: [] };
    const experience = { schema_version: "1.0", strategy_id: strategyId, angle_id: angleId, persuasion_plan_id: persuasionId, plan_revision: 1, landing_angle_id: "desk", landing_hook_id: null, experience_key: "desk", architecture_variant: "fit", is_default: true, status: "draft", sections: [section] };
    await checked(db.from("pi_landing_experiences").insert({ id: experienceId, product_id: product, user_id: owner.userId, persuasion_plan_id: persuasionId, strategy_id: strategyId, angle_id: angleId, landing_angle_id: "desk", experience_key: "desk", is_default: true, status: "draft", revision: 1, etag: vHash(experience), payload: experience }));
    await checked(db.from("creative_runs").insert({ id: creativeRun, product_id: product, user_id: owner.userId, status: "succeeded" }));
    await checked(db.from("creative_concepts").insert({ id: conceptId, run_id: creativeRun, product_id: product, user_id: owner.userId, angle_slot: 1, position: 1, family: "hero", payload: { name: "Escritorio", angle_id: angleId, landing_angle_id: "desk", landing_hook_id: "lost-pencil" } }));
    const ugc = await call("get_ugc_content", { product_id: product });
    const saved = await call("save_ugc_content", { ...ugcInputFixture(product, strategyId, angleId), expected_revision: ugc.revision, expected_ugc_etag: ugc.data.ugc_etag });
    const scriptId = saved.data.script_id!;
    const current = await call("get_ugc_content", { product_id: product, script_id: scriptId });
    await reviewUgc(repository(), owner, product, scriptId, "approve", String(current.data.scripts[0].artifact_etag));
    const keyframe = randomUUID(), broll = randomUUID();
    await checked(db.from("video_shots").insert([{ id: keyframe, product_id: product, user_id: owner.userId, script_id: scriptId, key: "K3", kind: "keyframe", endpoint: "external", input: {}, render_status: "failed" },
      { id: broll, product_id: product, user_id: owner.userId, script_id: scriptId, key: "B1", kind: "b_roll", endpoint: "external", input: {}, render_status: "failed" }]));
    const context = await call("get_visual_generation_context", { product_id: product });
    const targets = (context.data.targets as { key: string; etag: string; value: { target: { type: string; ratio?: string; slot?: string } } }[]).filter(t => t.key.includes(experienceId) || t.key === `creative:${conceptId}:1:1` || t.key.includes(keyframe) || t.key.includes(broll));
    expect(targets).toHaveLength(4);
    const bound = await call("bind_visual_asset", { ...await preconditions(), asset_id: asset.id, bindings: targets.map(t => ({ target: t.value.target, target_etag: t.etag })) });
    const uses = (bound.data.records as unknown[]).map(r => visualRecordSchema.parse(r));
    for (const b of uses) await reviewVisualRecord(repository(), owner, { ...await preconditions(), record_id: b.id, decision: "select" }, AbortSignal.timeout(30000));
    expect((await state()).files).toHaveLength(1);
    const native = (await checked(db.from("page_components").select("images").eq("id", componentId).single())).data!;
    expect(native.images[0]).toMatchObject({ slot: "main", source: "page_image" });
    const ad = (await checked(db.from("ad_media").select("*").eq("product_id", product).single())).data!;
    expect(ad).toMatchObject({ mime_type: "image/jpeg", status: "ready", content_provenance: { kind: "visual_static", visual_asset_id: asset.id } });
    const clip = (await checked(db.from("video_shots").select("*").eq("id", broll).single())).data!;
    expect(clip).toMatchObject({ render_status: "failed", storage_path: null, input: { visual_storyboard_asset_id: asset.id } });
    await assertVisualBindingsPublishable(owner.userId, product, uses.map(b => b.id));
    expect((await db.from("page_images").update({ status: "rejected" }).eq("visual_binding_id", uses[0].id)).error?.message).toContain("PI_DEPENDENCY_IN_USE");
    expect((await db.from("creative_assets").update({ status: "generated" }).eq("visual_binding_id", uses[1].id)).error?.message).toContain("PI_DEPENDENCY_IN_USE");
    const changedExperience = (await checked(db.from("pi_landing_experiences").select("payload").eq("id", experienceId).single())).data!.payload;
    changedExperience.sections = changedExperience.sections.map((s: { section_key: string; enabled: boolean }) => s.section_key === "fit" ? { ...s, enabled: false } : s);
    await checked(db.from("pi_landing_experiences").update({ payload: changedExperience }).eq("id", experienceId));
    await expect(assertVisualBindingsPublishable(owner.userId, product, [uses[0].id])).rejects.toThrow("contenido cambió");
    await reviewVisualRecord(repository(), owner, { ...await preconditions(), record_id: uses[0].id, decision: "unselect" }, AbortSignal.timeout(30000));
    expect((await checked(db.from("page_images").select("status").eq("visual_binding_id", uses[0].id).single())).data!.status).toBe("generated");
    expect((await call("list_visual_assets", { product_id: product })).data.items[0].validity.state).toBe("current");
    expect((await checked(db.from("ai_generations").select("*", { head: true, count: "exact" }).eq("product_id", product))).count).toBe(0);
  }, 30000);
  it("drift granular, historial de intentos y reconciliación no heredan aprobación", async () => {
    const oldPlan = plan.payload; const input = { ...await preconditions(), plan_ref: { id: plan.id, version: plan.version, etag: plan.etag }, shot_key: "hero", source_system: "chatgpt", resolved_instruction: "Nueva variante", parent_asset_id: asset.id };
    const next = await call("prepare_visual_iteration", input), it = visualRecordSchema.parse((next.data.records as unknown[])[0]);
    await call("record_visual_iteration_result", { ...await preconditions(), iteration_id: it.id, state: "failed", detail: "El generador externo no entregó un archivo" });
    expect((await call("get_visual_iteration_history", { product_id: product })).data.items).toHaveLength(2);
    const context = await state();
    await call("save_visual_identity", { ...await preconditions(), identity_id: identity.id, identity: { ...visualFixture().identityInput, canonical_reference_image_id: reference, reference_content_hash: identity.payload.reference_content_hash, identity_description: "Organizador negro compacto con compartimentos" } });
    expect((await call("get_visual_reconciliation_context", { product_id: product, plan_id: plan.id })).data.shots).toMatchObject([{ validity: { state: "needs_review" } }]);
    const newest = visualRecordSchema.parse((await state()).records.find((r: VisualRecord) => r.id === identity.id)); identity = await approve(newest);
    const updatedPlan = { name: oldPlan.name, strategy_id: oldPlan.strategy_id, identity_ref: { id: identity.id, version: identity.version, etag: identity.etag }, visual_system: oldPlan.visual_system,
      shots: (oldPlan.shots as Record<string, unknown>[]).map(s => Object.fromEntries(Object.entries(s).filter(([k]) => !["dependencies", "shot_hash", "shot_id", "shot_version"].includes(k)))) };
    const reconciled = await call("save_visual_reconciliation", { ...await preconditions(), plan_id: plan.id, plan: updatedPlan, resolutions: [{ shot_key: "hero", action: "retain", reason: "Se conserva la escena, y la descripción precisa la misma forma física" }] });
    expect((reconciled.data.records as VisualRecord[])[0].status).toBe("review");
    expect((await state()).history.length).toBeGreaterThan(context.history.length);
    expect((await call("get_visual_reuse_candidates", { product_id: product, plan_ref: { id: plan.id, version: plan.version, etag: plan.etag }, shot_key: "hero" })).data.items).toMatchObject([{ reuse: { compatible: false } }]);
  });
  it("lecturas y escrituras fallan sin scopes; versionado inmutable y borrado en cascada", async () => {
    await expect(reviewVisualRecord(repository(), { ...owner, actorKind: "delegated" }, {}, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call("list_visual_assets", { product_id: product }, { ...owner, scopes: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call("get_visual_identity", { product_id: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await db.from("pi_visual_versions").update({ record: {} }).eq("record_id", identity.id)).error).toBeTruthy();
    await checked(db.rpc("pi_begin_product_deletion", { p_user_id: owner.userId, p_product_id: product }));
    await expect(call("list_visual_assets", { product_id: product })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await deleteProducts(owner.userId, [product])).toBe(1);
    for (const bucket of ["page-media", "creative-media", "ad-media", "product-references"]) expect((await checked(db.storage.from(bucket).list(`${owner.userId}/${product}`))).data).toEqual([]);
    for (const table of ["pi_visual_records", "pi_visual_files", "pi_visual_versions", "pi_visual_receipts", "pi_visual_operations", "pi_visual_read_snapshots", "page_images"])
      expect((await checked(db.from(table).select("*", { head: true, count: "exact" }).eq("product_id", product))).count).toBe(0);
  });
});
