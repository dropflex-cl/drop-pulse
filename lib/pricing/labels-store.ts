import "server-only";
import type { PackLabel } from "@/lib/ai/schemas";
import { adminClient } from "@/lib/integrations/admin";
import { toUiStatus, type DbContentStatus } from "@/lib/products/store";
import type { PackLabelsProposal } from "@/lib/types";
import { labelsStale, normalizePackLabels, packPrices } from "./labels";
import type { PricingPlan } from "./plan";

// pack_labels: la propuesta vigente de etiquetas de un producto (la última que no se rechazó). La IA
// propone (`generated`) y el comerciante decide, igual que con el cliente ideal.

export interface PackLabelsRow {
  id: string;
  product_id: string;
  status: DbContentStatus;
  payload: PackLabel[];
  prices: { units: number; price: number }[];
  edited_at: string | null;
  created_at: string;
}

const COLUMNS = "id, product_id, status, payload, prices, edited_at, created_at";

export async function latestPackLabels(userId: string, productId: string): Promise<PackLabelsRow | null> {
  const { data, error } = await adminClient()
    .from("pack_labels")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("product_id", productId)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Leer las etiquetas: ${error.message}`);
  return (data as PackLabelsRow | null) ?? null;
}

export function toPackLabelsProposal(r: PackLabelsRow, plan: Pick<PricingPlan, "packs"> | null | undefined): PackLabelsProposal {
  return {
    id: r.id,
    status: toUiStatus(r.status),
    labels: r.payload,
    stale: labelsStale(r.prices, plan),
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

/** Cambia la propuesta vigente (aprobar, volver a revisión o guardar lo editado). */
export async function updatePackLabels(userId: string, id: string, patch: Record<string, unknown>): Promise<PackLabelsRow> {
  const { data, error } = await adminClient()
    .from("pack_labels")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Guardar las etiquetas: ${error.message}`);
  return data as PackLabelsRow;
}
