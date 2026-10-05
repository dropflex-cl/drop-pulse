import "server-only";
import { differentiatorSchema, type Differentiator, type ProductBrief } from "@/lib/ai/schemas";
import { adminClient } from "@/lib/integrations/admin";
import { latestBrief } from "@/lib/products/store";
import type { DifferentiatorView } from "@/lib/types";

// El diferenciador del producto: lo propone la estrategia (product_briefs.payload.differentiator) y el
// comerciante lo confirma o edita en Información base (products.differentiator). Lo confirmado manda.

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const parseDifferentiator = (raw: unknown): Differentiator | null => {
  if (!raw) return null;
  const parsed = differentiatorSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

/** El diferenciador que confirmó el comerciante, o null. */
export async function confirmedDifferentiator(userId: string, productId: string): Promise<Differentiator | null> {
  const { data, error } = await adminClient().from("products").select("differentiator").eq("user_id", userId).eq("id", productId).maybeSingle();
  fail("Leer el diferenciador", error);
  return parseDifferentiator(data?.differentiator);
}

/** Lo confirmado manda; si no hay, vale la propuesta de la ficha. */
export function differentiatorState(confirmed: Differentiator | null, brief: Pick<ProductBrief, "differentiator"> | null): DifferentiatorView {
  const proposed = parseDifferentiator(brief?.differentiator);
  // Una ficha escrita antes del diferenciador no trae la clave: la IA nunca lo buscó (≠ null, «no se sostiene»).
  const oldBrief = brief !== null && brief.differentiator === undefined;
  return { value: confirmed ?? proposed, confirmed: confirmed !== null, proposed, oldBrief };
}

export async function getDifferentiator(userId: string, productId: string): Promise<DifferentiatorView> {
  const [confirmed, brief] = await Promise.all([confirmedDifferentiator(userId, productId), latestBrief(userId, productId)]);
  return differentiatorState(confirmed, brief);
}

export async function saveDifferentiator(userId: string, productId: string, d: Differentiator): Promise<void> {
  const value = differentiatorSchema.parse(d);
  const { error } = await adminClient()
    .from("products")
    .update({ differentiator: value, differentiator_confirmed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", productId);
  fail("Guardar el diferenciador", error);
}
