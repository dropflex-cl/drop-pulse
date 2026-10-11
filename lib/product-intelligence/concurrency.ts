import { createHash } from "node:crypto";
import type { JsonValue, ToolInputs, ToolName } from "./schemas";

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
