import { canonicalHash } from "./concurrency";
import { invalidField, invalidReference } from "./errors";
import { assertNoArchivedSelectionDependencies, authorizeResearchChanges, ReferenceResolver, validateGraph, type IntelligenceGraph, type OwnedRecord, type RecordKind } from "./graph";
import { authorizeTool, checkRevision, type DelegatedGrant, type Principal, type ProductAccess } from "./policy";
import { entityRecordSchemas, type EntityRecords, type FinancialSnapshot, type JsonValue, type Ref, type ToolInputs } from "./schemas";

export interface MutationContext {
  principal: Principal;
  product: ProductAccess;
  grant: DelegatedGrant | null;
  revision: number;
  graph: IntelligenceGraph;
  selectedDependencyIds: readonly string[];
  pricing: FinancialSnapshot | null;
  policiesStamp: string;
  methodologicalNotes: string | null;
  authorizedInternalReferences: ReadonlySet<string>;
  assignId: () => string;
  now: Date;
}
export interface PreparedGraphMutation {
  graph: IntelligenceGraph;
  idMap: Record<string, string>;
  baseRevision: number;
  resultingRevision: number;
  noOp: boolean;
  dryRun: boolean;
  methodologicalNotes: string | null;
}
type Change = { kind: RecordKind; item: Record<string, unknown> };
type Reorder = Extract<ToolInputs["patch_product_analysis"]["operations"][number], { op: "reprioritize" }>;
const referenceKinds: Record<string, RecordKind> = { persona_ref: "persona", angle_ref: "angle", source_ref: "Source", fact_ref: "Fact", jtbd_refs: "jtbd", pain_refs: "pain", desire_refs: "desire", fact_refs: "Fact", objection_refs: "objection", proof_fact_refs: "Fact" };

/** Solo transforma campos de relación tipados; value/internal_ref siguen siendo datos. */
function resolveFields(item: Record<string, unknown>, resolver: ReferenceResolver): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (key === "id" || key === "client_ref") continue;
    const kind = referenceKinds[key];
    if (kind) {
      const name = key.endsWith("_refs") ? `${key.slice(0, -5)}_ids` : `${key.slice(0, -4)}_id`;
      fields[name] = value === null ? null : Array.isArray(value) ? value.map((ref) => resolver.resolve(kind, ref as Ref)) : resolver.resolve(kind, value as Ref);
    } else if (key === "generation_guidance" || key === "frequency" || key === "severity") fields[key] = value === null ? null : resolveFields(value as Record<string, unknown>, resolver);
    else if (key === "evidence") fields[key] = (value as Record<string, unknown>[]).map((entry) => resolveFields(entry, resolver));
    else fields[key] = key === "retrieved_at" && typeof value === "string" ? new Date(value).toISOString() : value;
  }
  return fields;
}

function sameContent(a: EntityRecords[RecordKind], b: EntityRecords[RecordKind]): boolean {
  const strip = (value: EntityRecords[RecordKind]) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "last_revision"));
  return canonicalHash(strip(a) as JsonValue) === canonicalHash(strip(b) as JsonValue);
}

/** No heredar una revisión anterior cuando cambia el contenido o su respaldo. */
function requireExplicitResearchReview(previous: IntelligenceGraph, graph: IntelligenceGraph, changes: Change[]): void {
  const reviewedIds = new Set(previous.Fact.filter(({ value }) => value.verification_status !== "unverified" || value.usage_status !== "pending").map(({ value }) => value.id));
  const affected = new Set<string>();
  for (const { value } of graph.Fact) {
    const before = previous.Fact.find((row) => row.value.id === value.id)?.value;
    if (before && reviewedIds.has(value.id) && !sameContent(before, value)) affected.add(value.id);
  }
  for (const { value } of graph.Source) {
    const before = previous.Source.find((row) => row.value.id === value.id)?.value;
    if (before && !sameContent(before, value)) for (const { value: link } of previous.EvidenceLink) if (link.source_id === value.id && reviewedIds.has(link.fact_id)) affected.add(link.fact_id);
  }
  for (const { value } of graph.EvidenceLink) {
    const before = previous.EvidenceLink.find((row) => row.value.id === value.id)?.value;
    if (!before && value.relation === "contradicts") continue;
    if (!before || !sameContent(before, value)) {
      if (reviewedIds.has(value.fact_id)) affected.add(value.fact_id);
      if (before && reviewedIds.has(before.fact_id)) affected.add(before.fact_id);
    }
  }
  for (const id of affected) if (!changes.some(({ kind, item }) => kind === "Fact" && item.id === id && typeof item.reason === "string" && item.reason.trim())) invalidField("facts.reason", "Incluye el hecho y un motivo explícito para revisar su contenido o respaldo cambiado.");
}

function reprioritize(graph: IntelligenceGraph, kind: RecordKind, changedId: string, requestedPriority: number): void {
  if (kind === "Fact" || kind === "Source" || kind === "EvidenceLink" || kind === "customer_language") return;
  const rows = graph[kind] as OwnedRecord[];
  const changed = rows.find(({ value }) => value.id === changedId)!.value;
  if (!("priority" in changed) || !("lifecycle" in changed)) return;
  const group = "persona_id" in changed ? changed.persona_id : null;
  const siblings = rows.map(({ value }) => value).filter((value) => "priority" in value && "lifecycle" in value && value.lifecycle === "active" && value.id !== changedId && ("persona_id" in value ? value.persona_id : null) === group).sort((a, b) => ("priority" in a ? a.priority : 0) - ("priority" in b ? b.priority : 0) || a.id.localeCompare(b.id));
  if (changed.lifecycle === "active") siblings.splice(Math.min(requestedPriority - 1, siblings.length), 0, changed);
  siblings.forEach((value, index) => { if ("priority" in value) value.priority = index + 1; });
}

function mergeChanges(context: MutationContext, changes: Change[], dryRun: boolean, principal: Principal, methodologicalNotes = context.methodologicalNotes, reorders: Reorder[] = []): PreparedGraphMutation {
  validateGraph(context.graph, principal.userId, context.product.id);
  const graph = structuredClone(context.graph);
  const resolver = new ReferenceResolver(context.graph, principal.userId, context.product.id);
  // Resolver primero todas las identidades permite refs hacia arrays posteriores.
  const identities = changes.map(({ kind, item }) => resolver.register(kind, "id" in item ? { id: item.id as string } : { client_ref: item.client_ref as string }, context.assignId));
  changes.forEach(({ kind, item }, index) => {
    const id = identities[index];
    const collection = graph[kind] as OwnedRecord[];
    const before = collection.find(({ value }) => value.id === id);
    const previousValue = before ? structuredClone(before.value) : null;
    const fields = resolveFields(item, resolver);
    const value: Record<string, unknown> = { ...(before?.value ?? {}), ...fields, id, last_revision: context.revision + 1 };
    if (kind === "offer") {
      const inputItems = (fields.items ?? (before?.value && "items" in before.value ? before.value.items : undefined)) as { units: number; label_proposal: string | null }[] | undefined;
      if (!inputItems) invalidField("offer.items", "Define los packs de la oferta nueva.");
      value.items = inputItems.map((entry) => {
        const pack = context.pricing?.packs.find((pack) => pack.units === entry.units);
        return { units: entry.units, label_proposal: entry.label_proposal, price_minor: pack?.price_minor ?? null, approved_label: pack?.approved_label ?? null };
      });
      value.financial_snapshot = context.pricing;
      value.pricing_stamp = context.pricing?.pricing_stamp ?? null;
      value.policies_stamp = context.policiesStamp;
      value.stale = false;
    }
    if (kind !== "Source" && kind !== "Fact" && kind !== "EvidenceLink") {
      value.lifecycle ??= "active";
      value.archived_reason ??= null;
      if (["persona", "jtbd", "pain", "desire", "objection", "angle"].includes(kind)) value.evidence ??= [];
    }
    if (before && "generation_guidance" in before.value && fields.generation_guidance && typeof fields.generation_guidance === "object") value.generation_guidance = { ...(before.value.generation_guidance ?? {}), ...fields.generation_guidance };
    // Nullable omitido en create se hace explícito en el DTO persistido.
    for (const [name, schema] of Object.entries(entityRecordSchemas[kind].shape)) if (!(name in value) && schema.safeParse(null).success) value[name] = null;
    const parsed = entityRecordSchemas[kind].safeParse(value);
    if (!parsed.success) invalidField(kind, "Completa los campos requeridos del registro nuevo o corregido.");
    if (before) before.value = parsed.data;
    else collection.push({ userId: principal.userId, productId: context.product.id, value: parsed.data });
    if ("priority" in parsed.data && (item.priority !== undefined || item.lifecycle !== undefined || item.persona_ref !== undefined)) {
      reprioritize(graph, kind, id, parsed.data.priority);
      if (previousValue && "persona_id" in previousValue && "persona_id" in parsed.data && previousValue.persona_id !== parsed.data.persona_id) {
        const siblings = collection.map(({ value }) => value).filter((value) => "persona_id" in value && value.persona_id === previousValue.persona_id && "lifecycle" in value && value.lifecycle === "active" && "priority" in value).sort((a, b) => ("priority" in a ? a.priority : 0) - ("priority" in b ? b.priority : 0) || a.id.localeCompare(b.id));
        siblings.forEach((value, index) => { if ("priority" in value) value.priority = index + 1; });
      }
    }
  });
  const orderedGroups = new Set<string>();
  const directlyChangedIds = new Set(changes.flatMap(({ item }) => typeof item.id === "string" ? [item.id] : []));
  for (const order of reorders) {
    const groupKey = `${order.entity}:${order.persona_id ?? "product"}`;
    if (orderedGroups.has(groupKey)) invalidField("operations", "Reordena cada conjunto una sola vez por batch.");
    orderedGroups.add(groupKey);
    if (order.ordered_ids.some((id) => directlyChangedIds.has(id))) invalidField("operations", "No repitas un ID entre una operación individual y un reordenamiento.");
    if (["persona", "offer"].includes(order.entity) ? order.persona_id !== null : order.persona_id === null) invalidField("operations.persona_id", "Indica la persona del conjunto, o null para personas y ofertas.");
    const rows = graph[order.entity].filter(({ value }) => value.lifecycle === "active" && ("persona_id" in value ? value.persona_id : null) === order.persona_id);
    if (rows.length !== order.ordered_ids.length || rows.some(({ value }) => !order.ordered_ids.includes(value.id))) invalidField("operations.ordered_ids", "Incluye todos los IDs activos del conjunto, sin otros IDs.");
    rows.forEach(({ value }) => { if ("priority" in value) value.priority = order.ordered_ids.indexOf(value.id) + 1; });
  }
  // Reindexar puede modificar también filas omitidas; solo cambia last_revision si cambia contenido.
  let noOp = methodologicalNotes === context.methodologicalNotes;
  for (const kind of Object.keys(graph) as RecordKind[]) for (const row of graph[kind]) {
    const before = context.graph[kind].find((previous) => previous.value.id === row.value.id);
    const changed = !before || !sameContent(before.value, row.value);
    row.value.last_revision = changed ? context.revision + 1 : before.value.last_revision;
    if (changed) noOp = false;
  }
  for (const { value: source } of graph.Source) if (source.internal_ref && !context.authorizedInternalReferences.has(`${source.internal_ref.kind}:${source.internal_ref.id}`)) invalidReference();
  authorizeResearchChanges(principal, context.graph, graph);
  requireExplicitResearchReview(context.graph, graph, changes);
  assertNoArchivedSelectionDependencies(graph, context.selectedDependencyIds);
  validateGraph(graph, principal.userId, context.product.id);
  return { graph, idMap: dryRun ? {} : resolver.idMap(), baseRevision: context.revision, resultingRevision: noOp || dryRun ? context.revision : context.revision + 1, noOp, dryRun, methodologicalNotes };
}

export function prepareAnalysisMutation(context: MutationContext, input: ToolInputs["save_product_analysis"]): PreparedGraphMutation {
  const principal = authorizeTool(context.principal, context.product, "save_product_analysis", input, context.grant, context.now);
  checkRevision(input.expected_revision, context.revision);
  const pluralKinds = { personas: "persona", jtbd: "jtbd", pains: "pain", desires: "desire", objections: "objection", angles: "angle", customer_language: "customer_language" } as const;
  const changes: Change[] = Object.entries(input.analysis).flatMap(([collection, items]) => (items ?? []).map((item) => ({ kind: pluralKinds[collection as keyof typeof pluralKinds], item: item as Record<string, unknown> })));
  if (input.offer) changes.push({ kind: "offer", item: input.offer });
  return mergeChanges(context, changes, input.dry_run, principal, input.methodological_notes === undefined ? context.methodologicalNotes : input.methodological_notes);
}

export function prepareResearchMutation(context: MutationContext, input: ToolInputs["save_research"]): PreparedGraphMutation {
  const principal = authorizeTool(context.principal, context.product, "save_research", input, context.grant, context.now);
  checkRevision(input.expected_revision, context.revision);
  const changes: Change[] = [
    ...(input.sources ?? []).map((item): Change => ({ kind: "Source", item })),
    ...(input.facts ?? []).map((item): Change => ({ kind: "Fact", item })),
    ...(input.evidence_links ?? []).map((item): Change => ({ kind: "EvidenceLink", item })),
  ];
  return mergeChanges(context, changes, input.dry_run, principal);
}

/** Un batch produce un único grafo candidato. El repositorio lo confirma con CAS. */
export function preparePatchMutation(context: MutationContext, input: ToolInputs["patch_product_analysis"]): PreparedGraphMutation {
  const principal = authorizeTool(context.principal, context.product, "patch_product_analysis", input, context.grant, context.now);
  checkRevision(input.expected_revision, context.revision);
  const changes: Change[] = [];
  const reorders: Reorder[] = [];
  for (const operation of input.operations) {
    if (operation.op === "reprioritize") { reorders.push(operation); continue; }
    if (operation.op === "create") changes.push({ kind: operation.entity, item: { ...operation.payload, client_ref: operation.client_ref } });
    else if (operation.op === "update") changes.push({ kind: operation.entity, item: { ...operation.changes, id: operation.id } });
    else changes.push({ kind: operation.entity, item: { id: operation.id, lifecycle: operation.op === "archive" ? "archived" : "active", archived_reason: operation.op === "archive" ? operation.reason : null } });
  }
  return mergeChanges(context, changes, input.dry_run, principal, context.methodologicalNotes, reorders);
}
