import "server-only";
import { z } from "zod";
import sharp from "sharp";
import { GALLERY_MAX, slotKind } from "@/lib/page-images/catalog";
import { imagesForGeneration } from "@/lib/products/store";
import { contentVariants } from "@/lib/copy/variants";
import { componentCapabilityCatalog } from "./component-capabilities";
import { parseKnowledgeRead, graphRecords, strategyResponse } from "./knowledge";
import type { Principal } from "./policy";
import { persuasionRecordSchema, experienceRecordSchema } from "./persuasion-schemas";
import { visualReadSchema, vHash, targetKey, type VisualState } from "./visual-domain";
import { downloadVisual, visualStoredBytes, visualByteHash, visualSignedUrl } from "./visual-media";
import type { VisualTarget } from "./visual-schemas";

const row = z.record(z.string(), z.unknown());
const sourceSchema = z.object({ references: z.array(z.object({ id: z.string(), storage_path: z.string().nullable(), url: z.string().nullable(), mime_type: z.string().nullable().optional(),
  is_base: z.boolean(), is_cover: z.boolean(), excluded: z.boolean() })), gallery: z.array(row), gallery_shots: z.array(row), creative_concepts: z.array(row), scripts: z.array(row), video_shots: z.array(row),
  pdp: z.object({ plans: z.array(persuasionRecordSchema), experiences: z.array(experienceRecordSchema), landing: z.object({ rows: z.array(z.object({ component: z.string(), proposal: z.unknown(), content: z.unknown(), images: z.array(z.unknown()).optional() })), review_count: z.number() }) }) });
const sourceRead = z.object({ source: sourceSchema, knowledge: z.unknown() });
function semantic(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semantic);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !["last_revision", "updated_at", "created_at"].includes(k) && value[k as keyof typeof value] !== undefined).map(([k, v]) => [k, semantic(v)]));
  return value;
}
export async function hydrateVisualState(raw: unknown, principal: Principal, productId: string): Promise<VisualState> {
  const parsed = sourceRead.parse(raw), src = parsed.source, read = parseKnowledgeRead(parsed.knowledge, principal, productId);
  const live: VisualState["live"] = {}, targets: VisualState["targets"] = [];
  const add = (kind: string, key: string, value: unknown, blocked = false) => { live[`${kind}:${key}`] = { hash: vHash(semantic(value)), value, blocked }; };
  const refs = imagesForGeneration(src.references);
  const references = await Promise.all(refs.map(async (r, i) => ({ id: r.id, storage_path: r.storage_path, mime_type: r.mime_type ?? null,
    is_base: i === 0, url: r.storage_path ? await visualSignedUrl("product-references", r.storage_path) : r.url })));
  if (refs[0]) {
    const r = refs[0];
    try {
      const bytes = r.storage_path ? await visualStoredBytes("product-references", r.storage_path) : await downloadVisual(r.url!);
      const meta = await sharp(bytes).metadata();
      add("reference", r.id, { id: r.id, content_hash: visualByteHash(bytes), mime_type: meta.format === "jpeg" ? "image/jpeg" : `image/${meta.format}`, width: meta.width, height: meta.height });
    } catch { add("reference", r.id, { id: r.id, content_hash: null }, true); }
  }
  const selected = read.strategy;
  if (selected) {
    const { snapshot } = selected;
    // Each angle/fact has its own stamp. A price edit does not invalidate plain product photos.
    add("strategy", selected.id, { id: selected.id, positioning: snapshot.positioning, rationale: snapshot.rationale, persona: snapshot.persona,
      jtbd: snapshot.jtbd, pain: snapshot.pain, desires: snapshot.desires, objections: snapshot.objections }, selected.state !== "selected" || read.currentActiveStrategyId !== selected.id);
  }
  const graph = graphRecords(read.currentGraph);
  for (const { value } of read.currentGraph.angle) add("angle", value.id, value, value.lifecycle !== "active" || !selected?.snapshot.angles.some(a => a.id === value.id));
  for (const { value } of read.currentGraph.Fact) add("fact", value.id, value, value.verification_status !== "verified" || value.usage_status !== "approved" || read.currentGraph.EvidenceLink.some(e => e.value.fact_id === value.id && e.value.relation === "contradicts"));
  for (const { value } of read.currentGraph.EvidenceLink) {
    const source = read.currentGraph.Source.find(s => s.value.id === value.source_id)?.value;
    add("evidence", value.id, { ...value, source }, !source || value.relation !== "supports" || live[`fact:${value.fact_id}`]?.blocked !== false);
  }
  add("pricing", "current", read.currentSnapshot.pricing, !read.currentSnapshot.pricing);
  add("policy", "current", read.currentSnapshot.settings, !read.currentSnapshot.settings);
  const state = visualReadSchema.parse({ ...raw as object, live, references, targets });
  for (const r of state.records.filter(r => r.kind === "identity")) add("identity", r.id, { identity_hash: r.payload.identity_hash }, ["archived", "rejected"].includes(r.status));
  for (const p of src.pdp.plans) {
    add("persuasion_plan", p.id, { version: p.revision, etag: p.etag, payload: p.payload }, p.payload.status === "archived");
    for (const section of p.payload.sections) add("persuasion_section", `${p.id}:${section.section_key}`, { section, claims: p.payload.claims.filter(c => section.claim_keys.includes(c.key)), beliefs: p.payload.beliefs.filter(b => section.belief_keys.includes(b.key)) }, p.payload.status === "archived");
  }
  const addTarget = (target: VisualTarget, value: unknown) => { const key = targetKey(target), etag = vHash(semantic(value)); targets.push({ key, etag, value: { target, detail: semantic(value) } }); live[`content_variant:${key}`] = { hash: etag, value, blocked: false }; };
  addTarget({ type: "gallery_shot", slot: "cover", shot_key: "general", position: null }, { slot: "cover", ratio: "1:1" });
  for (let position = 1; position <= GALLERY_MAX; position++) addTarget({ type: "gallery_shot", slot: "gallery", shot_key: "general", position }, { slot: "gallery", position, ratio: "1:1" });
  for (const shot of src.gallery_shots.filter(s => slotKind(String(s.slot)) === "benefit")) addTarget({ type: "gallery_shot", slot: String(shot.slot), shot_key: "general", position: null }, { slot: shot.slot, ratio: "3:4", shot: shot.payload });
  for (const exp of src.pdp.experiences.filter(e => e.payload.status !== "archived")) {
    add("landing_experience", exp.id, exp.payload);
    for (const section of exp.payload.sections.filter(s => s.enabled)) {
      const native = componentCapabilityCatalog(src.pdp.landing.review_count).find(c => c.component === section.component);
      const content = src.pdp.landing.rows.find(r => r.component === section.component);
      const variant = content && contentVariants(content.content ?? content.proposal).find(v => v.key === section.content_variant_key);
      if (!variant) continue;
      for (const slot of native?.image_slots ?? []) addTarget({ type: "landing_section", experience_id: exp.id, content_variant_key: section.content_variant_key,
        section_key: section.section_key, component: section.component, slot: slot.key }, { section: { ...section, images: undefined, asset_refs: undefined, manual_overrides: undefined }, variant: { ...variant, images: undefined }, slot });
    }
  }
  for (const c of src.creative_concepts) for (const ratio of ["1:1", "9:16"] as const) addTarget({ type: "creative_concept", concept_id: String(c.id), ratio, slot: "image" }, { concept: c.payload, input: c.input, ratio });
  for (const s of src.video_shots.filter(s => !s.superseded_at && ["keyframe", "b_roll"].includes(String(s.kind)))) {
    const script = src.scripts.find(r => r.id === s.script_id);
    if (script?.approved_at) addTarget({ type: "ugc_shot", script_id: String(s.script_id), video_shot_id: String(s.id), slot: s.kind === "keyframe" ? "keyframe" : "b_roll" }, { script: script.payload, approved_at: script.approved_at, key: s.key, kind: s.kind });
  }
  // Maps/arrays in state were cloned by Zod; use the populated instances.
  state.live = live; state.targets = targets;
  state.knowledge = { product: read.currentSnapshot.catalog, context: read.currentSnapshot.context, pricing: read.currentSnapshot.pricing, policies: read.currentSnapshot.settings,
    strategy: selected ? strategyResponse(selected, read, productId) : null, graph, persuasion_plans: src.pdp.plans, landing_experiences: src.pdp.experiences,
    gallery_requirements: src.gallery.map(r => ({ id: r.id, payload: r.payload })), creative_concepts: src.creative_concepts.map(c => ({ id: c.id, payload: c.payload })) };
  return state;
}
