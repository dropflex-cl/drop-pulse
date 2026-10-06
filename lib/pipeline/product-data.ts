import "server-only";
import { randomUUID } from "node:crypto";
import type { ProductData } from "@/lib/products/product-data";
import { ProductIntelligenceError } from "@/lib/product-intelligence/errors";
import { createContextExecutor } from "@/lib/product-intelligence/service";
import { createContextRepository, contextAccess } from "@/lib/product-intelligence/repository";
import { parseContextRead } from "@/lib/product-intelligence/context";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { parseToolOutput } from "@/lib/product-intelligence/validation";
import type { ToolInputs } from "@/lib/product-intelligence/schemas";

/** CAS de los datos base que vio el navegador; precio/aprendizaje independientes no invalidan el formulario. */
export async function saveBasicContext(userId: string, productId: string, context: NonNullable<ToolInputs["save_product_context"]["context"]>, expectedContextRevision: number) {
  if (!Number.isSafeInteger(expectedContextRevision) || expectedContextRevision < 0) throw new ProductIntelligenceError("VALIDATION_ERROR", "Actualiza la página antes de editar el contexto.");
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const repository = createContextRepository();
  const read = parseContextRead(await repository.load({ p_access: contextAccess(principal), p_product_id: productId }, AbortSignal.timeout(10000)));
  if ((read.snapshot.context?.last_revision ?? 0) !== expectedContextRevision) throw new ProductIntelligenceError("REVISION_CONFLICT", "Los datos del producto cambiaron desde tu lectura. Actualiza la página antes de guardar.");
  const result = parseToolOutput("save_product_context", await createContextExecutor(repository)(principal, { tool: "save_product_context", input: {
    product_id: productId, schema_version: "1.0", expected_revision: read.current_revision, idempotency_key: `ui-context:${randomUUID()}`, dry_run: false, context,
  } }, AbortSignal.timeout(10000)));
  if (!result.ok) throw new ProductIntelligenceError(result.error.code, result.error.message);
  return { expected_revision: result.revision, expected_context_revision: result.data.no_op ? expectedContextRevision : result.revision, savedAt: new Date().toISOString() };
}

export async function saveProductData(userId: string, productId: string, data: ProductData, expectedContextRevision: number): Promise<ProductData> {
  const saved = await saveBasicContext(userId, productId, { display_name: data.name, description: data.description }, expectedContextRevision);
  return { ...data, ...saved, source: "mcp_chat", updated_at: String(saved.expected_context_revision) };
}
