import { randomUUID } from "node:crypto";
import { vHash, type VisualState } from "./visual-domain";
import type { VisualPlan } from "./visual-schemas";
export function visualFixture() {
  const product = randomUUID(), reference = randomUUID(), strategy = randomUUID(), angle = randomUUID(), identity = randomUUID(), hash = vHash("reference bytes");
  const state: VisualState = { product_id: product, revision: 3, etag: vHash([]), dependency_stamp: vHash("stamp"), records: [], history: [], targets: [], files: [],
    references: [{ id: reference, is_base: true, storage_path: null, url: "https://example.test/reference.webp", mime_type: "image/webp" }], live: {
      [`reference:${reference}`]: { hash, value: { content_hash: hash }, blocked: false }, [`strategy:${strategy}`]: { hash: vHash("strategy"), value: {}, blocked: false },
      [`angle:${angle}`]: { hash: vHash("angle"), value: {}, blocked: false }, "pricing:current": { hash: vHash("price"), value: {}, blocked: false }, "policy:current": { hash: vHash("policy"), value: {}, blocked: false } } };
  const identityInput = { canonical_reference_image_id: reference, reference_content_hash: hash, reference_mode: "strict_product_identity" as const,
    identity_description: "Organizador negro de compartimentos", preserve: ["Forma y color"], allowed_variations: ["Luz y cámara"], forbidden_variations: ["Accesorios inventados"] };
  const plan: VisualPlan = { name: "Fotos de la página", strategy_id: strategy, identity_ref: { id: identity, version: 1, etag: hash },
    visual_system: { world: "real_home", palette: "Neutros", lighting: "Natural", photography_style: "Fotografía realista", typography: null, mood: "Práctico", consistency_notes: "Mismo escritorio" },
    shots: [{ shot_key: "hero", shot_family: "product_clarity", name: "Producto en el escritorio", priority: "must_have", channel: "pdp", angle_id: angle, landing_angle_id: null, landing_hook_id: null,
      persuasion_plan_ref: null, section_key: null, persuasion_job: "recognition", belief_keys: [], fact_ids: [], evidence_ids: [], claim_keys: [], objective: "Mostrar el organizador en su contexto",
      product_identity: "inherit", product_role: "hero", representation: "product_depiction", scene: { environment: "Casa", location: "Escritorio", surface: "Madera", action: "Producto sobre la mesa", props: [], lighting: "Ventana", result: null, people: { allowed: false, face_visible: false, description: null } },
      composition: { aspect_ratio: "1:1", camera: "Tres cuartos", framing: "Plano medio", product_prominence: "hero", negative_space: null, focus: "Producto" }, message: { takeaway: "Cada útil en su lugar", overlay_text: null }, avoid: [], generation_required: true }] };
  return { state, product, reference, strategy, angle, identity, hash, identityInput, plan };
}
