import { requireUser } from "@/lib/integrations/session";
import { createProductIntelligenceExecutor } from "@/lib/product-intelligence/knowledge-service";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import type { ToolInputs } from "@/lib/product-intelligence/schemas";
import { parseToolInput, parseToolOutput } from "@/lib/product-intelligence/validation";
import "server-only";
import { parseContextRead } from "@/lib/product-intelligence/context";
import { contextAccess } from "@/lib/product-intelligence/repository";
import { adminClient } from "@/lib/integrations/admin";
import { parseKnowledgeRead, strategyResponse } from "@/lib/product-intelligence/knowledge";

export async function getCanonicalProductData(userId: string, productId: string) {
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const read = parseContextRead(await createContextRepository().load({ p_access: contextAccess(principal), p_product_id: productId }, AbortSignal.timeout(10000)));
  return { name: read.snapshot.context?.display_name ?? "", description: read.snapshot.context?.description ?? "", source: "mcp_chat" as const,
    updated_at: String(read.snapshot.context?.last_revision ?? 0), expected_revision: read.current_revision, expected_context_revision: read.snapshot.context?.last_revision ?? 0, supplierText: read.snapshot.context?.supplier_text ?? "", hasContext: Boolean(read.snapshot.context) };
}

/** Lectura por lotes; los estados se derivan con la misma validación de estrategia que MCP. */
export async function getCanonicalProductStates(userId: string, ids: string[]) {
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const result = new Map<string, { hasContext: boolean; described: boolean; selected: boolean; ready: boolean }>();
  for (let i = 0; i < ids.length; i += 20) {
    const { data, error } = await adminClient().rpc("pi_load_ui_knowledge", { p_access: contextAccess(principal), p_ids: ids.slice(i, i + 20) });
    if (error) throw new Error("No pudimos leer el contexto de los productos.");
    for (const entry of data as { product_id: string; read: unknown }[]) {
      const read = parseKnowledgeRead(entry.read, principal, entry.product_id);
      const strategy = read.strategy ? strategyResponse(read.strategy, read, entry.product_id, "core") : null;
      result.set(entry.product_id, { hasContext: Boolean(read.snapshot.context), described: Boolean(read.snapshot.context?.display_name && read.snapshot.context.description),
        selected: Boolean(strategy), ready: strategy?.readiness.ready_for_execution ?? false });
    }
  }
  return result;
}

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

/** Lee la selección por el mismo servicio autorizado que MCP; no proyecta el análisis en tablas antiguas. */
export async function getSelectedProductStrategy(userId: string, productId: string) {
  const result = await createProductIntelligenceExecutor(createContextRepository())(
    { userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES },
    { tool: "get_product_strategy", input: { product_id: productId, include: "core" } }, AbortSignal.timeout(10000));
  const parsed = parseToolOutput("get_product_strategy", result);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.data;
}
