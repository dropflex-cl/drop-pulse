import { createHash } from "node:crypto";
import { ProductIntelligenceError } from "./errors";
import { requireScopes, type PiScope, type Principal } from "./policy";
import type { JsonValue, ToolInputs, ToolName, ToolOutputs } from "./schemas";

const unorderedRelations = new Set(["jtbd_refs", "pain_refs", "desire_refs", "fact_refs", "objection_refs", "proof_fact_refs", "jtbd_ids", "pain_ids", "desire_ids", "fact_ids", "objection_ids", "proof_fact_ids", "approved_fact_ids", "duration_fact_ids"]);

function canonicalize(value: JsonValue, key = ""): JsonValue {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item));
    return unorderedRelations.has(key) ? items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en")) : items;
  }
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((field) => [field, canonicalize(value[field], field)]));
  return value;
}

export function canonicalHash(value: JsonValue): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function commandHash<K extends ToolName>(tool: K, input: ToolInputs[K]): string {
  const payload = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "idempotency_key" && key !== "dry_run"));
  return canonicalHash({ tool, payload } as JsonValue);
}

export interface IdempotencyReceipt<K extends ToolName> {
  tool: K;
  userId: string;
  productId: string;
  key: string;
  payloadHash: string;
  requiredScopes: readonly PiScope[];
  expiresAt: string;
  result: ToolOutputs[K];
}

/** Se llama bajo lock después de autorizar y antes del CAS; no guarda recibos. */
export function replayReceipt<K extends Exclude<ToolName, "list_products">>(receipt: IdempotencyReceipt<K> | null, principal: Principal, tool: K, input: ToolInputs[K] & { idempotency_key: string }, now: Date): ToolOutputs[K] | null {
  if ("dry_run" in input && input.dry_run) return null;
  if (!receipt || !Number.isFinite(new Date(receipt.expiresAt).getTime()) || new Date(receipt.expiresAt).getTime() <= now.getTime()) return null;
  if (receipt.userId !== principal.userId || receipt.productId !== input.product_id || receipt.tool !== tool || receipt.key !== input.idempotency_key) throw new ProductIntelligenceError("NOT_FOUND", "No encontramos la solicitud.");
  requireScopes(principal, receipt.requiredScopes);
  if (receipt.payloadHash !== commandHash(tool, input)) throw new ProductIntelligenceError("IDEMPOTENCY_KEY_REUSED", "Esta clave ya se usó con otro contenido. Envía una clave nueva.");
  return structuredClone(receipt.result);
}
