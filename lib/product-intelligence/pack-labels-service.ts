import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pricingPlanFromRow, type PricingRow } from "@/lib/pricing/rows";
import { labelsStale } from "@/lib/pricing/labels";
import { commandHash, canonicalHash } from "./concurrency";
import { ProductIntelligenceError } from "./errors";
import type { DomainExecutor } from "./mcp";
import type { DelegatedIdentity } from "./oauth";
import { checkArtifact, requireScopes, toolScopes, type Principal } from "./policy";
import { contextAccess, type PackLabelsRepository } from "./repository";
import { parseToolInput, parseToolOutput } from "./validation";
import { chatPackLabelsSchema } from "./pack-labels-schemas";
import { usablePackFacts, validateChatPackLabels } from "./pack-labels-validation";
import type { PackLabel } from "@/lib/pricing/labels-schemas";

const readSchema = z.object({ revision: z.number().int().nonnegative(), stamp: z.string(), pack_labels_etag: z.string(),
  current: z.record(z.string(), z.unknown()).nullable(),
  snapshot: z.object({ catalog: z.object({ currency: z.string() }).optional(), pricing: z.record(z.string(), z.unknown()).nullable(), knowledge: z.object({ graph: z.record(z.string(), z.array(z.unknown())) }) }),
});
export function parsePackLabelsRead(raw: unknown) {
  const parsed = readSchema.safeParse(raw);
  if (!parsed.success) throw new ProductIntelligenceError("INTERNAL_ERROR", "No pudimos leer las etiquetas de los packs.");
  return parsed.data;
}
export const PACK_LABEL_RULES = ["Una etiqueta por pack calculado, en su orden; no envíes precios derivados ni estados de aprobación.",
  "Máximo 80 caracteres de etiqueta, 100 de apoyo y 30 de distintivo; solo un pack puede tener distintivo.",
  "Duración solo con cantidad y unidad de facts aprobados/verificados y sin contradicción, referidos en duration_fact_ids. Se admiten múltiplos por unidades del pack.",
  "Sin HTML, tratamiento ni promesas de salud o resultados. Usa montos y porcentajes reales del pack.",
  "Si duration_facts_has_more es true, recupera los demás facts con get_product_context paginado. Con automatización Shopify activa, guardar aprueba las etiquetas; sin ella, se revisan en Información base. Este save no publica ni llama IA."];
export function createPackLabelsExecutor(repository: PackLabelsRepository, identity?: DelegatedIdentity): DomainExecutor {
  return async (principal, command, signal) => {
    if (command.tool !== "get_pack_labels" && command.tool !== "save_pack_labels") throw new ProductIntelligenceError("EXECUTION_NOT_READY", "Esta operación no es de etiquetas de packs.");
    requireScopes(principal, toolScopes[command.tool]);
    const input = parseToolInput(command.tool, command.input), write = command.tool === "save_pack_labels" ? parseToolInput("save_pack_labels", command.input) : null;
    const access = contextAccess(principal, identity), hash = write ? commandHash("save_pack_labels", write) : null;
    const raw = await repository.loadPackLabels({ p_access: access, p_product_id: input.product_id, p_key: write?.idempotency_key ?? null, p_hash: hash, p_dry_run: write?.dry_run ?? false }, signal);
    if (raw && typeof raw === "object" && "replay" in raw) return parseToolOutput("save_pack_labels", raw.replay);
    const read = parsePackLabelsRead(raw), plan = read.snapshot.pricing ? pricingPlanFromRow(read.snapshot.pricing as unknown as PricingRow) : null;
    const facts = usablePackFacts(read.snapshot.knowledge.graph, principal.userId, input.product_id);
    const factPage: { id: string; statement: string; value: unknown; unit: string | null }[] = [];
    let factBytes = 0;
    for (const { id, statement, value, unit } of facts) {
      const item = { id, statement, value, unit }, bytes = new TextEncoder().encode(JSON.stringify(item)).length;
      if (factPage.length >= 50 || factBytes + bytes > 20 * 1024) break;
      factPage.push(item); factBytes += bytes;
    }
    if (!write) return parseToolOutput("get_pack_labels", { ok: true, product_id: input.product_id, revision: read.revision, request_id: randomUUID(), data: {
      pack_labels_etag: read.pack_labels_etag, pricing: read.snapshot.pricing, current: read.current,
      pricing_stale: Boolean((plan && read.snapshot.catalog && read.snapshot.catalog.currency !== plan.currency) || read.current && (labelsStale(read.current.prices as { units: number; price: number }[], plan) ||
        ((read.current.provenance as { currency?: string } | undefined)?.currency && (read.current.provenance as { currency?: string }).currency !== plan?.currency))),
      evidence_stale: read.current?.evidence_stale ?? false,
      duration_facts: factPage, duration_facts_has_more: factPage.length < facts.length,
      contract: JSON.parse(JSON.stringify(z.toJSONSchema(chatPackLabelsSchema))), rules: PACK_LABEL_RULES,
      next_action: "Escribe etiquetas, valida con dry_run y guarda con save_pack_labels. Con automatización Shopify activa quedan aprobadas; sin ella, revisa en Información base.",
    } });
    if (!plan || read.snapshot.catalog && read.snapshot.catalog.currency !== plan.currency) throw new ProductIntelligenceError("VALIDATION_ERROR", "Guarda Precio y packs antes de escribir sus etiquetas.", { missing_fields: ["pricing"] });
    const labels = validateChatPackLabels(write.labels, plan, write.duration_fact_ids, read.snapshot.knowledge.graph, principal.userId, input.product_id);
    return parseToolOutput("save_pack_labels", await repository.commitPackLabels({ p_access: access, p_product_id: input.product_id, p_expected_revision: write.expected_revision,
      p_etag: write.expected_pack_labels_etag, p_stamp: read.stamp, p_key: write.idempotency_key, p_hash: hash, p_action: "propose",
      p_labels: labels, p_fact_ids: [...write.duration_fact_ids].sort(), p_dry_run: write.dry_run }, signal));
  };
}
/** La UI decide una propuesta exacta; comparte validación y la transacción con MCP. */
export async function decidePackLabels(repository: PackLabelsRepository, principal: Principal, productId: string,
  input: { action: "approve" | "reopen" | "edit"; expected_etag: string; labels?: PackLabel[]; approve?: boolean }, signal: AbortSignal) {
  requireScopes(principal, ["product_intelligence:write"]);
  const access = contextAccess(principal), read = parsePackLabelsRead(await repository.loadPackLabels({ p_access: access, p_product_id: productId }, signal));
  checkArtifact(input.expected_etag, read.pack_labels_etag);
  if (!read.current) throw new ProductIntelligenceError("NOT_FOUND", "Pide etiquetas desde el chat antes de revisarlas.");
  const plan = read.snapshot.pricing ? pricingPlanFromRow(read.snapshot.pricing as unknown as PricingRow) : null;
  if (!plan || read.snapshot.catalog && read.snapshot.catalog.currency !== plan.currency) throw new ProductIntelligenceError("VALIDATION_ERROR", "Guarda Precio y packs primero.");
  const provenance = (read.current.provenance ?? {}) as { duration_fact_ids?: string[] };
  const factIds = provenance.duration_fact_ids ?? [], labels = input.labels ?? read.current.payload as PackLabel[];
  // Los contenidos antiguos conservan su revisión humana; los de chat usan los facts actuales.
  const checked = read.current.source === "mcp_chat" && input.action !== "reopen" ? validateChatPackLabels(labels, plan, factIds, read.snapshot.knowledge.graph, principal.userId, productId) : labels;
  return repository.commitPackLabels({ p_access: access, p_product_id: productId, p_expected_revision: read.revision,
    p_etag: input.expected_etag, p_stamp: read.stamp, p_key: `ui-pack-labels:${randomUUID()}`, p_hash: canonicalHash({ ...input, productId }),
    p_action: input.action === "edit" && input.approve ? "edit_approve" : input.action, p_labels: checked, p_fact_ids: factIds, p_dry_run: false }, signal);
}
