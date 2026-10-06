import { z } from "zod";
import { canonicalHash } from "./concurrency";
import { contextPricing, parseContextRead, type ContextRead } from "./context";
import { ProductIntelligenceError } from "./errors";
import { emptyGraph, usageRestrictions, validateGraph, type IntelligenceGraph, type RecordKind } from "./graph";
import type { PreparedGraphMutation, MutationContext } from "./mutations";
import { checkRevision, PI_SCOPES, type Principal } from "./policy";
import { buildStrategySnapshot, validateSnapshotClosure } from "./strategy";
import { entityRecordSchemas, strategySnapshotSchema, type JsonValue, type Strategy, type ToolInputs, type ToolOutputs } from "./schemas";
import { jsonBytes } from "./validation";

const graphSchema = z.strictObject(Object.fromEntries(Object.entries(entityRecordSchemas).map(([kind, schema]) => [kind, z.array(schema).max(1000)])));
const versionSchema = z.strictObject({ id: z.uuid(), state: z.enum(["draft", "selected", "superseded", "archived"]),
  analysis_revision: z.number().int().nonnegative().safe(), selection_revision: z.number().int().positive().safe().nullable(),
  snapshot: strategySnapshotSchema, operational_hash: z.string().regex(/^[a-f0-9]{64}$/) });
export type StoredStrategy = z.infer<typeof versionSchema>;
const knowledgeSchema = z.strictObject({ graph: graphSchema, methodological_notes: z.string().max(8192).nullable(), active_strategy_id: z.uuid().nullable(), strategy: versionSchema.nullable() });
export interface KnowledgeRead extends ContextRead {
  currentSnapshot: ContextRead["snapshot"]; currentActiveStrategyId: string | null;
  graph: IntelligenceGraph; currentGraph: IntelligenceGraph; methodologicalNotes: string | null;
  activeStrategyId: string | null; strategy: StoredStrategy | null; requestedStrategy: StoredStrategy | null;
  effectiveScopes: Principal["scopes"]; grantExpiresAt: string; internalReferences: Set<string>;
}
function ownedGraph(raw: z.infer<typeof graphSchema>, principal: Principal, productId: string): IntelligenceGraph {
  const graph = emptyGraph();
  const add = <K extends RecordKind>(kind: K) => { graph[kind] = (raw[kind] as IntelligenceGraph[K][number]["value"][]).map((value) => ({ userId: principal.userId, productId, value })) as IntelligenceGraph[K]; };
  (Object.keys(entityRecordSchemas) as RecordKind[]).forEach(add);
  validateGraph(graph, principal.userId, productId);
  return graph;
}
export function parseKnowledgeRead(raw: unknown, principal: Principal, productId: string): KnowledgeRead {
  const context = parseContextRead(raw);
  const envelope = z.object({ snapshot: z.object({ knowledge: knowledgeSchema.optional() }), current_snapshot: z.unknown(), current_knowledge: knowledgeSchema,
    requested_strategy: versionSchema.nullable(), effective_scopes: z.array(z.enum(PI_SCOPES)), grant_expires_at: z.iso.datetime({ offset: true }), internal_references: z.array(z.string()) }).safeParse(raw);
  if (!envelope.success) throw new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer el conocimiento guardado.");
  // Snapshots anteriores a esta migración no contienen conocimiento; nunca rellenarlos con el presente.
  const current = envelope.data.current_knowledge, knowledge = envelope.data.snapshot.knowledge;
  const graph = knowledge ? ownedGraph(knowledge.graph, principal, productId) : emptyGraph();
  const live = parseContextRead({ ...raw as Record<string, unknown>, snapshot: envelope.data.current_snapshot });
  return { ...context, currentSnapshot: live.snapshot, currentActiveStrategyId: current.active_strategy_id, graph, currentGraph: ownedGraph(current.graph, principal, productId), methodologicalNotes: knowledge?.methodological_notes ?? null,
    activeStrategyId: knowledge?.active_strategy_id ?? null, strategy: knowledge?.strategy ?? null, requestedStrategy: envelope.data.requested_strategy,
    effectiveScopes: envelope.data.effective_scopes, grantExpiresAt: envelope.data.grant_expires_at, internalReferences: new Set(envelope.data.internal_references) };
}
export function graphRecords(graph: IntelligenceGraph) { return Object.fromEntries(Object.entries(graph).map(([kind, rows]) => [kind, rows.map((row) => row.value)])); }
export function strategyDependencies(snapshot: StoredStrategy["snapshot"]): string[] {
  return Object.values(snapshot).flatMap((value) => Array.isArray(value) ? value.flatMap((row) => typeof row === "object" && row && "id" in row ? [row.id as string] : []) : typeof value === "object" && value && "id" in value ? [value.id as string] : []);
}
export function mutationContext(read: KnowledgeRead, principal: Principal, productId: string, assignId: () => string): MutationContext {
  const pricing = contextPricing(read.snapshot);
  return { principal: { ...principal, scopes: principal.scopes.filter((scope) => read.effectiveScopes.includes(scope)) }, product: { id: productId, userId: principal.userId, deleting: false },
    grant: principal.actorKind === "delegated" ? { userId: principal.userId, actorId: principal.actorId, clientId: principal.clientId!, productId: null,
      scopes: read.effectiveScopes, expiresAt: read.grantExpiresAt, revoked: false } : null,
    revision: read.current_revision, graph: read.graph, selectedDependencyIds: read.strategy?.state === "selected" ? strategyDependencies(read.strategy.snapshot) : [],
    pricing: pricing?.currency === read.snapshot.catalog.currency ? pricing : null,
    policiesStamp: canonicalHash(read.snapshot.settings as JsonValue), methodologicalNotes: read.methodologicalNotes,
    authorizedInternalReferences: read.internalReferences, assignId, now: new Date() };
}
const diffNames = { Source: "source", Fact: "fact", EvidenceLink: "evidence_link" } as const;
export function graphMutationResult(read: KnowledgeRead, prepared: PreparedGraphMutation, productId: string, requestId: string, pricing: MutationContext["pricing"]): ToolOutputs["save_product_analysis"] {
  type Diff = Extract<ToolOutputs["save_product_analysis"], { ok: true }>["data"]["diff"][number];
  const diff: Diff[] = [];
  for (const kind of Object.keys(entityRecordSchemas) as RecordKind[]) for (const { value } of prepared.graph[kind]) {
    const before = read.graph[kind].find((row) => row.value.id === value.id)?.value;
    if (before && before.last_revision === value.last_revision) continue;
    const old = before as unknown as Record<string, JsonValue> | undefined, next = value as unknown as Record<string, JsonValue>;
    const changed = Object.keys(next).filter((field) => field !== "id" && field !== "last_revision" && canonicalHash(old?.[field] ?? null) !== canonicalHash(next[field]));
    diff.push({ entity: kind in diffNames ? diffNames[kind as keyof typeof diffNames] : kind as Diff["entity"],
      action: !before ? "create" : "lifecycle" in value && value.lifecycle !== (before as { lifecycle?: string }).lifecycle ? value.lifecycle === "active" ? "restore" : "archive" : changed.length === 1 && changed[0] === "priority" ? "reprioritize" : "update",
      id: prepared.dryRun && !before ? null : value.id, client_ref: Object.entries(prepared.idMap).find(([, id]) => id === value.id)?.[0] ?? null, changed_fields: changed });
  }
  if (read.methodologicalNotes !== prepared.methodologicalNotes) diff.push({ entity: "context", action: "update", id: null, client_ref: null, changed_fields: ["methodological_notes"] });
  return { ok: true, product_id: productId, request_id: requestId, revision: prepared.resultingRevision, warnings: [], data: {
    applied: !prepared.noOp && !prepared.dryRun, dry_run: prepared.dryRun, no_op: prepared.noOp, base_revision: read.current_revision,
    id_map: prepared.idMap, diff: diff.slice(0, 100), diff_truncated: diff.length > 100, pricing } };
}
/** No considerar stale solo porque aumentó la revisión al seleccionar o editar otra hipótesis. */
export function operationalHash(read: ContextRead): string {
  const { last_revision: ignored, ...context } = read.snapshot.context ?? {}; void ignored;
  return canonicalHash({ ...read.snapshot, context, pack_labels: read.snapshot.pack_labels ?? null } as JsonValue);
}
export function strategyResponse(version: StoredStrategy, read: KnowledgeRead, productId: string, include: "core" | "execution" = "execution"): Strategy {
  validateSnapshotClosure(version.snapshot);
  const snapshot = structuredClone(version.snapshot);
  const current = new Map(Object.values(read.currentGraph).flatMap((rows) => rows.map(({ value }) => [value.id, value] as const)));
  const stale = version.operational_hash !== operationalHash({ ...read, snapshot: read.currentSnapshot }) || strategyDependencies(snapshot).some((id) => {
    const frozen = (Object.values(snapshot) as unknown[]).flatMap((v): unknown[] => Array.isArray(v) ? v : typeof v === "object" && v ? [v] : []).find((v) => typeof v === "object" && v && "id" in v && v.id === id) as { last_revision?: number } | undefined;
    return !current.has(id) || current.get(id)!.last_revision !== frozen?.last_revision;
  });
  const restrictions = usageRestrictions(read.currentGraph).filter((r) => snapshot.facts.some((f) => f.id === r.fact_id));
  const needsReview = restrictions.length > 0 || strategyDependencies(snapshot).some((id) => { const v = current.get(id); return !!v && "lifecycle" in v && v.lifecycle !== "active"; });
  const state = read.currentSnapshot, pricing = contextPricing(state), offer = snapshot.offer;
  const missing = [
    ...(version.state !== "selected" || read.currentActiveStrategyId !== version.id ? ["strategy.selected"] : []), ...(!state.context ? ["context"] : []),
    ...(state.catalog.is_upsell ? ["product.optimizable"] : []),
    ...(!state.settings?.market_confirmed_at ? ["market.confirmed"] : []), ...(!pricing || pricing.currency !== state.catalog.currency ? ["pricing.unit_cost_minor"] : []),
    ...(!state.context?.base_reference_image_id ? ["images.base"] : []),
    ...(!offer || !offer.financial_snapshot || offer.pricing_stamp !== pricing?.pricing_stamp || offer.policies_stamp !== canonicalHash(state.settings as JsonValue) ? ["offer.current_pricing_and_policies"] : []),
    ...(restrictions.length ? ["facts.verified_and_approved"] : []), ...(stale ? ["strategy.current_snapshot"] : []),
  ];
  if (include === "core") { snapshot.objections = []; snapshot.customer_language = []; snapshot.angles.forEach((angle) => { angle.generation_guidance = null; }); }
  return { id: version.id, state: version.state, analysis_revision: version.analysis_revision, selection_revision: version.selection_revision,
    current_revision: read.current_revision, include, snapshot, readiness: { ready_for_execution: missing.length === 0 && !needsReview, stale, needs_review: needsReview, missing_fields: missing } };
}
export function prepareStrategy(read: KnowledgeRead, input: ToolInputs["set_product_strategy"], principal: Principal, requestId: string, id: string) {
  checkRevision(input.expected_revision, read.current_revision);
  const selected = read.strategy;
  let version: StoredStrategy | null = null, archive: { id: string; reason: string } | null = null, noOp = false;
  let activeId = read.activeStrategyId;
  if (input.action === "archive") {
    const previous = read.requestedStrategy;
    if (!previous || previous.id !== input.strategy_id) throw new ProductIntelligenceError("NOT_FOUND", "No encontramos esa estrategia.");
    noOp = previous.state === "archived";
    version = { ...previous, state: "archived" }; archive = { id: previous.id, reason: input.reason };
    if (activeId === previous.id) activeId = null;
  } else {
    checkRevision(input.based_on_revision, read.current_revision);
    const snapshot = buildStrategySnapshot(read.graph, principal.userId, input.product_id, input);
    const hash = operationalHash(read);
    noOp = input.action === "select" && !!selected && selected.state === "selected" && canonicalHash(selected.snapshot) === canonicalHash(snapshot) && selected.operational_hash === hash;
    version = noOp ? selected : { id, state: input.action === "select" ? "selected" : "draft", snapshot,
      analysis_revision: read.current_revision, selection_revision: input.action === "select" ? read.current_revision + 1 : null, operational_hash: hash };
    if (input.action === "select") activeId = version!.id;
  }
  const revision = read.current_revision + (!noOp && !input.dry_run ? 1 : 0);
  const response = version ? strategyResponse(version, { ...read, current_revision: revision, currentActiveStrategyId: activeId }, input.product_id) : null;
  const result: ToolOutputs["set_product_strategy"] = { ok: true, product_id: input.product_id, request_id: requestId, revision, warnings: [], data: {
    applied: !noOp && !input.dry_run, dry_run: input.dry_run, no_op: noOp, strategy: input.dry_run ? null : response,
    preview: input.dry_run && input.action !== "archive" ? version!.snapshot : null, active_strategy_id: input.dry_run ? read.activeStrategyId : activeId } };
  return { result, strategy: input.action !== "archive" && !noOp ? version : null, archive: !noOp ? archive : null };
}
/** Guardar receipts demasiado grandes dejaría un commit sin respuesta transportable. */
export function boundedResult<T>(result: T): T { jsonBytes(result, 60000, true); return result; }
