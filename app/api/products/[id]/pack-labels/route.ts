import { NextResponse } from "next/server";
import { packLabelsSchema } from "@/lib/ai/schemas";
import { regeneratePackLabels } from "@/lib/pipeline/pack-labels";
import { normalizePackLabels, packPrices } from "@/lib/pricing/labels";
import { latestPackLabels, toPackLabelsProposal, updatePackLabels } from "@/lib/pricing/labels-store";
import { getPricingPlan } from "@/lib/pricing/store";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";

// Etiquetas de los packs (la IA propone, tú decides; aparte del cliente ideal):
// PATCH { action: "approve" | "reopen" } → aprobar o volver a revisión (el “Deshacer”)
// PUT   { labels, approve?: boolean }    → guardar lo editado (y, si approve, aprobarlo)
// POST                                   → otras etiquetas (una llamada a la IA, ~20 s)

export const maxDuration = 120;

async function current(userId: string, productId: string) {
  const row = await latestPackLabels(userId, productId);
  if (!row) throw new ProductApiError("Todavía no hay etiquetas para los packs. Optimiza con IA primero.", 409);
  return row;
}

async function respond(userId: string, productId: string) {
  const [row, pricing] = await Promise.all([latestPackLabels(userId, productId), getPricingPlan(userId, productId)]);
  return NextResponse.json({ packLabels: row ? toPackLabelsProposal(row, pricing) : null });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const { action } = await json<{ action: "approve" | "reopen" }>(req);
    const row = await current(userId, id);
    if (action === "approve") {
      // Aprobar deja constancia de los precios vigentes: son los que el comerciante revisó.
      const pricing = await getPricingPlan(userId, id);
      await updatePackLabels(userId, row.id, { status: "approved", decided_at: new Date().toISOString(), ...(pricing ? { prices: packPrices(pricing) } : {}) });
    } else if (action === "reopen") {
      await updatePackLabels(userId, row.id, { status: "in_review", decided_at: null });
    } else throw new ProductApiError("Acción desconocida.", 400, "action");
    return respond(userId, id);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    const body = await json<{ labels: unknown; approve: boolean }>(req);
    const parsed = packLabelsSchema.safeParse(body.labels);
    if (!parsed.success) throw new ProductApiError("Hay etiquetas vacías o con un formato inesperado. Revisa y vuelve a guardar.", 400, "labels");
    const [row, pricing] = await Promise.all([current(userId, id), getPricingPlan(userId, id)]);
    if (!pricing) throw new ProductApiError("Guarda el precio y los packs primero.", 409);
    const labels = normalizePackLabels(parsed.data, pricing.packs);
    if (labels.length !== pricing.packs.length) throw new ProductApiError("Cada pack necesita su etiqueta.", 400, "labels");
    const now = new Date().toISOString();
    await updatePackLabels(userId, row.id, {
      payload: labels,
      prices: packPrices(pricing),
      edited_at: now,
      ...(body.approve ? { status: "approved", decided_at: now } : { status: "in_review" }),
    });
    return respond(userId, id);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedProduct(id);
    await regeneratePackLabels(userId, id);
    return respond(userId, id);
  } catch (e) {
    return errorResponse(e, "No pudimos generar otras etiquetas. Intenta de nuevo en un momento.");
  }
}
