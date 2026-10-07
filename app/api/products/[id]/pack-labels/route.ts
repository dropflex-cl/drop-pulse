import { packLabelsSchema } from "@/lib/ai/schemas";
import { normalizePackLabels } from "@/lib/pricing/labels";
import { latestPackLabels, toPackLabelsProposal } from "@/lib/pricing/labels-store";
import { getPricingPlan } from "@/lib/pricing/store";
import { decidePackLabels } from "@/lib/product-intelligence/pack-labels-service";
import { PI_SCOPES } from "@/lib/product-intelligence/policy";
import { createContextRepository } from "@/lib/product-intelligence/repository";
import { errorResponse, json, ownedProduct, ProductApiError } from "@/lib/products/http";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;
const etag = z.string().regex(/^[a-f0-9]{64}$/);
async function respond(userId: string, productId: string) {
  const [row, pricing] = await Promise.all([latestPackLabels(userId, productId), getPricingPlan(userId, productId)]);
  return NextResponse.json({ packLabels: row ? toPackLabelsProposal(row, pricing) : null });
}
async function decide(userId: string, productId: string, input: Parameters<typeof decidePackLabels>[3]) {
  return decidePackLabels(createContextRepository(), { userId, actorId: userId, actorKind: "merchant", scopes: PI_SCOPES }, productId, input, AbortSignal.timeout(10000));
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, { userId } = await ownedProduct(id);
    const body = z.strictObject({ action: z.enum(["approve", "reopen"]), expected_etag: etag }).safeParse(await json(req));
    if (!body.success) throw new ProductApiError("Recarga la página y revisa las etiquetas antes de decidir.", 409);
    await decide(userId, id, body.data);
    return respond(userId, id);
  } catch (e) { return errorResponse(e); }
}
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params, { userId } = await ownedProduct(id);
    const body = z.strictObject({ labels: packLabelsSchema, approve: z.boolean(), expected_etag: etag }).safeParse(await json(req));
    if (!body.success) throw new ProductApiError("Revisa las etiquetas o recarga la página antes de guardar.", 409);
    const pricing = await getPricingPlan(userId, id);
    if (!pricing) throw new ProductApiError("Guarda el precio y los packs primero.", 409);
    const labels = normalizePackLabels(body.data.labels, pricing.packs);
    if (labels.length !== pricing.packs.length) throw new ProductApiError("Cada pack necesita su etiqueta.", 400, "labels");
    await decide(userId, id, { ...body.data, labels, action: "edit" });
    return respond(userId, id);
  } catch (e) { return errorResponse(e); }
}
