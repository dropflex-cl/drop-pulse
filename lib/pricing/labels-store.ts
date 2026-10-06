import "server-only";
import { createContextRepository, contextAccess } from "@/lib/product-intelligence/repository";
import { parsePackLabelsRead } from "@/lib/product-intelligence/pack-labels-service";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import type { PackLabel } from "@/lib/ai/schemas";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { PackLabelsProposal } from "@/lib/types";
import { packLabelsStale } from "./labels";
import type { PricingPlan } from "./plan";

// pack_labels: el chat propone (`generated`) y el comerciante decide.
// La lectura y la decisión participan del servicio común y del lock del producto.

export interface PackLabelsRow {
  id: string;
  evidence_stale?: boolean;
  catalog_currency?: string;
  source?: "legacy" | "mcp_chat";
  etag?: string;
  provenance?: { currency?: string; duration_fact_ids?: string[] };
  product_id: string;
  status: DbContentStatus;
  payload: PackLabel[];
  prices: { units: number; price: number }[];
  edited_at: string | null;
  created_at: string;
}

export async function latestPackLabels(userId: string, productId: string): Promise<PackLabelsRow | null> {
  const principal = { userId, actorId: userId, actorKind: "merchant" as const, scopes: PI_SCOPES };
  const read = parsePackLabelsRead(await createContextRepository().loadPackLabels({ p_access: contextAccess(principal), p_product_id: productId }, AbortSignal.timeout(10000)));
  return read.current ? { ...read.current, etag: read.pack_labels_etag } as unknown as PackLabelsRow : null;
}

export function toPackLabelsProposal(r: PackLabelsRow, plan: Pick<PricingPlan, "packs"> & Partial<Pick<PricingPlan, "currency">> | null | undefined): PackLabelsProposal {
  return {
    id: r.id,
    source: r.source,
    etag: r.etag,
    status: toUiStatus(r.status),
    labels: r.payload,
    stale: packLabelsStale(r, plan),
    prices: r.prices,
    createdAt: r.created_at,
    editedAt: r.edited_at ?? undefined,
  };
}
