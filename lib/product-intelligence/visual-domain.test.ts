import { describe, expect, it } from "vitest";
import { visualFixture } from "./visual-fixtures";
import { prepareIdentity, prepareVisualPlan, prepareIteration, prepareVisualReview, recordRef, recordValidity, vHash, assetCompatibility, makeVisualRecord, targetKey, prepareBindings, visualPlanReadiness } from "./visual-domain";
import { visualInputSchemas } from "./visual-schemas";
function ready() {
  const f = visualFixture(), i = prepareIdentity(f.state, f.identityInput);
  f.state.records = [i]; f.state.live[`identity:${i.id}`] = { hash: vHash({ identity_hash: i.payload.identity_hash }), value: i.payload, blocked: false };
  const approved = prepareVisualReview(f.state, { record_id: i.id, decision: "approve", reason: "", tags: [] })[0]; f.state.records = [approved];
  f.plan.identity_ref = recordRef(approved);
  const p = prepareVisualPlan(f.state, f.plan); f.state.records.push(p);
  const plan = prepareVisualReview(f.state, { record_id: p.id, decision: "approve", reason: "", tags: [] })[0]; f.state.records[1] = plan;
  return { ...f, plan };
}
describe("Contrato visual e invariantes", () => {
  it("exige aprobar la identidad primero y reencadena los borradores en el mismo batch", () => {
    const f = visualFixture(), identity = prepareIdentity(f.state, f.identityInput);
    f.state.records.push(identity); f.state.live[`identity:${identity.id}`] = { hash: vHash({ identity_hash: identity.payload.identity_hash }), value: {}, blocked: false };
    f.plan.identity_ref = recordRef(identity);
    const plan = prepareVisualPlan(f.state, f.plan); f.state.records.push(plan);
    expect(() => prepareVisualReview(f.state, { record_id: plan.id, decision: "approve", reason: "", tags: [] })).toThrow("identidad vigente");
    const changes = prepareVisualReview(f.state, { record_id: identity.id, decision: "approve", reason: "", tags: [] });
    const approved = changes[0], chained = changes.find(r => r.kind === "plan")!;
    expect(chained.status).toBe("review"); expect(chained.payload.identity_ref).toEqual(recordRef(approved));
    expect(chained.version).toBe(plan.version + 1);
    f.state.history.push(identity, plan); f.state.records = [approved, chained];
    const p = prepareVisualReview(f.state, { record_id: plan.id, decision: "approve", reason: "", tags: [] })[0];
    f.state.records[1] = p; expect(visualPlanReadiness(p, f.state).ready).toBe(true);
  });
  it("repara una referencia histórica de aprobación sin adoptar otra identidad física", () => {
    const f = ready(), head = f.state.records[0], previous = { ...head, version: head.version - 1, status: "review", etag: vHash("prior") };
    f.state.history.push(previous); f.plan.payload.identity_ref = recordRef(previous);
    expect(visualPlanReadiness(f.plan, f.state).next_action).toBe("reconcile_plan");
    const repaired = prepareVisualReview(f.state, { record_id: f.plan.id, decision: "approve", reason: "", tags: [] })[0];
    expect(repaired.payload.identity_ref).toEqual(recordRef(head));
    previous.payload = { ...head.payload, preserve: ["Otra forma"] };
    expect(() => prepareVisualReview(f.state, { record_id: f.plan.id, decision: "approve", reason: "", tags: [] })).toThrow("identidad física cambió");
  });
  it("indica reconciliación por estrategia nueva y conserva la validez granular por toma", () => {
    const f = ready(); f.state.live[`strategy:${f.strategy}`].blocked = true;
    expect(visualPlanReadiness(f.plan, f.state)).toMatchObject({ ready: false, next_action: "reconcile_plan", reasons: expect.arrayContaining([expect.objectContaining({ code: "strategy_changed" })]) });
    f.state.live[`strategy:${f.strategy}`].blocked = false;
    const shots = f.plan.payload.shots as { shot_key: string; dependencies: unknown[] }[];
    shots.push({ ...shots[0], shot_key: "offer", dependencies: [{ kind: "pricing", key: "current", content_hash: "a".repeat(64), usage: "overlay" }] });
    expect(visualPlanReadiness(f.plan, f.state, "offer").ready).toBe(false);
    expect(visualPlanReadiness(f.plan, f.state, "hero").ready).toBe(true);
  });
  it("el archivo nativo exige una URL descargable; nunca basta un ID o un path local", () => {
    const write = { product_id: visualFixture().product, schema_version: "1.0", expected_revision: 3, expected_etag: "a".repeat(64), expected_dependency_stamp: "a".repeat(64), idempotency_key: "native-file-test", iteration_id: visualFixture().identity };
    expect(visualInputSchemas.ingest_chatgpt_visual_asset.safeParse({ ...write, file: { file_id: "file-test" } }).success).toBe(false);
    expect(visualInputSchemas.ingest_chatgpt_visual_asset.safeParse({ ...write, file: { file_id: "file-test", download_url: "sandbox:/file.png" } }).success).toBe(false);
    expect(visualInputSchemas.ingest_chatgpt_visual_asset.safeParse({ ...write, file: { file_id: "file-test", download_url: "https://files.example.test/image" } }).success).toBe(true);
  });
  it("exige bytes de la base canónica, no acepta una huella inventada", () => {
    const f = visualFixture(); expect(() => prepareIdentity(f.state, { ...f.identityInput, reference_content_hash: vHash("inventado") })).toThrow("imagen base cambió");
    f.state.references = []; expect(() => prepareIdentity(f.state, f.identityInput)).toThrow("imagen base");
  });
  it("no invalida una foto por precio; solo la toma con overlay depende de pricing", () => {
    const f = ready(); f.state.live["pricing:current"].hash = vHash("nuevo precio"); expect(recordValidity(f.plan, f.state).state).toBe("current");
    const ad = { ...visualFixture().plan, strategy_id: f.plan.payload.strategy_id, identity_ref: f.plan.payload.identity_ref, shots: [{ ...visualFixture().plan.shots[0], channel: "ad", angle_id: f.angle, message: { takeaway: "Oferta", overlay_text: "$24.990" } }] };
    const plan = prepareVisualPlan(f.state, ad); f.state.live["pricing:current"].hash = vHash("otro precio"); expect(recordValidity(plan, f.state).state).toBe("needs_review");
    f.state.live[`reference:${f.reference}`].hash = vHash("nueva referencia"); expect(recordValidity(f.plan, f.state).state).toBe("needs_review");
  });
  it.each(["gallery", "pdp"] as const)("permite una oferta COD en %s y detecta cambios de precio y políticas", (channel) => {
    const f = ready(), raw = visualFixture().plan;
    raw.strategy_id = f.strategy; raw.identity_ref = recordRef(f.state.records[0]);
    raw.shots[0].channel = channel; raw.shots[0].angle_id = f.angle;
    raw.shots[0].message.overlay_text = "Pack de 3 a $47.990 · 50% de descuento · Envío gratis · Paga al recibir";
    const plan = prepareVisualPlan(f.state, raw);
    expect(recordValidity(plan, f.state).state).toBe("current");
    const priceHash = f.state.live["pricing:current"].hash;
    f.state.live["pricing:current"].hash = vHash("nuevo pack");
    expect(recordValidity(plan, f.state).state).toBe("needs_review");
    f.state.live["pricing:current"].hash = priceHash;
    f.state.live["policy:current"].hash = vHash("nuevo envío");
    expect(recordValidity(plan, f.state).state).toBe("needs_review");
  });
  it.each(["Pack para dos", "Uno de regalo", "Envío gratis", "2x1", "Lleva 3, paga 2"])("conserva la dependencia comercial sin monto: %s", (overlay_text) => {
    const f = ready(), raw = visualFixture().plan;
    raw.strategy_id = f.strategy; raw.identity_ref = recordRef(f.state.records[0]); raw.shots[0].angle_id = f.angle;
    raw.shots[0].message.overlay_text = overlay_text;
    const plan = prepareVisualPlan(f.state, raw);
    f.state.live["pricing:current"].hash = vHash("otra oferta");
    expect(recordValidity(plan, f.state).state).toBe("needs_review");
  });
  it("congela identidad y restricciones aprobadas; el resultado sintético nunca se declara evidencia real", () => {
    const f = ready(), input = { plan_ref: recordRef(f.plan), shot_key: "hero", parent_asset_id: null, reference_asset_ids: [], based_on_review_ids: [], resolved_instruction: "Usa la base", source_system: "chatgpt", model: null };
    const it = prepareIteration(f.state, input); expect(it.payload.reference_image_ids).toEqual([f.reference]); expect(it.payload.identity_snapshot).toMatchObject({ forbidden_variations: ["Accesorios inventados"] });
    const shot = (f.plan.payload.shots as Record<string, unknown>[])[0]; shot.representation = "real_evidence";
    expect(() => prepareIteration(f.state, input)).toThrow("sintética");
    f.plan.status = "review"; expect(() => prepareIteration(f.state, input)).toThrow("Aprueba");
  });
  it("separa aprobación de selección, evita archivar usos seleccionados y registra feedback", () => {
    const f = ready(), asset = makeVisualRecord(f.state, "asset", { representation: "product_depiction", shot_family: "product_clarity", file_id: "file", dependencies: [] }, "generated"); f.state.records.push(asset);
    f.state.files.push({ id: "file", bucket: "page-media", storage_path: "file.webp", width: 600, height: 600, mime_type: "image/webp", size_bytes: 123, sha256: f.hash });
    const target = { type: "gallery_shot" as const, shot_key: "hero", slot: "cover", position: null }, etag = vHash(target), key = targetKey(target);
    f.state.targets.push({ key, etag, value: target }); f.state.live[`content_variant:${key}`] = { hash: etag, value: target, blocked: false };
    const binding = prepareBindings(f.state, asset.id, [{ target, target_etag: etag }])[0]; f.state.records.push(binding);
    expect(() => prepareVisualReview(f.state, { record_id: binding.id, decision: "select", reason: "", tags: [] })).toThrow("Aprueba la imagen");
    const result = prepareVisualReview(f.state, { record_id: asset.id, decision: "approve", reason: "Fiel al producto", tags: ["good_product_fidelity"] });
    f.state.records[f.state.records.findIndex(r => r.id === asset.id)] = result[0]; expect(result[1].payload.tags).toEqual(["good_product_fidelity"]);
    const selected = prepareVisualReview(f.state, { record_id: binding.id, decision: "select", reason: "", tags: [] })[0]; f.state.records[f.state.records.findIndex(r => r.id === binding.id)] = selected;
    expect(() => prepareVisualReview(f.state, { record_id: asset.id, decision: "archive", reason: "", tags: [] })).toThrow("Quita los usos");
  });
  it("explica por qué un candidato requiere otro encuadre o revisión", () => {
    const f = ready(), fileId = "00000000-0000-4000-8000-000000000001";
    const asset = makeVisualRecord(f.state, "asset", { representation: "product_depiction", shot_family: "product_clarity", file_id: fileId, dependencies: [] }, "approved");
    f.state.files.push({ id: fileId, bucket: "page-media", storage_path: "file.webp", width: 600, height: 1000, mime_type: "image/webp", size_bytes: 123, sha256: f.hash });
    const result = assetCompatibility(asset, visualFixture().plan.shots[0], f.state); expect(result.compatible).toBe(false); expect(result.transformation).toBe("crop");
  });
  it("rechaza file_id inaccesible, protocolos alternativos y aprobación inyectada en MCP", () => {
    const f = ready(), write = { product_id: f.product, schema_version: "1.0", expected_revision: 3, expected_etag: f.state.etag, expected_dependency_stamp: f.state.dependency_stamp, idempotency_key: "valid-key-123", iteration_id: f.plan.id };
    expect(visualInputSchemas.ingest_external_visual_asset.safeParse({ ...write, source: { type: "conversation_file", file_id: "chat-file" } }).success).toBe(false);
    expect(visualInputSchemas.ingest_external_visual_asset.safeParse({ ...write, source: { type: "remote_url", url: "file:///etc/passwd" } }).success).toBe(false);
    expect(visualInputSchemas.save_visual_identity.safeParse({ ...write, identity: f.identityInput, status: "approved" }).success).toBe(false);
  });
  it("invalida únicamente la sección persuasiva consumida, incluyendo hechos heredados", () => {
    const f = ready(), id = f.plan.id, etag = f.hash, fact = f.reference;
    const section = { section_key: "hero", belief_keys: ["recognition"], claim_keys: [], fact_ids: [fact], evidence_ids: [] };
    f.state.live[`fact:${fact}`] = { hash: f.hash, value: {}, blocked: false };
    f.state.live[`persuasion_plan:${id}`] = { hash: etag, value: { version: 1, etag, payload: { sections: [section], claims: [], beliefs: [{ key: "recognition", fact_ids: [], evidence_ids: [] }] } }, blocked: false };
    f.state.live[`persuasion_section:${id}:hero`] = { hash: vHash(section), value: section, blocked: false };
    const raw = visualFixture().plan; raw.strategy_id = f.strategy; raw.identity_ref = recordRef(f.state.records[0]); raw.shots[0].angle_id = f.angle;
    raw.shots[0].persuasion_plan_ref = { id, version: 1, etag }; raw.shots[0].section_key = "hero"; raw.shots[0].belief_keys = ["recognition"];
    const plan = prepareVisualPlan(f.state, raw);
    f.state.live[`persuasion_plan:${id}`].hash = vHash("otra sección modificada"); expect(recordValidity(plan, f.state).state).toBe("current");
    f.state.live[`persuasion_section:${id}:hero`].hash = vHash("hero modificada"); expect(recordValidity(plan, f.state).state).toBe("needs_review");
    f.state.live[`fact:${fact}`].blocked = true; expect(recordValidity(plan, f.state).state).toBe("blocked");
  });
  it("permite recuperar un archivo sin heredar aprobación, y no reconoce evidencia revocada", () => {
    const f = ready(), a = makeVisualRecord(f.state, "asset", { dependencies: [], archived_at: "2026-10-01T00:00:00Z" }, "archived"); f.state.records.push(a);
    expect(() => prepareVisualReview(f.state, { record_id: a.id, decision: "approve", reason: "", tags: [] })).toThrow("archivada");
    const recovered = prepareVisualReview(f.state, { record_id: a.id, decision: "reopen", reason: "", tags: [] })[0]; expect(recovered.status).toBe("in_review"); expect(recovered.payload.archived_at).toBeUndefined();
    a.payload.dependencies = [{ kind: "evidence", key: "revoked", content_hash: f.hash, usage: "visual_result" }]; delete a.payload.archived_at;
    expect(() => prepareVisualReview(f.state, { record_id: a.id, decision: "approve", reason: "Intento de ignorar revocación", tags: [] })).toThrow("contenido cambió");
  });

});
