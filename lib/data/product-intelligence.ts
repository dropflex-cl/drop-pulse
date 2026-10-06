import "server-only";
import { requireUser } from "@/lib/integrations/session";
import { createProductIntelligenceExecutor } from "@/lib/product-intelligence/knowledge-service";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { parseToolInput, parseToolOutput } from "@/lib/product-intelligence/validation";
import type { ToolInputs } from "@/lib/product-intelligence/schemas";

/** Único loader UI del contexto canónico; sin lecturas directas a tablas PI desde componentes. */
export async function getProductIntelligenceContext(input: ToolInputs["get_product_context"]) {
  const user = await requireUser();
  const result = await createProductIntelligenceExecutor(createContextRepository())({ userId: user.id, actorId: user.id, actorKind: "merchant", scopes: PI_SCOPES },
    { tool: "get_product_context", input: parseToolInput("get_product_context", input) }, AbortSignal.timeout(10000));
  return parseToolOutput("get_product_context", result);
}

/** El caller servidor ya resolvió el dueño con withProduct/ownedProduct. */
export async function getLandingContextStale(userId: string, productId: string): Promise<boolean> {
  const result = await createContextRepository().loadLanding({ p_access: { user_id: userId, actor_id: userId, actor_kind: "merchant", scopes: [...PI_SCOPES] },
    p_product_id: productId }, AbortSignal.timeout(10000));
  if (!result || typeof result !== "object" || !("context_stale" in result) || typeof result.context_stale !== "boolean") throw new Error("No pudimos comprobar el contexto de la página.");
  return result.context_stale;
}
