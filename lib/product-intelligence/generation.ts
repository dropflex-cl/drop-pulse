import { GALLERY_MIN } from "@/lib/page-images/catalog";
import { canonicalHash } from "./concurrency";
import { invalidReference, ProductIntelligenceError } from "./errors";
import { usageRestrictions, validateGraph, type IntelligenceGraph, type RecordKind } from "./graph";
import type { Principal } from "./policy";
import { generationContextSchema, type FinancialSnapshot, type GenerationContext, type Strategy } from "./schemas";
import { jsonBytes, PI_LIMITS } from "./validation";
import { validateSnapshotClosure } from "./strategy";

export interface FrozenAsset {
  userId: string;
  productId: string;
  id: string;
  contentHash: string;
  isBase: boolean;
  slot?: "cover" | "gallery" | "benefit";
}
export interface FreezeInput {
  principal: Principal;
  productId: string;
  currentRevision: number;
  strategy: Strategy;
  graph: IntelligenceGraph;
  product: GenerationContext["product"];
  market: GenerationContext["market"];
  policies: GenerationContext["policies"];
  pricing: FinancialSnapshot;
  referenceImages: readonly FrozenAsset[];
  pageImages: readonly FrozenAsset[];
  angleIds: readonly string[];
  kind: "landing_content" | "landing_images" | "ugc_script";
  imageQaEnabled: boolean;
  promptVersions: GenerationContext["prompt_versions"];
  costPolicy: GenerationContext["cost_policy"];
  now: Date;
}

/** Congela el input; no carga legacy, firma URLs, llama IA ni crea jobs. */
export function freezeGenerationContext(input: FreezeInput): { context: GenerationContext; contextHash: string } {
  const { strategy, pricing } = input;
  validateGraph(input.graph, input.principal.userId, input.productId);
  validateSnapshotClosure(strategy.snapshot);
  const missing: string[] = [];
  if (strategy.state !== "selected") missing.push("strategy.selected");
  if (strategy.current_revision !== input.currentRevision || strategy.readiness.stale) missing.push("strategy.current_revision");
  if (!strategy.readiness.ready_for_execution || strategy.readiness.needs_review) missing.push(...strategy.readiness.missing_fields, "strategy.review");
  if (!input.market.confirmed || input.market.currency !== pricing.currency) missing.push("market.confirmed");
  const offer = strategy.snapshot.offer;
  if (!offer || offer.stale || !offer.financial_snapshot || offer.pricing_stamp !== pricing.pricing_stamp || offer.policies_stamp !== input.policies.policies_stamp) missing.push("offer.current_pricing_and_policies");
  if (new Set(input.angleIds).size !== input.angleIds.length || input.angleIds.length === 0 || input.kind === "ugc_script" && input.angleIds.length !== 1) missing.push("selected_angle_ids");
  const selectedAngles = input.angleIds.map((id) => strategy.snapshot.angles.find((angle) => angle.id === id));
  if (selectedAngles.some((angle) => !angle)) invalidReference();
  if (input.kind === "ugc_script" && selectedAngles.some((angle) => angle?.generation_guidance?.opening_shot === "real_footage")) missing.push("angle.opening_requires_real_footage");
  const relevantFactIds = new Set(selectedAngles.flatMap((angle) => angle ? [...angle.fact_ids, ...(angle.generation_guidance?.proof_fact_ids ?? [])] : []));
  strategy.snapshot.objections.forEach((objection) => objection.fact_ids.forEach((id) => relevantFactIds.add(id)));
  const restricted = usageRestrictions(input.graph).filter((item) => relevantFactIds.has(item.fact_id));
  if (restricted.length) missing.push("facts.verified_and_approved");
  for (const row of [...input.referenceImages, ...input.pageImages]) if (row.userId !== input.principal.userId || row.productId !== input.productId) invalidReference();
  if (!input.referenceImages.length || !input.referenceImages[0].isBase || input.referenceImages.filter((image) => image.isBase).length !== 1) missing.push("images.base_first");
  if (input.kind === "landing_content" && (!input.pageImages.some((image) => image.slot === "cover") || input.pageImages.filter((image) => image.slot === "gallery").length < GALLERY_MIN)) missing.push("images.selected_cover_and_gallery");
  if (new Set([...input.referenceImages, ...input.pageImages].map((image) => `${image.slot ?? "reference"}:${image.id}`)).size !== input.referenceImages.length + input.pageImages.length) missing.push("images.unique");
  // Toda dependencia congelada debe seguir igual: un readiness antiguo no basta.
  const dependencies: [RecordKind, { id: string; last_revision: number }[]][] = [
    ["persona", [strategy.snapshot.persona]], ["jtbd", [strategy.snapshot.jtbd, ...strategy.snapshot.related_jtbd]], ["pain", [strategy.snapshot.pain, ...strategy.snapshot.related_pains]], ["desire", strategy.snapshot.desires],
    ["angle", strategy.snapshot.angles], ["offer", offer ? [offer] : []], ["Fact", strategy.snapshot.facts],
    ["Source", strategy.snapshot.sources], ["EvidenceLink", strategy.snapshot.evidence_links],
    ["objection", strategy.snapshot.objections], ["customer_language", strategy.snapshot.customer_language],
  ];
  for (const [kind, records] of dependencies) for (const record of records) {
    const current = input.graph[kind].find(({ value }) => value.id === record.id)?.value;
    if (!current || "lifecycle" in current && current.lifecycle !== "active" || current.last_revision !== record.last_revision) missing.push(`${kind}.current_snapshot`);
  }
  if (missing.length) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Revisa el contexto antes de iniciar la generación.", { missing_fields: [...new Set(missing)].slice(0, 100) });
  const approvedFactIds = strategy.snapshot.facts.filter((fact) => !usageRestrictions(input.graph).some((item) => item.fact_id === fact.id) && input.graph.Fact.some(({ value, userId, productId }) => value.id === fact.id && value.last_revision === fact.last_revision && userId === input.principal.userId && productId === input.productId)).map((fact) => fact.id);
  if ([...relevantFactIds].some((id) => !approvedFactIds.includes(id))) throw new ProductIntelligenceError("EXECUTION_NOT_READY", "La evidencia del snapshot necesita revisión.", { missing_fields: ["facts.current_snapshot"] });
  const context = generationContextSchema.parse({
    schema_version: "1.0", product_id: input.productId, strategy_id: strategy.id, analysis_revision: strategy.analysis_revision, request_revision: input.currentRevision, captured_at: input.now.toISOString(),
    product: input.product, market: input.market, policies: input.policies, pricing,
    strategy: strategy.snapshot, reference_images: input.referenceImages.map((image) => ({ id: image.id, is_base: image.isBase, content_hash: image.contentHash })), selected_page_image_ids: input.pageImages.map((image) => image.id), selected_angle_ids: [...input.angleIds], approved_fact_ids: approvedFactIds, blocked_claims: [], image_qa_enabled: input.imageQaEnabled, prompt_versions: input.promptVersions, cost_policy: input.costPolicy,
  });
  jsonBytes(context, PI_LIMITS.inputBytes);
  return { context: structuredClone(context), contextHash: canonicalHash(context) };
}
