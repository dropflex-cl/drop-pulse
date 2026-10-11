import { contextPricing, productContextResponse } from "./context";
import { canonicalHash } from "./concurrency";
import { cursorBinding, signContextCursor, type ContextCursor } from "./context-cursor";
import { ProductIntelligenceError } from "./errors";
import { type RecordKind } from "./graph";
import { strategyResponse, type KnowledgeRead } from "./knowledge";
import type { Principal } from "./policy";
import type { JsonValue, ToolInputs, ToolOutputs } from "./schemas";

type Response = Extract<ToolOutputs["get_product_context"], { ok: true }>;
const blockKinds: Partial<Record<Response["data"]["blocks"][number]["name"], readonly RecordKind[]>> = {
  facts: ["Fact"], research: ["Source", "EvidenceLink"], personas: ["persona"], jtbd: ["jtbd"], pains: ["pain"], desires: ["desire"],
  objections: ["objection"], angles: ["angle"], customer_language: ["customer_language"], offer: ["offer"],
};
const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
export function knowledgeContextResponse(read: KnowledgeRead, input: ToolInputs["get_product_context"], principal: Principal, requestId: string, secret: string, cursor?: ContextCursor): Response {
  const result = productContextResponse(read, { ...input, cursor: undefined }, requestId);
  if (!result.ok) throw new Error("context");
  const strategy = read.strategy ? strategyResponse(read.strategy, read, input.product_id, input.view === "summary" ? "core" : "execution") : null;
  result.data.active_strategy_id = read.activeStrategyId;
  if (strategy) result.data.readiness = strategy.readiness;
  const pricing = contextPricing(read.snapshot), policiesStamp = canonicalHash(read.snapshot.settings as JsonValue);
  const page: { block: Response["data"]["blocks"][number]; item: Response["data"]["blocks"][number]["items"][number] }[] = [];
  for (const block of result.data.blocks) {
    if (block.name === "performance") { block.summary = "Consulta get_product_performance con fechas explícitas y get_product_learning para recuperar mediciones y aprendizajes. Las métricas actuales no forman parte de esta revisión histórica."; continue; }
    if (block.name === "strategy") { block.strategy = strategy; block.count = strategy ? 1 : 0; continue; }
    const kinds = blockKinds[block.name];
    if (!kinds) continue;
    const records = kinds.flatMap((kind) => read.graph[kind].map(({ value }) => ({ kind, value }))).filter(({ value }) => input.include_archived || !("lifecycle" in value) || value.lifecycle === "active");
    records.sort((a, b) => ("priority" in a.value ? a.value.priority : 0) - ("priority" in b.value ? b.value.priority : 0) || a.value.id.localeCompare(b.value.id));
    block.count = records.length;
    block.summary = block.name === "research" ? read.methodologicalNotes ?? `${read.graph.Source.length} fuentes y ${read.graph.EvidenceLink.length} enlaces de evidencia.` : records.length ? `${records.length} registros${input.include_archived ? "" : " activos"}.` : null;
    for (const { value } of records) {
      const summary = "name" in value ? value.name : "statement" in value ? value.statement : "desired_progress" in value ? value.desired_progress : "description" in value ? value.description : "desired_outcome" in value ? value.desired_outcome : "objection" in value ? value.objection : "text" in value ? value.text : "title" in value ? value.title : "fragment" in value ? value.fragment : "Registro";
      const projected = "financial_snapshot" in value ? { ...value, stale: value.stale || value.pricing_stamp !== pricing?.pricing_stamp || value.policies_stamp !== policiesStamp } : value;
      page.push({ block, item: input.view === "full" ? projected : { id: value.id, summary, provenance: "canonical", strategy_id: null, analysis_revision: value.last_revision } });
    }
  }
  const start = cursor?.offset ?? 0;
  if (start > page.length) throw new ProductIntelligenceError("CURSOR_INVALID", "El cursor no corresponde a esta lectura.");
  const budget = 55000; // El SDK incluye JSON estructurado y texto idéntico en su presupuesto de 128 KiB.
  let size = bytes(result), end = start;
  if (size > budget) throw new ProductIntelligenceError("RESPONSE_TOO_LARGE", "El contexto fijo supera el límite. Solicita menos bloques o usa get_product_strategy por separado.");
  for (; end < page.length && end - start < input.page_size; end++) {
    const next = page[end]; const cost = bytes(next.item) + 1;
    if (size + cost > budget) break;
    next.block.items.push(next.item); size += cost;
  }
  if (end === start && end < page.length) throw new ProductIntelligenceError("RESPONSE_TOO_LARGE", "Un registro completo no cabe en la respuesta. Reduce su contenido antes de continuar.");
  // El campo sigue disponible para clientes anteriores; la evidencia no restringe el contenido.
  result.data.current_usage_restrictions = [];
  if (bytes(result) > 60000) throw new ProductIntelligenceError("RESPONSE_TOO_LARGE", "Solicita menos bloques o un page_size menor.");
  if (end < page.length) {
    result.data.truncated = true;
    result.data.next_cursor = signContextCursor({ binding: cursorBinding(principal, input), revision: read.revision, offset: end,
      expires: cursor?.expires ?? Math.floor(Date.now() / 1000) + 900 }, secret);
  }
  return result;
}
