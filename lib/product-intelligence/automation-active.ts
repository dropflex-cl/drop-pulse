import "server-only";
import type { Principal } from "./policy";
import type { DelegatedIdentity } from "./oauth";
import { contextAccess, type ShopifyAutomationRepository, type KnowledgeRepository } from "./repository";
import { parseKnowledgeRead, strategyResponse, type KnowledgeRead } from "./knowledge";
import { automationStateSchema } from "./shopify-automation-schemas";

export async function automationActive(repository: Partial<ShopifyAutomationRepository>, principal: Principal,
  productId: string, identity: DelegatedIdentity | undefined, signal: AbortSignal): Promise<boolean> {
  if (!repository.shopifyAutomation) return false;
  const state = await repository.shopifyAutomation({ p_access: contextAccess(principal, identity), p_product_id: productId, p_action: "read" }, signal);
  return automationStateSchema.parse(state).active;
}

/** Las etiquetas se aprueban después del hook. Revisa todas las demás dependencias contra
 * la selección original, sin invalidar su dirección solo por aprobar esos nombres de packs. */
export async function shopifyStrategyRead(repository: Partial<KnowledgeRepository>, read: KnowledgeRead,
  principal: Principal, productId: string, identity: DelegatedIdentity | undefined, signal: AbortSignal): Promise<KnowledgeRead> {
  if (!read.strategy || strategyResponse(read.strategy, read, productId).readiness.ready_for_execution || !repository.loadKnowledge) return read;
  const selected = parseKnowledgeRead(await repository.loadKnowledge({ p_access: contextAccess(principal, identity),
    p_product_id: productId, p_revision: read.strategy.analysis_revision }, signal), principal, productId);
  return { ...read, currentSnapshot: { ...read.currentSnapshot, pack_labels: selected.snapshot.pack_labels } };
}
