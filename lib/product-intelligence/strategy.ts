import { invalidField, invalidReference } from "./errors";
import { validateGraph, validateStrategyChoice, type IntelligenceGraph, type RecordKind } from "./graph";
import { strategySnapshotSchema, type EntityRecords, type ToolInputs } from "./schemas";
import { jsonBytes, PI_LIMITS } from "./validation";

type Choice = Exclude<ToolInputs["set_product_strategy"], { action: "archive" }>;
export type StrategySnapshot = ReturnType<typeof strategySnapshotSchema.parse>;

/** Cierre completo de la decisión. Sin loader legacy, prioridades implícitas ni I/O. */
export function buildStrategySnapshot(graph: IntelligenceGraph, userId: string, productId: string, choice: Choice): StrategySnapshot {
  validateGraph(graph, userId, productId);
  validateStrategyChoice(graph, choice);
  const get = <K extends RecordKind>(kind: K, id: string): EntityRecords[K] => {
    const value = graph[kind].find((row) => row.value.id === id)?.value;
    if (!value) invalidReference();
    return structuredClone(value);
  };
  const persona = get("persona", choice.primary_persona_id);
  const jtbd = get("jtbd", choice.primary_jtbd_id);
  const pain = get("pain", choice.primary_pain_id);
  const angles = [choice.primary_angle_id, ...choice.secondary_angle_ids].map((id) => get("angle", id));
  const relatedJtbdIds = new Set(angles.flatMap((angle) => angle.jtbd_ids).filter((id) => id !== jtbd.id));
  const relatedPainIds = new Set(angles.flatMap((angle) => angle.pain_ids).filter((id) => id !== pain.id));
  const related_jtbd = [...relatedJtbdIds].sort().map((id) => get("jtbd", id));
  const related_pains = [...relatedPainIds].sort().map((id) => get("pain", id));
  const desires = [...new Set(angles.flatMap((angle) => angle.desire_ids))].sort().map((id) => get("desire", id));
  const objections = graph.objection.filter(({ value }) => value.persona_id === persona.id && value.lifecycle === "active").map(({ value }) => structuredClone(value)).sort((a, b) => a.priority - b.priority);
  const customer_language = graph.customer_language.filter(({ value }) => value.persona_id === persona.id && value.lifecycle === "active" && (!value.angle_id || angles.some((angle) => angle.id === value.angle_id))).map(({ value }) => structuredClone(value)).sort((a, b) => a.id.localeCompare(b.id));
  const factIds = new Set([...angles.flatMap((angle) => [...angle.fact_ids, ...(angle.generation_guidance?.proof_fact_ids ?? [])]), ...objections.flatMap((objection) => objection.fact_ids)]);
  const facts = [...factIds].sort().map((id) => get("Fact", id));
  const evidence_links = graph.EvidenceLink.filter(({ value }) => factIds.has(value.fact_id)).map(({ value }) => structuredClone(value)).sort((a, b) => a.id.localeCompare(b.id));
  const analytical = [persona, jtbd, pain, ...related_jtbd, ...related_pains, ...desires, ...angles, ...objections];
  const sourceIds = new Set([...analytical.flatMap((item) => item.evidence.map((evidence) => evidence.source_id)), ...evidence_links.map((link) => link.source_id), ...customer_language.flatMap((language) => language.source_id ? [language.source_id] : [])]);
  for (const item of [pain, ...related_pains]) for (const magnitude of [item.frequency, item.severity]) if (magnitude?.source_id) sourceIds.add(magnitude.source_id);
  const parsed = strategySnapshotSchema.safeParse({ persona, jtbd, pain, related_jtbd, related_pains, desires, angles, offer: choice.offer_id ? get("offer", choice.offer_id) : null, facts, sources: [...sourceIds].sort().map((id) => get("Source", id)), evidence_links, objections, customer_language, positioning: choice.positioning, rationale: choice.rationale });
  if (!parsed.success) invalidField("strategy.snapshot", "El cierre de la estrategia supera sus límites o está incompleto. Revisa las dependencias seleccionadas.");
  const snapshot = parsed.data;
  jsonBytes(snapshot, PI_LIMITS.inputBytes);
  validateSnapshotClosure(snapshot);
  return snapshot;
}

/** Rechaza un snapshot con referencias faltantes en vez de completarlo con latest. */
export function validateSnapshotClosure(snapshot: StrategySnapshot): void {
  const collections = {
    persona: [snapshot.persona], jtbd: [snapshot.jtbd, ...snapshot.related_jtbd], pain: [snapshot.pain, ...snapshot.related_pains], desire: snapshot.desires,
    angle: snapshot.angles, objection: snapshot.objections, Fact: snapshot.facts, Source: snapshot.sources, EvidenceLink: snapshot.evidence_links,
    customer_language: snapshot.customer_language, offer: snapshot.offer ? [snapshot.offer] : [],
  };
  const allIds = Object.values(collections).flatMap((rows) => rows.map((row) => row.id));
  if (new Set(allIds).size !== allIds.length) invalidField("strategy.snapshot", "El snapshot tiene identidades duplicadas.");
  const contains = (kind: keyof typeof collections, id: string) => { if (!collections[kind].some((row) => row.id === id)) invalidReference(); };
  for (const row of [...collections.jtbd, ...collections.pain, ...snapshot.desires, ...snapshot.angles, ...snapshot.objections, ...snapshot.customer_language]) contains("persona", row.persona_id);
  for (const angle of snapshot.angles) {
    angle.jtbd_ids.forEach((id) => contains("jtbd", id)); angle.pain_ids.forEach((id) => contains("pain", id)); angle.desire_ids.forEach((id) => contains("desire", id));
    [...angle.fact_ids, ...(angle.generation_guidance?.proof_fact_ids ?? [])].forEach((id) => contains("Fact", id));
    angle.generation_guidance?.objection_ids?.forEach((id) => contains("objection", id));
  }
  for (const objection of snapshot.objections) objection.fact_ids.forEach((id) => contains("Fact", id));
  for (const link of snapshot.evidence_links) { contains("Fact", link.fact_id); contains("Source", link.source_id); }
  for (const row of [snapshot.persona, ...collections.jtbd, ...collections.pain, ...snapshot.desires, ...snapshot.angles, ...snapshot.objections]) row.evidence.forEach((evidence) => contains("Source", evidence.source_id));
  for (const pain of collections.pain) for (const magnitude of [pain.frequency, pain.severity]) if (magnitude?.source_id) contains("Source", magnitude.source_id);
  for (const language of snapshot.customer_language) { if (language.source_id) contains("Source", language.source_id); if (language.angle_id) contains("angle", language.angle_id); }
}
