import "server-only";
import type { Principal } from "./policy";
import type { DelegatedIdentity } from "./oauth";
import { contextAccess, type ShopifyAutomationRepository, type KnowledgeRepository } from "./repository";
import { type KnowledgeRead } from "./knowledge";
import { automationStateSchema } from "./shopify-automation-schemas";

export async function automationActive(repository: Partial<ShopifyAutomationRepository>, principal: Principal,
  productId: string, identity: DelegatedIdentity | undefined, signal: AbortSignal): Promise<boolean> {
  if (!repository.shopifyAutomation) return false;
  const state = await repository.shopifyAutomation({ p_access: contextAccess(principal, identity), p_product_id: productId, p_action: "read" }, signal);
  return automationStateSchema.parse(state).active;
}

/** Compatibilidad de consumidores: siempre devolver el contexto vigente. */
export async function shopifyStrategyRead(_repository: Partial<KnowledgeRepository>, read: KnowledgeRead,
  _principal: Principal, _productId: string, _identity: DelegatedIdentity | undefined, _signal: AbortSignal): Promise<KnowledgeRead> {
  void _repository; void _principal; void _productId; void _identity; void _signal;
  return read;
}
