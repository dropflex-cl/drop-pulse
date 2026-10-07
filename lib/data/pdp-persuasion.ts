import "server-only";
import { persuasionEnabled } from "@/lib/product-intelligence/persuasion-flags";
import { contextAccess, createContextRepository } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { persuasionReadSchema, persuasionValidationContext } from "@/lib/product-intelligence/persuasion-service";
import { parseKnowledgeRead } from "@/lib/product-intelligence/knowledge";
import { validatePersuasionPlan } from "@/lib/product-intelligence/persuasion-validation";
import { getProductRow } from "@/lib/products/store";
import type { PdpWorkbench } from "@/lib/types";

export async function getPdpWorkbench(userId: string, productId: string): Promise<PdpWorkbench | null> {
  if (!persuasionEnabled()) return null;
  const row = await getProductRow(userId, productId);
  if (!row?.pdp_persuasion_enabled) return null;
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const raw = persuasionReadSchema.parse(await createContextRepository().loadPersuasion({ p_access: contextAccess(principal), p_product_id: productId }, AbortSignal.timeout(10000)));
  const read = parseKnowledgeRead(raw.knowledge, principal, productId);
  const strategyId = read.strategy?.id;
  return { revision: read.current_revision, empty_etag: raw.empty_etag, planning_stamp: raw.planning_stamp,
    plans: raw.plans.filter(p => p.payload.strategy_id === strategyId).map(p => ({ ...p, issues: validatePersuasionPlan(p.payload, persuasionValidationContext(raw, principal, productId, p.payload.strategy_id)) })),
    experiences: raw.experiences.filter(e => e.payload.strategy_id === strategyId) };
}
