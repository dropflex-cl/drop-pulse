import "server-only";
import { contextAccess, createContextRepository } from "@/lib/product-intelligence/repository";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { persuasionReadSchema } from "@/lib/product-intelligence/persuasion-service";
import { parseKnowledgeRead } from "@/lib/product-intelligence/knowledge";
import type { PdpWorkbench } from "@/lib/types";

export async function getPdpWorkbench(userId: string, productId: string): Promise<PdpWorkbench | null> {
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const raw = persuasionReadSchema.parse(await createContextRepository().loadPersuasion({ p_access: contextAccess(principal), p_product_id: productId }, AbortSignal.timeout(10000)));
  const read = parseKnowledgeRead(raw.knowledge, principal, productId);
  return { revision: read.current_revision, empty_etag: raw.empty_etag, planning_stamp: raw.planning_stamp,
    plans: raw.plans.map(p => ({ ...p, issues: [] })),
    experiences: raw.experiences.filter(e => e.payload.status === "active") };
}
