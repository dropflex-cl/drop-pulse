import "server-only";
import { createContextRepository, contextAccess } from "@/lib/product-intelligence/repository";
import { parsePackLabelsRead } from "@/lib/product-intelligence/pack-labels-service";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { ProductIntelligenceError } from "@/lib/product-intelligence/errors";
import type { PackLabel } from "@/lib/ai/schemas";
import { adminClient } from "@/lib/integrations/admin";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { PackLabelsProposal } from "@/lib/types";
import { packLabelsStale, normalizePackLabels, packPrices } from "./labels";
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

/** Se comprueba antes de llamar un proveedor; el trigger cubre el writer legacy ya en vuelo. */
export async function requireLegacyPackLabels(userId: string, productId: string) {
  const { data, error } = await adminClient().from("pack_labels").select("id").eq("product_id", productId).eq("user_id", userId).eq("source", "mcp_chat").limit(1);
  if (error) throw new Error(`Leer el origen de las etiquetas: ${error.message}`);
  if (data?.length) throw new ProductIntelligenceError("ARTIFACT_CONFLICT", "Estas etiquetas se escriben en el chat. Pide otra propuesta desde el MCP.");
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

/** Guarda lo que propuso la IA en una corrida. La propuesta anterior sin aprobar queda rechazada (recuperable). */
export async function saveGeneratedPackLabels(
  run: { id: string | null; user_id: string; product_id: string },
  labels: PackLabel[],
  plan: PricingPlan,
  meta: { promptVersion: number; model: string },
) {
  await requireLegacyPackLabels(run.user_id, run.product_id);
  const clean = normalizePackLabels(labels, plan.packs);
  if (!clean.length) return;
  const db = adminClient();
  const archived = await db
    .from("pack_labels")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("product_id", run.product_id)
    .in("status", ["generated", "in_review"]);
  if (archived.error) throw new Error(`Archivar las etiquetas anteriores: ${archived.error.message}`);
  const { error } = await db.from("pack_labels").insert({
    product_id: run.product_id,
    user_id: run.user_id,
    run_id: run.id,
    payload: clean,
    prices: packPrices(plan),
    status: "generated",
    prompt_version: meta.promptVersion,
    model: meta.model,
  });
  if (error) throw new Error(`Guardar las etiquetas: ${error.message}`);
}
