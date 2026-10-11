import { createProductIntelligenceExecutor } from "@/lib/product-intelligence/knowledge-service";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { parseToolOutput } from "@/lib/product-intelligence/validation";
import "server-only";
import { parseContextRead } from "@/lib/product-intelligence/context";
import { contextAccess } from "@/lib/product-intelligence/repository";
import { adminClient } from "@/lib/integrations/admin";

export async function getCanonicalProductData(userId: string, productId: string) {
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const read = parseContextRead(await createContextRepository().load({ p_access: contextAccess(principal), p_product_id: productId }, AbortSignal.timeout(10000)));
  return { name: read.snapshot.context?.display_name ?? "", description: read.snapshot.context?.description ?? "", source: "mcp_chat" as const,
    updated_at: String(read.snapshot.context?.last_revision ?? 0), expected_revision: read.current_revision, expected_context_revision: read.snapshot.context?.last_revision ?? 0, supplierText: read.snapshot.context?.supplier_text ?? "", hasContext: Boolean(read.snapshot.context) };
}

/** Nombres guardados por MCP, en lectura autorizada por lotes. No calcula fases ni readiness. */
export async function getCanonicalProductNames(userId: string, ids: string[]) {
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const result = new Map<string, { hasContext: boolean; name: string }>();
  for (let i = 0; i < ids.length; i += 20) {
    const { data, error } = await adminClient().rpc("pi_load_ui_knowledge", { p_access: contextAccess(principal), p_ids: ids.slice(i, i + 20) });
    if (error) throw new Error("No pudimos leer el contexto de los productos.");
    for (const entry of data as { product_id: string; read: unknown }[]) {
      const read = parseContextRead(entry.read);
      result.set(entry.product_id, { hasContext: Boolean(read.snapshot.context), name: read.snapshot.context?.display_name ?? "" });
    }
  }
  return result;
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
