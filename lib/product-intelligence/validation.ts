import { ProductIntelligenceError } from "./errors";
import { inputSchemas, outputSchemas, type ToolInputs, type ToolName, type ToolOutputs } from "./schemas";

export const PI_LIMITS = { inputBytes: 256 * 1024, outputBytes: 128 * 1024, fieldBytes: 8 * 1024, valueDepth: 5 } as const;
const encoder = new TextEncoder();

/** Rechaza datos no JSON antes de stringify/Zod: ciclos, NaN, prototipos y getters. */
export function jsonBytes(value: unknown, maxBytes: number, output = false): number {
  const ancestors = new Set<object>();
  const code = output ? "RESPONSE_TOO_LARGE" : "PAYLOAD_TOO_LARGE";
  function visit(item: unknown, depth: number) {
    if (depth > 64) throw new ProductIntelligenceError(code, "El contenido tiene demasiados niveles.");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (typeof item === "string") {
      if (encoder.encode(item).length > PI_LIMITS.fieldBytes) throw new ProductIntelligenceError(code, "Un campo supera el máximo de 8 KiB.", { max_bytes: PI_LIMITS.fieldBytes });
      return;
    }
    if (typeof item !== "object") throw new ProductIntelligenceError("VALIDATION_ERROR", "Envía únicamente valores JSON.");
    if (ancestors.has(item)) throw new ProductIntelligenceError("VALIDATION_ERROR", "El contenido JSON no puede tener ciclos.");
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new ProductIntelligenceError("VALIDATION_ERROR", "Envía objetos JSON simples.");
    if (Object.getOwnPropertySymbols(item).length || Array.isArray(item) && Object.keys(item).some((key) => !/^(0|[1-9][0-9]*)$/.test(key))) throw new ProductIntelligenceError("VALIDATION_ERROR", "Envía propiedades JSON serializables.");
    if (Array.isArray(item) && Object.keys(item).length !== item.length) throw new ProductIntelligenceError("VALIDATION_ERROR", "Envía arrays JSON completos.");
    ancestors.add(item);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (key === "length" && Array.isArray(item)) continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new ProductIntelligenceError("VALIDATION_ERROR", "Envía objetos JSON sin propiedades ejecutables.");
      if (encoder.encode(key).length > PI_LIMITS.fieldBytes) throw new ProductIntelligenceError(code, "Una clave supera el máximo permitido.");
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
  }
  visit(value, 0);
  const bytes = encoder.encode(JSON.stringify(value)).length;
  if (bytes > maxBytes) throw new ProductIntelligenceError(code, "El contenido supera el tamaño permitido.", { max_bytes: maxBytes });
  return bytes;
}

export function validateFactValues(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach(validateFactValues); return; }
  const object = value as Record<string, unknown>;
  if (Object.hasOwn(object, "statement") && Object.hasOwn(object, "value")) {
    const depth = (item: unknown): number => item && typeof item === "object" ? 1 + Math.max(0, ...Object.values(item).map(depth)) : 0;
    if (depth(object.value) > PI_LIMITS.valueDepth) throw new ProductIntelligenceError("VALIDATION_ERROR", "El value del hecho supera cinco niveles.", { fields: ["facts.value"] });
    jsonBytes(object.value, PI_LIMITS.fieldBytes);
  }
  Object.values(object).forEach(validateFactValues);
}

export function parseToolInput<K extends ToolName>(tool: K, value: unknown): ToolInputs[K] {
  jsonBytes(value, PI_LIMITS.inputBytes);
  validateFactValues(value);
  if (value && typeof value === "object" && "schema_version" in value && value.schema_version !== "1.0" && !(tool === "save_landing_content" && value.schema_version === "1.1")) throw new ProductIntelligenceError("SCHEMA_VERSION_UNSUPPORTED", "Esta versión de contrato no está disponible.");
  const result = inputSchemas[tool].safeParse(value);
  if (!result.success) throw new ProductIntelligenceError("VALIDATION_ERROR", "Revisa los campos de la solicitud.", { fields: [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "input"))].slice(0, 100) });
  // Los esquemas existentes de Shopify quitan claves desconocidas. MCP debe rechazarlas:
  // ni URLs/HTML/estado de aprobación ni hechos adicionales se descartan en silencio.
  if (tool === "save_landing_content") {
    const sameKeys = (raw: unknown, parsed: unknown): boolean => {
      if (Array.isArray(raw)) return Array.isArray(parsed) && raw.every((item, i) => sameKeys(item, parsed[i]));
      if (raw && typeof raw === "object") return Boolean(parsed) && typeof parsed === "object" && Object.keys(raw).every((key) => Object.hasOwn(parsed!, key) && sameKeys((raw as Record<string, unknown>)[key], (parsed as Record<string, unknown>)[key]));
      return true;
    };
    if (!sameKeys(value, result.data)) throw new ProductIntelligenceError("VALIDATION_ERROR", "El contenido incluye campos que el componente no admite.", { fields: ["entries.content"] });
  }
  return result.data as ToolInputs[K];
}

export function parseToolOutput<K extends ToolName>(tool: K, value: unknown): ToolOutputs[K] {
  jsonBytes(value, PI_LIMITS.outputBytes, true);
  validateFactValues(value);
  const result = outputSchemas[tool].safeParse(value);
  if (!result.success) throw new ProductIntelligenceError("INTERNAL_ERROR", "La respuesta no cumple el contrato esperado.");
  return result.data as ToolOutputs[K];
}
