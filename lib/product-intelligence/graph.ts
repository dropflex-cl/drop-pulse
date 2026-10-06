import { invalidField, invalidReference, ProductIntelligenceError } from "./errors";
import { requireScopes, type Principal } from "./policy";
import { entityRecordSchemas, type EntityName, type EntityRecords, type Ref, type ToolInputs } from "./schemas";
import { jsonBytes, PI_LIMITS, validateFactValues } from "./validation";
import { canonicalHash } from "./concurrency";
import type { JsonValue } from "./schemas";

export type RecordKind = keyof EntityRecords;
export type OwnedRecord<K extends RecordKind = RecordKind> = { userId: string; productId: string; value: EntityRecords[K] };
export type IntelligenceGraph = { [K in RecordKind]: OwnedRecord<K>[] };
export const emptyGraph = (): IntelligenceGraph => ({ persona: [], jtbd: [], pain: [], desire: [], objection: [], angle: [], customer_language: [], offer: [], Source: [], Fact: [], EvidenceLink: [] });

export function validateGraph(graph: IntelligenceGraph, userId: string, productId: string): void {
  const globallySeen = new Set<string>();
  for (const kind of Object.keys(entityRecordSchemas) as RecordKind[]) {
    for (const row of graph[kind]) {
      if (row.userId !== userId || row.productId !== productId) invalidReference();
      jsonBytes(row.value, PI_LIMITS.inputBytes);
      if (kind === "Fact") validateFactValues(row.value);
      if (!entityRecordSchemas[kind].safeParse(row.value).success) invalidField(kind, "Un registro no cumple su esquema de dominio.");
      if (globallySeen.has(row.value.id)) invalidField(kind, "Un ID aparece repetido en el grafo.");
      globallySeen.add(row.value.id);
    }
  }
  function get<K extends RecordKind>(kind: K, id: string, active: boolean): EntityRecords[K] {
    const row = graph[kind].find((item) => item.value.id === id)?.value;
    if (!row || (active && "lifecycle" in row && row.lifecycle !== "active")) invalidReference();
    return row;
  }
  function samePersona(kind: "jtbd" | "pain" | "desire" | "objection", ids: readonly string[], personaId: string, active: boolean) {
    if (new Set(ids).size !== ids.length) invalidField(kind, "No repitas referencias.");
    for (const id of ids) if (get(kind, id, active).persona_id !== personaId) invalidReference();
  }
  for (const { value: source } of graph.Source) {
    if ((source.url === null) === (source.internal_ref === null)) invalidField("sources", "Cada fuente necesita una URL o una referencia interna, solo una.");
  }
  const evidenceIdentities = new Set<string>();
  for (const { value: link } of graph.EvidenceLink) {
    const identity = canonicalHash([link.fact_id, link.source_id, link.relation, link.fragment]);
    if (evidenceIdentities.has(identity)) invalidField("evidence_links", "No repitas el mismo enlace de evidencia.");
    evidenceIdentities.add(identity);
    get("Fact", link.fact_id, false);
    const source = get("Source", link.source_id, false);
    if (!source.excerpt.includes(link.fragment)) invalidField("evidence_links.fragment", "El fragmento debe estar en el excerpt de su fuente.");
  }
  for (const { value: fact } of graph.Fact) {
    const evidence = graph.EvidenceLink.filter((row) => row.value.fact_id === fact.id);
    if ((fact.verification_status !== "unverified" || fact.usage_status !== "pending") && !fact.reason?.trim()) invalidField("facts.reason", "Documenta el motivo de la revisión del hecho.");
    if (fact.verification_status === "verified" && !evidence.some((row) => row.value.relation === "supports")) invalidField("facts.verification_status", "Verificar un hecho requiere evidencia que lo respalde.");
    if (fact.usage_status === "approved" && fact.verification_status !== "verified") invalidField("facts.usage_status", "Aprueba para uso solo hechos verificados y sin disputa.");
  }
  for (const kind of ["persona", "jtbd", "pain", "desire", "objection", "angle"] as const) {
    for (const { value: item } of graph[kind]) {
      const active = item.lifecycle === "active";
      if ("persona_id" in item) get("persona", item.persona_id, active);
      if (item.epistemic_status !== "hypothesis" && !item.evidence.length) invalidField(`${kind}.evidence`, "Un dato observado necesita evidencia.");
      if (item.epistemic_status === "validated" && !item.validation_note?.trim()) invalidField(`${kind}.validation_note`, "Documenta cómo validaste esta hipótesis.");
      for (const evidence of item.evidence) {
        const source = get("Source", evidence.source_id, false);
        if (!source.excerpt.includes(evidence.fragment)) invalidField(`${kind}.evidence.fragment`, "El fragmento debe estar en el excerpt de su fuente.");
      }
      if ("fact_ids" in item) {
        if (new Set(item.fact_ids).size !== item.fact_ids.length) invalidField(`${kind}.fact_ids`, "No repitas hechos relacionados.");
        item.fact_ids.forEach((id) => get("Fact", id, false));
      }
      if (kind === "pain") {
        const pain = item as EntityRecords["pain"];
        for (const magnitude of [pain.frequency, pain.severity]) if (magnitude?.basis_type === "observed") {
          if (!magnitude.source_id) invalidField("pain.frequency", "Una frecuencia o severidad observada necesita fuente.");
          get("Source", magnitude.source_id, false);
        }
      }
    }
  }
  for (const { value: angle } of graph.angle) {
    const active = angle.lifecycle === "active";
    samePersona("jtbd", angle.jtbd_ids, angle.persona_id, active);
    samePersona("pain", angle.pain_ids, angle.persona_id, active);
    samePersona("desire", angle.desire_ids, angle.persona_id, active);
    if (angle.generation_guidance) {
      samePersona("objection", angle.generation_guidance.objection_ids ?? [], angle.persona_id, active);
      (angle.generation_guidance.proof_fact_ids ?? []).forEach((id) => get("Fact", id, false));
    }
  }
  for (const { value: language } of graph.customer_language) {
    const active = language.lifecycle === "active";
    get("persona", language.persona_id, active);
    if (language.angle_id && get("angle", language.angle_id, active).persona_id !== language.persona_id) invalidReference();
    if (language.origin === "observed") {
      if (!language.source_id) invalidField("customer_language.source_id", "El lenguaje observado necesita una fuente.");
      get("Source", language.source_id, false);
    } else if (language.type === "customer_quote" || language.source_id) invalidField("customer_language.origin", "Una reseña observada no puede ser texto sintético.");
  }
  for (const { value: offer } of graph.offer) {
    if (new Set(offer.items.map((item) => item.units)).size !== offer.items.length) invalidField("offer.items", "No repitas cantidades en los packs.");
    if (offer.financial_snapshot) {
      const prices = offer.financial_snapshot;
      if (prices.pricing_stamp !== offer.pricing_stamp) invalidField("offer.pricing_stamp", "La oferta no corresponde al plan calculado.");
      if (new Set(prices.packs.map((pack) => pack.units)).size !== 3 || prices.packs.filter((pack) => pack.recommended).length !== 1) invalidField("offer.financial_snapshot", "El plan necesita los tres packs y una recomendación.");
      for (const item of offer.items) {
        const pack = prices.packs.find((pack) => pack.units === item.units);
        if (!pack || item.price_minor !== pack.price_minor || item.approved_label !== pack.approved_label) invalidField("offer.items", "El precio y la etiqueta aprobada salen del plan del servidor.");
      }
    } else if (offer.items.some((item) => item.price_minor !== null || item.approved_label !== null)) invalidField("offer.items", "Una oferta sin plan no puede anunciar precios ni etiquetas aprobadas.");
  }
  validatePriorities(graph);
}

export function validatePriorities(graph: IntelligenceGraph): void {
  for (const kind of ["persona", "jtbd", "pain", "desire", "objection", "angle", "offer"] as const) {
    const groups = new Map<string, number[]>();
    for (const { value } of graph[kind]) if (value.lifecycle === "active") {
      const group = "persona_id" in value ? value.persona_id : "product";
      groups.set(group, [...(groups.get(group) ?? []), value.priority]);
    }
    for (const priorities of groups.values()) if (priorities.sort((a, b) => a - b).some((value, i) => value !== i + 1)) invalidField(`${kind}.priority`, "Las prioridades deben ser contiguas y sin duplicados.");
  }
}

export function usageRestrictions(graph: IntelligenceGraph): { fact_id: string; reason: string }[] {
  return graph.Fact.flatMap(({ value: fact }) => {
    const contradicted = graph.EvidenceLink.some(({ value }) => value.fact_id === fact.id && value.relation === "contradicts");
    if (fact.verification_status !== "verified" || fact.usage_status !== "approved" || contradicted) return [{ fact_id: fact.id, reason: contradicted ? "Existe evidencia contradictoria pendiente de resolución." : "El hecho no está verificado y aprobado para uso." }];
    return [];
  });
}

/** Validar cambios sensibles contra el estado anterior, no solo lo que declara el payload. */
export function authorizeResearchChanges(principal: Principal, previous: IntelligenceGraph, next: IntelligenceGraph): void {
  const byId = <K extends RecordKind>(kind: K, id: string) => previous[kind].find(({ value }) => value.id === id)?.value;
  const content = (value: object) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "last_revision")) as JsonValue;
  const changed = (a: object, b: object) => canonicalHash(content(a)) !== canonicalHash(content(b));
  const reviewed = (fact: EntityRecords["Fact"]) => fact.verification_status !== "unverified" || fact.usage_status !== "pending";
  let sensitive = false;
  for (const { value: fact } of next.Fact) {
    const before = byId("Fact", fact.id);
    if ((!before && reviewed(fact)) || (before && changed(before, fact) && (reviewed(before) || reviewed(fact)))) sensitive = true;
  }
  const reviewedFactIds = new Set(previous.Fact.filter(({ value }) => reviewed(value)).map(({ value }) => value.id));
  for (const { value: link } of next.EvidenceLink) {
    const before = byId("EvidenceLink", link.id);
    // Aportar nueva contradicción se permite; editar respaldo revisado exige verify.
    if ((!before && reviewedFactIds.has(link.fact_id) && link.relation !== "contradicts") || (before && changed(before, link) && (reviewedFactIds.has(before.fact_id) || reviewedFactIds.has(link.fact_id)))) sensitive = true;
  }
  const reviewedSourceIds = new Set(previous.EvidenceLink.filter(({ value }) => reviewedFactIds.has(value.fact_id)).map(({ value }) => value.source_id));
  if (previous.Fact.some(({ value }) => reviewed(value) && !next.Fact.some((row) => row.value.id === value.id)) || previous.EvidenceLink.some(({ value }) => reviewedFactIds.has(value.fact_id) && !next.EvidenceLink.some((row) => row.value.id === value.id)) || previous.Source.some(({ value }) => reviewedSourceIds.has(value.id) && !next.Source.some((row) => row.value.id === value.id))) sensitive = true;
  for (const { value: source } of next.Source) {
    const before = byId("Source", source.id);
    if (before && reviewedSourceIds.has(source.id) && changed(before, source)) sensitive = true;
  }
  if (sensitive) requireScopes(principal, ["product_intelligence:verify"]);
}

export function validateStrategyChoice(graph: IntelligenceGraph, input: Exclude<ToolInputs["set_product_strategy"], { action: "archive" }>): void {
  const get = <K extends EntityName>(kind: K, id: string) => {
    const row = graph[kind].find(({ value }) => value.id === id)?.value;
    if (!row || row.lifecycle !== "active") invalidReference();
    return row;
  };
  const persona = get("persona", input.primary_persona_id);
  const jtbd = get("jtbd", input.primary_jtbd_id);
  const pain = get("pain", input.primary_pain_id);
  const angle = get("angle", input.primary_angle_id);
  if (jtbd.persona_id !== persona.id || pain.persona_id !== persona.id || angle.persona_id !== persona.id || !angle.jtbd_ids.includes(jtbd.id) || !angle.pain_ids.includes(pain.id)) invalidReference();
  if (input.secondary_angle_ids.includes(angle.id)) invalidField("secondary_angle_ids", "El ángulo principal no se repite como secundario.");
  input.secondary_angle_ids.forEach((id) => { if (get("angle", id).persona_id !== persona.id) invalidReference(); });
  if (input.offer_id) get("offer", input.offer_id);
}

/** Dependencias usadas por una selección: no confundirlas con todos los registros del producto. */
export function assertNoArchivedSelectionDependencies(graph: IntelligenceGraph, selectedIds: readonly string[]): void {
  const selected = new Set(selectedIds);
  for (const kind of Object.keys(graph) as RecordKind[]) for (const { value } of graph[kind]) if (selected.has(value.id) && "lifecycle" in value && value.lifecycle === "archived") throw new ProductIntelligenceError("DEPENDENCY_IN_USE", "Esta entidad pertenece a la estrategia seleccionada. Sustituye o archiva la selección primero.");
}

export class ReferenceResolver {
  private readonly locals = new Map<string, { kind: RecordKind; id: string }>();
  private readonly touched = new Set<string>();
  constructor(private readonly graph: IntelligenceGraph, private readonly userId: string, private readonly productId: string) {}

  register(kind: RecordKind, identity: Ref, assignId: () => string): string {
    if ("id" in identity) {
      const key = `${kind}:${identity.id}`;
      if (this.touched.has(key)) invalidField("id", "No repitas operaciones sobre el mismo ID.");
      this.resolve(kind, identity);
      this.touched.add(key);
      return identity.id;
    }
    if (this.locals.has(identity.client_ref)) invalidField("client_ref", "Cada client_ref debe ser única en la llamada.");
    const id = assignId();
    if (Object.values(this.graph).some((rows) => rows.some(({ value }) => value.id === id)) || [...this.locals.values()].some((item) => item.id === id)) invalidField("id", "No se pudo asignar una identidad nueva.");
    this.locals.set(identity.client_ref, { kind, id });
    return id;
  }

  resolve(kind: RecordKind, reference: Ref): string {
    if ("client_ref" in reference) {
      const local = this.locals.get(reference.client_ref);
      if (!local || local.kind !== kind) invalidReference();
      return local.id;
    }
    const row = this.graph[kind].find(({ value }) => value.id === reference.id);
    if (!row || row.userId !== this.userId || row.productId !== this.productId) invalidReference();
    return reference.id;
  }

  idMap(): Record<string, string> { return Object.fromEntries([...this.locals].map(([key, item]) => [key, item.id])); }
}
