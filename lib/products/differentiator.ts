import "server-only";
import { differentiatorSchema, type Differentiator } from "@/lib/ai/schemas";
import { adminClient } from "@/lib/integrations/admin";
import type { DifferentiatorView } from "@/lib/types";

// Diferenciador confirmado por el comerciante, sin fallback a análisis retirados.

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

export async function getDifferentiator(userId: string, productId: string): Promise<DifferentiatorView> {
  const value = await confirmedDifferentiator(userId, productId);
  return { value, confirmed: value !== null, proposed: null, oldBrief: false };
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
